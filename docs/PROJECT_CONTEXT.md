# Project Context & AI Agent Master Specification

**Project Name:** Local-AI-Agent (Edge AI Assistant for Raspberry Pi 5)  
**Role:** AI Agent Developer & System Architect  
**Target Hardware:** Raspberry Pi 5 (4GB RAM) with Local Ollama Runtime  
**Client Display:** Laptop / Tablet Web Browser (Web Chat UI & Zero-CPU Animated Avatar)  
**Version:** 2.1.0 (Linux Assistant, Runqueue v2, Telemetry Engine & Dual-Model Architecture)  

---

## 1. Project Background & Vision

โปรเจกต์นี้เป็นการปรับปรุงและต่อยอดจากแนวคิดของโครงการโอเพนซอร์ส [Max Headbox](https://github.com/syxanash/maxheadbox) โดยดัดแปลงให้ทำงานเป็นระบบ Local AI Assistant แบบกระจายศูนย์ (Distributed System) ภายในงบประมาณฮาร์ดแวร์จำกัด

### เป้าหมายหลักของระบบ:
1. **100% Local Inference:** การประมวลผลของโมเดลภาษา (LLM) เกิดขึ้นบนบอร์ด Raspberry Pi 5 ผ่าน Ollama ในเครื่อง โดยไม่ต้องพึ่งพาคลาวด์หรือเสียค่าใช้จ่ายผ่าน API ภายนอก (ยกเว้นบริการค้นหาเว็บทางเลือก)
2. **Distributed Architecture:** Raspberry Pi 5 ทำหน้าที่เป็นเซิร์ฟเวอร์ประมวลผลหลัก (Headless Edge AI Server) ในขณะที่เครื่องแล็ปท็อปของนักศึกษาเชื่อมต่อผ่านเครือข่ายภายใน (LAN) เพื่อแสดงผลหน้าเว็บแชตและใบหน้าอวตาร (Animated Avatar) ทำให้ไม่จำเป็นต้องต่อหน้าจอแยกเข้ากับบอร์ด Pi
3. **Adaptive RAG & Deterministic Tooling:** ระบบผสมผสานการตัดสินใจแบบ 0 ms (Deterministic Router), การจำกัดการค้นหาตามโหมดเครื่องมือ 4 โหมด (Auto, Chat, Search, Linux), การสังเคราะห์คำตอบแบบไม่เปลืองโทเค็น (Answer Composer), และการสืบค้นเว็บแบบสองชั้น (Tavily AI Search / DuckDuckGo HTML Lite)

---

## 2. Distributed System Architecture & Interactive Diagrams

การเปิดเว็บเบราว์เซอร์บน Raspberry Pi 5 ที่มีแรมเพียง 4GB เพื่อรัน Agent จะทำให้หน่วยความจำไม่เพียงพอและเกิดอาการค้าง ดังนั้นเราจึงแยกส่วน AI Agent ออกมาเป็น Headless Node.js **Deep Module** ทำงานบน Raspberry Pi 5 โดยตรง และเปิดเผย Interface ที่เรียบง่าย (`runAgent`) ให้ฝั่ง Backend เรียกใช้งาน

### แผนผังสถาปัตยกรรมแบบ Interactive (เปิดแล้วกด Export รูป SVG/PNG ไปทำสไลด์ได้ทันที):

- **[1. แผนผังภาพรวมระบบ: เปิดดูออนไลน์](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/system-architecture.html) | [เปิดบน Localhost](http://localhost:3000/architecture/system-architecture.html)** — แสดงการทำงานร่วมกันของ Client Tier, Express & Linux Runqueue v2, และ AI Agent Core บน Raspberry Pi 5
- **[2. แผนผังแกนประมวลผล AI: เปิดดูออนไลน์](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/ai-agent-pipeline.html) | [เปิดบน Localhost](http://localhost:3000/architecture/ai-agent-pipeline.html)** — แสดงลำดับการทำงานภายในโมดูล `AI-Agent/` ตั้งแต่รับข้อความจนถึงการตรวจสอบคุณภาพคำตอบ
- **[3. แผนผังส่วนติดต่อผู้ใช้: เปิดดูออนไลน์](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/frontend-architecture.html) | [เปิดบน Localhost](http://localhost:3000/architecture/frontend-architecture.html)** — แสดงการรับส่ง SSE Events, แอนิเมชันอวตาร 0-CPU, และแผงวัดสถิติ Real-time

---

## 3. Team Division of Labor & Seams

เพื่อป้องกันไม่ให้การทำงานของสมาชิกในกลุ่มทับซ้อนกัน ขอบเขตความรับผิดชอบและรอยต่อของโค้ด (Seam) ถูกแบ่งอย่างชัดเจน:

### 3.1 ความรับผิดชอบฝั่ง AI Agent Developer:
- พัฒนาและดูแลแกนประมวลผลของ Agent ในโฟลเดอร์ `AI-Agent/`
- พัฒนาระบบตัดสินใจ Adaptive RAG, การเชื่อมต่อ Ollama, และการตรวจรับผลลัพธ์ที่ไม่น่าเชื่อถือ (Untrusted Output Principle)
- สร้างและทดสอบ Tool ฝั่ง Deterministic (`AI-Agent/tools/`) รวมถึง `linux_assistant` และ `commandGuard.js`
- ควบคุมปริมาณ Token และการจัดสรรหน่วยความจำให้อยู่ในงบประมาณของแรม 4GB
- ส่งออกฟังก์ชันหลักเพียงจุดเดียว: `runAgent(request)` ที่คืนค่าตามสัญญาข้อมูลเสมอ
- จัดเตรียมชุดทดสอบระดับ Unit และ Integration (`npm test` / `node --test`) ให้พร้อมก่อนส่งมอบงาน

### 3.2 ความรับผิดชอบฝั่ง Backend Developer:
- พัฒนาส่วนเชื่อมต่อเครือข่ายของเซิร์ฟเวอร์บน Pi (`server.js`, Express.js)
- จัดการระบบคิวคำขอ `queue.js` (Linux FIFO Runqueue v2 พร้อมการคำนวณเวลารอคอยจริง EWMA + P90)
- นำเข้าฟังก์ชัน `runAgent` จากโมดูล `AI-Agent/` และให้บริการ REST และ Server-Sent Events (SSE) Streaming แก่หน้าเว็บ
- ให้บริการ Endpoint ปลอดภัยสำหรับรันคำสั่ง Linux (`POST /api/linux/execute`)

### 3.3 ความรับผิดชอบฝั่ง Frontend Developer:
- ดูแลโฟลเดอร์ `Frontend/`
- พัฒนาส่วนแสดงผล Web Chat UI, ระบบควบคุมแอนิเมชันใบหน้าอวตาร (`feeling`) ด้วย Pure CSS บน GPU Compositor
- จัดการแผงควบคุมสถิติ Token & ขีดจำกัดบริบท (Telemetry Drawer) และตารางแสดงสถานะคิวคำขอ

---

## 4. Hardware Constraints and Edge Runtime Settings (Pi 5 4GB)

| Parameter | Limit / Policy | Engineering Rationale |
| :--- | :--- | :--- |
| **Max Process RAM** | ไม่เกิน 2.8 GB (Model + Node.js) | เหลือแรมอย่างน้อย 1.2 GB ให้ระบบปฏิบัติการ ป้องกันการโดน Linux OOM Killer ปิดโปรเซส |
| **Context Window (`numCtx`)** | 4,096 tokens | ขยายพื้นที่บริบทให้เพียงพอสำหรับอ่านเนื้อหาเว็บและเอกสารวิจัยยาวๆ โดยไม่กินแรมเกินขนาด |
| **CPU Threads (`num_thread`)** | 3 threads | Pi 5 มี 4 คอร์ การใช้ 3 คอร์รันโมเดลช่วยเหลือ 1 คอร์ให้ Node.js Event Loop และงานเครือข่าย |
| **Model Selection** | `qwen2.5:1.5b` (Lite) / `qwen2.5:3b` (Adv) | สลับโมเดลแบบไดนามิก ปล่อยโมเดลเก่าด้วย `keep_alive: 0` และเช็ก `ps()` ก่อนโหลดใหม่ |
| **Keep-Alive (`keep_alive`)** | 2m (2 นาที) | หลีกเลี่ยง Cold Start ในการคุยต่อเนื่อง และคืนแรม 1.2 - 2.4 GB อัตโนมัติเมื่อไม่มีการใช้งาน |
| **Sliding Window** | 30 ข้อความล่าสุด (3,200 chars) | กรองเฉพาะ role user และ assistant ตัดข้อความเก่าทิ้งเพื่อคุมขนาด prompt ไม่ให้บวม |
| **Generation Limit (`numPredict`)** | 600 tokens (Lite) / 768 tokens (Adv) | ขยายโควตาการคิดสังเคราะห์คำตอบ ไม่ตัดทอนประโยคกลางคัน |
| **Circuit Breakers** | MAX_LOOP_GUARD = 3 | ป้องกันการวนลูปเรียก Tool ซ้ำอย่างไม่สิ้นสุด |
| **Request Timeout** | 300 วินาที (Stall) / 600 วินาที (Max Synthesis) | รองรับการคิดลึกของโมเดล 3B บน Pi 5 พร้อม Watchdog Heartbeat ส่ง SSE `: ping` ทุก 10 วินาที |

---

## 5. Complete Codebase File Map

```text
Local-AI-Agent/
├── docs/                               # แหล่งอ้างอิงและพิมพ์เขียวเชิงสถาปัตยกรรม
│   ├── assets/
│   │   └── web-ui-overview.png         # ภาพหน้าจอจริงของ Web Chat UI
│   ├── architecture/                   # แผนผัง Interactive HTML (Archify) พร้อมส่งออกรูปภาพ
│   │   ├── system-architecture.html    # แผนผังภาพรวมระบบทั้ง 3 ระดับ
│   │   ├── ai-agent-pipeline.html      # แผนผังการทำงานภายใน AI-Agent
│   │   └── frontend-architecture.html  # แผนผังการทำงานภายใน Frontend
│   ├── PROJECT_CONTEXT.md              # [เอกสารนี้] พิมพ์เขียวสถาปัตยกรรมระบบฉบับหลัก
│   ├── AGENT_API_CONTRACT.md           # สัญญาข้อต่อข้อมูลระหว่าง Agent, Backend และ Frontend
│   ├── PI_RUNBOOK.md                   # คู่มือการตั้งค่า ZRAM และ Systemd สำหรับ Raspberry Pi 5
│   ├── AGENT_RULES.md                  # กฎเหล็กเชิงวิศวกรรม (Zero Emojis, Clean Seams)
│   ├── OLLAMA_AGENT_SKILL.md           # พิมพ์เขียวเชิงวิศวกรรมสำหรับ Small LLM และ Edge AI
│   └── TOKEN_OPTIMIZATION_GUIDE.md     # คู่มือและกลยุทธ์การบริหารจัดการ Token
├── AI-Agent/                           # แกนประมวลผลหลัก (Deep Module)
│   ├── index.js                        # Entry point หลัก (runAgent, applyToolModePolicy)
│   ├── agent.js                        # Pipeline controller (Recall -> Resolve -> Route -> Synthesize)
│   ├── server.js                       # Express Server รองรับ REST, SSE Streaming และ /api/linux/execute
│   ├── queue.js                        # Linux FIFO Runqueue v2 (SCHED_FIFO) พร้อม EWMA + P90 ETA
│   ├── ollamaClient.js                 # Streamed Ollama client (numCtx 4096, keep_alive 2m)
│   ├── modelManager.js                 # ระบบสลับโมเดลไดนามิก ปลอดภัยด้วย Sequential Unload
│   ├── osMonitor.js                    # ตัววัดสถานะเคอร์เนล Linux (/proc/meminfo, ZRAM, SoC Temp, Governor)
│   ├── telemetry.js                    # Telemetry engine คำนวณ Token และ Context Window Real-time
│   ├── toolMode.js                     # ระบบควบคุมโหมดเครื่องมือทั้ง 4 โหมด (auto, chat, search, linux)
│   ├── router.js                       # 100% Deterministic Router (23 หมวดหมู่)
│   ├── resolver.js                     # Conversational Query Resolver เชื่อมประธานคำถามต่อเนื่อง
│   ├── normalizer.js                   # Thai Query Normalizer, Slang, และ Active/Passive SOV
│   ├── memory.js                       # Session Memory (30 รอบ / 3,200 ตัวอักษร) และ Note Ledger ใน RAM
│   ├── answer.js                       # Answer Composer (0-token templates) และ Anti-Truncation ภาษาไทย
│   ├── reflection.js                   # ระบบตรวจประเมินคุณภาพคำตอบสองชั้น (Two-Pass Self-Reflection)
│   ├── languageGuard.js                # ระบบตรวจจับภาษาและกำจัด CJK Leakage
│   ├── safety.js                       # Polarity & Danger/Toxicity Guard
│   ├── replies.js                      # ตัวสร้างคำตอบตรงสำหรับข้อมูลตัวตนและขีดความสามารถของระบบ
│   ├── culture.js                      # มุกตลก คำศัพท์วัยรุ่น และ Roleplay Persona Adapter
│   ├── parse.js                        # ตัวสกัด JSON ปลอดภัย และ Sliding History Sanitizer
│   ├── cli.js                          # สคริปต์ทดสอบผ่าน Terminal
│   ├── README.md                       # คู่มือประจำโมดูล AI Agent
│   ├── linux/                          # โมดูลผู้ช่วยระบบปฏิบัติการ Linux
│   │   ├── catalog.js                  # คลังคำสั่ง Linux 38 รายการ พร้อมคำอธิบาย Flag
│   │   ├── commandGuard.js             # ระบบตรวจสอบความปลอดภัยคำสั่งและรัน execFile
│   │   └── linuxAssistant.js           # ตัวประมวลผลคำสั่งแบบ Catalog-First และ Fallback LLM
│   └── tools/                          # โฟลเดอร์เครื่องมือ Deterministic Tools ทั้ง 10 ตัว
│       ├── registry.js                 # Tool Registry ตรวจสอบพารามิเตอร์และคุม Per-Tool Timeout
│       ├── linuxTool.js                # linux_assistant
│       ├── systemInfo.js               # get_system_info
│       ├── time.js                     # get_current_time
│       ├── calculator.js               # calculate
│       ├── weather.js                  # get_weather
│       ├── fx.js                       # get_fx
│       ├── news.js                     # get_news
│       ├── feedParser.js               # ตัวแปลง RSS/XML Feed
│       ├── github.js                   # search_github
│       ├── wiki.js                     # search_wikipedia พร้อม Deep Passage Extraction
│       ├── webSearch.js                # search_web แบบ Single Facade
│       └── search/                     # ผู้ให้บริการสืบค้นเว็บสองชั้น
│           ├── tavily.js               # Tavily Search Provider พร้อมระบบวินิจฉัย API Key
│           └── duckduckgo.js           # DuckDuckGo HTML Lite Provider (Zero-Key)
├── Frontend/                           # ส่วนติดต่อผู้ใช้และแอนิเมชันอวตาร
│   ├── index.html                      # หน้าจอแชตและแผงควบคุมสถิติ Token
│   ├── style.css                       # สไตล์ชีท Cyber-Minimalist และแอนิเมชัน CSS GPU Keyframes
│   ├── app.js                          # โค้ดควบคุมหน้าบ้าน รองรับ SSE Streaming และ Real-time Meters
│   └── ReadMe.md                       # เอกสารประกอบของ Frontend
├── .agents/skills/                     # Local AI Developer Skills
├── tests/                              # ชุดทดสอบระบบ (368 tests, 77 suites ผ่าน 100%)
├── .env.example                        # ไฟล์ตัวอย่างตั้งค่าตัวแปรสภาพแวดล้อม
├── package.json                        # Node.js ES Modules Manifest
├── .gitignore                          # ระเบียบความสะอาดของคลังโค้ด
└── README.md                           # หน้าหลักของคลังโค้ดบน GitHub
```

---

## 6. Verification & Benchmarking Standards

- การรันชุดทดสอบอัตโนมัติทั้งหมด:
  ```bash
  npm test
  ```
  ผ่านการทดสอบ 368 ข้อ (77 suites ผ่าน 100%) ครอบคลุมทั้ง ReAct Pipeline, Intent Routing, Thai Query Normalizer, Note Memory Ledger, Zero-Key Web Search, Dynamic Model Switching, Tool Modes, Linux Assistant Command Guard, และ Token Telemetry Engine
- การรันชุดประเมิน Benchmark คุณภาพ:
  ```bash
  node tests/eval/runner.js
  ```
  ตรวจสอบความแม่นยำของ Intent Router (100% 86/86 queries), 30-Turn Memory Recall (100%), Tool Mode Policy (100% 16/16 checks), Truncation Defects (0 รายการ), และ MicroSD Card Writes (0 bytes)
