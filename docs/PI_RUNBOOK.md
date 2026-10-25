# Raspberry Pi 5 (4GB RAM) Production Runbook

Target Device: Raspberry Pi 5 Model B (4GB RAM, 32GB MicroSD, Active Cooler)  
Runtime: Node.js 20+ LTS, Ollama Daemon (qwen2.5:1.5b & qwen2.5:3b)  
Primary Goal: Zero-crash multi-user stability, MicroSD longevity, and latency control under 4GB RAM.  

---

## 1. Hardware Constraints and Baseline Strategy

- Physical RAM: 4096 MB (Shared with VideoCore GPU, ~3800 MB usable by Linux kernel)
- Storage: MicroSD Card 32GB (Class 10 / A1 / A2)
- Cooling: Official Raspberry Pi Active Cooler (PWM fan + heatsink)
- Concurrency Reality: Ollama model `qwen2.5:1.5b` requires ~1.2 GB resident RAM; `qwen2.5:3b` requires ~2.4 GB. Running multiple parallel model inferences on 4GB RAM will trigger Linux OOM-killer (`Out of memory: Kill process`).
- MicroSD Flash Wear Hazard: Swapping to an SD card causes high write latency (100-300ms I/O wait) and burns flash memory cells rapidly. Disk swapping must be disabled in favor of in-memory compressed ZRAM.

---

## 2. Memory Setup: Linux ZRAM Configuration

ZRAM creates a compressed block device in physical RAM. With lz4 compression (~2:1 ratio), 2GB of RAM is compressed to store up to 4GB of data, entirely eliminating SD card swap wear.

### Step 1: Install ZRAM tools
```bash
sudo apt update
sudo apt install -y zram-tools
```

### Step 2: Configure ZRAM swap
Edit `/etc/default/zramswap`:
```ini
# Allocation percentage of RAM for ZRAM
PERCENT=50
# Fast compression algorithm suitable for ARM Cortex-A76
ALGO=lz4
# High swappiness to prefer compressed RAM over dropping page cache
PRIORITY=100
```

Restart ZRAM service:
```bash
sudo systemctl restart zramswap
```

Verify ZRAM status:
```bash
zramctl
# Expected output: /dev/zram0 with lz4 algorithm and ~1.9G-2.0G disksize
```

### Step 3: Disable SD card swapfile (dphys-swapfile)
To completely prevent the kernel from writing swap data to the MicroSD card:
```bash
sudo systemctl stop dphys-swapfile
sudo systemctl disable dphys-swapfile
sudo dphys-swapfile swapoff
```

---

## 3. Ollama Daemon Configuration

Configure Ollama systemd service to enforce single-worker execution and warm model caching.

### Step 1: Edit Ollama systemd override
```bash
sudo systemctl edit ollama.service
```

Add the following environment configuration:
```ini
[Service]
# Restrict to 1 parallel inference stream to fit in 4GB RAM
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
# Keep model in RAM for 2 minutes to prevent repeated disk loading during active chat
Environment="OLLAMA_KEEP_ALIVE=2m"
# Bind to all interfaces for LAN access from laptop client
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

### Step 2: Reload and restart Ollama
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Verify models are downloaded and ready:
```bash
# Pull both Lite Mode (1.5B) and Advanced Mode (3B) models
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:3b
ollama list
# Should display qwen2.5:1.5b (approx 986 MB) and qwen2.5:3b (approx 1.9 GB)
```

---

## 4. Local AI Agent Systemd Service Setup

Create an automated systemd service to ensure the agent starts at boot and restarts on crash.

Create `/etc/systemd/system/local-ai-agent.service`:
```ini
[Unit]
Description=Local AI Agent Backend Service
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Local-AI-Agent
# Enforce 512MB max heap size for Node.js process
ExecStart=/usr/bin/node --max-old-space-size=512 AI-Agent/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=OLLAMA_MODEL=qwen2.5:1.5b
Environment=OLLAMA_HOST=http://127.0.0.1:11434
# Optional: Set Tavily API Key for high-speed AI web search (DuckDuckGo fallback will be used if omitted)
# Environment=TAVILY_API_KEY=tvly-xxxxxxxxxxxx

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable local-ai-agent
sudo systemctl start local-ai-agent
```

---

## 5. Multi-User Classroom Demo Architecture

When multiple students or the lecturer send queries simultaneously:

1. **FIFO Serialization (`RequestQueue`)**:
   - All incoming `/api/chat` requests enter an in-memory queue.
   - Requests are processed one at a time by the local Ollama daemon.
   - Max queue capacity: 10 concurrent requests.
   - If the queue exceeds 10, the server immediately returns HTTP 503 (`Server busy: Queue is full`) rather than crashing the system.

2. **Session Memory Isolation**:
   - Each student browser tab sends its unique `sessionId` (stored in `localStorage`).
   - Conversations are isolated per `sessionId` in the in-memory Turn Ledger.
   - When a student clicks "New Chat", `DELETE /api/chat/session/:sessionId` frees memory.

3. **Telemetry & Health Monitoring**:
   - Inspect live system health, queue depth, and memory usage:
     ```bash
     curl http://localhost:3000/api/health
     ```

---

## 6. Real-Time Telemetry and Troubleshooting

Run these commands during live classroom demonstrations:

### Check Memory & ZRAM
```bash
free -h
# Look at 'used' RAM (target: under 2.8 GB total) and 'Swap' (ZRAM compressed)
zramctl
```

### Check CPU Load & Process Order
```bash
htop
# Filter by 'ollama' and 'node'
```

### Check Temperature (Active Cooler)
```bash
vcgencmd measure_temp
# Target: Below 65C under load with active cooler
```

### Check Live Agent Logs
```bash
journalctl -u local-ai-agent -f
```
