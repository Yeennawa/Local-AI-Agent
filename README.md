# Local AI Agent (Raspberry Pi 5 Edge AI Assistant)

ระบบผู้ช่วย AI อัจฉริยะประมวลผลในเครื่อง (Edge AI Assistant) แบบกระจายศูนย์ (Distributed Architecture) สำหรับบอร์ด **Raspberry Pi 5 (RAM 4GB)** และคอมพิวเตอร์ทั่วไป ขับเคลื่อนด้วยสถาปัตยกรรม **Adaptive RAG**, ระบบสลับโมเดลแบบไดนามิก (**Dynamic Model Switching**), โหมดควบคุมการทำงานของเครื่องมือ (**Tool Modes**), การสืบค้นเว็บแบบสองชั้น (**Dual Search Providers**), และแผงรายงานสถิติการใช้งาน Token แบบ Real-time (**Token & Context Limit Telemetry**)

โปรเจกต์นี้ต่อยอดแนวคิดจาก [Max Headbox](https://github.com/syxanash/maxheadbox) โดยปรับปรุงสถาปัตยกรรมใหม่ทั้งหมดให้ทำงานเป็น **Deep Module** บนสภาพแวดล้อมฮาร์ดแวร์ทรัพยากรจำกัด ปราศจากการเรียกใช้งาน Cloud API ภายนอก (ยกเว้นบริการค้นหาเว็บทางเลือก) และปกป้อง Flash Memory ของ MicroSD Card ด้วยการไม่เขียนไฟล์ชั่วคราวลงดิสก์ (**Zero Disk Writes**)

---

## 1. จุดเด่นทางวิศวกรรม (Key Engineering Highlights)

| คุณสมบัติ | การทำงาน | กลไกเชิงวิศวกรรม (Engineering Mechanism) |
| :--- | :--- | :--- |
| **Dynamic Model Switching** | สลับโหมด AI ได้ทันทีระหว่าง Lite (1.5B) และ Advanced (3B) | **Sequential Unload**: ปลดโมเดลเดิมออกจาก RAM (`keep_alive: 0`) และตรวจสอบสถานะหน่วยความจำผ่าน `client.ps()` จน RAM คืนกลับมาก่อนจึงโหลดโมเดลใหม่ ป้องกัน Linux OOM Crash |
| **Tool Modes (โหมดเครื่องมือ)** | เลือกรูปแบบการทำงานได้ 3 โหมดตามลักษณะงาน: ออโต้, คุยล้วน, ค้นเว็บ | **Tool Mode Policy Engine**: ควบคุมการเปิด/ปิดเครื่องมือภายนอกในระดับฟังก์ชัน จำค่าผ่าน `localStorage` เหมือน Gemini |
| **Dual Web Search Providers** | ค้นหาข้อมูลเว็บเปิดสดใหม่โดยไม่ต้องพึ่งพา API Key เป็นภาคบังคับ | **Single Facade with Fallback**: ใช้งาน Tavily AI Search เมื่อมี API Key และสลับไปใช้ DuckDuckGo HTML Lite (Zero-Key) โดยอัตโนมัติพร้อมแจ้งเตือนผ่าน Notice Banner |
| **Token & Context Telemetry** | หน้าต่างรายงานการใช้งาน Token และขีดจำกัดบริบทแบบ Real-time | **In-Memory Telemetry Engine**: คำนวณ Token ภาษาไทยและอังกฤษด้วยอัตราส่วนเฉพาะทาง แสดงผลผ่าน Side Drawer แบบพับเก็บได้ และรีเซ็ตอัตโนมัติเมื่อเริ่มแชตใหม่ |
| **Note Memory Ledger** | ตอบคำถามซ้ำหรือคำถามที่มีข้อเท็จจริงแน่นอนได้ในเวลา 0 ms | **CoALA Architecture**: จดจำคู่คำถาม-คำตอบที่ผ่านการตรวจสอบแล้วใน RAM พร้อมระบบค้นหาแบบ 3 ระดับ ลดภาระ LLM และตัดโอกาสเกิดอาการหลอน (Zero Hallucination) |
| **9 Deterministic Tools** | เครื่องมือดึงข้อมูลสดและคำนวณที่แม่นยำ 100% | **Deterministic Tool Registry**: ระบบคัดกรองเจตนา 100% (Intent Router) ตัดสินใจเรียก Tool โดยไม่เสีย Token ในรอบวางแผน พร้อม Circuit Breaker ป้องกันการค้าง |
| **Anti-Truncation Thai Formatting** | ป้องกันข้อความขาดช่วงกลางคันและรักษารูปแบบประโยคภาษาไทย | **Extractive Grounding & Sentence Guard**: ไม่ตัดคำย่อ (พ.ศ., ค.ศ.), ตรวจจับคำลงท้ายประโยคธรรมชาติ (ครับ/ค่ะ), และรักษาการเว้นวรรคขึ้นบรรทัดใหม่ |
| **Edge Hardware Protection** | เสถียรภาพสูงสุดบน Raspberry Pi 5 แรม 4GB | **FIFO RequestQueue**: จัดคิวประมวลผลทีละ 1 คำขอ (คิวสูงสุด 10) ป้องกันแรมล้น และไม่เขียนดิสก์ (0 MicroSD Writes) |

---

## 2. เริ่มต้นใช้งานอย่างรวดเร็ว (Quick Start)

### ขั้นตอนที่ 1: ติดตั้ง Ollama และดาวน์โหลดโมเดล

```bash
# สำหรับ Linux / Raspberry Pi:
curl -fsSL https://ollama.com/install.sh | sh

# ดึงโมเดลสำหรับ Lite Mode (1.5B, ขนาด ~986 MB):
ollama pull qwen2.5:1.5b

# ดึงโมเดลสำหรับ Advanced Mode (3B, ขนาด ~1.9 GB - ทางเลือก):
ollama pull qwen2.5:3b
```
*(สำหรับ Windows หรือ macOS สามารถดาวน์โหลดตัวติดตั้งอย่างเป็นทางการได้จาก [ollama.com](https://ollama.com))*

### ขั้นตอนที่ 2: ติดตั้งและตั้งค่าโปรเจกต์

```bash
# Clone คลังโค้ด
git clone https://github.com/Yeennawa/Local-AI-Agent.git
cd Local-AI-Agent

# ติดตั้ง Node.js Dependencies (ต้องการ Node.js 20+ LTS)
npm install

# กำหนดค่า Environment Variables (ทางเลือก):
cp .env.example .env
# หากต้องการใช้ Tavily AI Search ให้ระบุ: TAVILY_API_KEY=tvly-xxxxxxxxxxxx
# หากไม่ระบุ ระบบจะใช้งาน DuckDuckGo HTML Lite (Zero-Key) โดยอัตโนมัติ
```

### ขั้นตอนที่ 3: เปิดใช้งานระบบ

```bash
# เริ่มต้นเซิร์ฟเวอร์แบบ Full-stack (ให้บริการทั้ง API และหน้าเว็บที่ Port 3000)
npm start
```

เปิดเว็บเบราว์เซอร์ไปที่: `http://localhost:3000` (หรือ `http://<IP_ของ_Raspberry_Pi>:3000`)

---

## 3. คู่มือการใช้งานหน้าเว็บและแผงควบคุม (Web UI Guide)

```text
+-----------------------------------------------------------------------------------------+
|                                    LOCAL AI AGENT UI                                    |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ พิมพ์คำถามของคุณ...                                             ]  [ ส่ง ]           |
|                                                                                         |
|  +--------------------------------------------------+  +-----------------------------+  |
|  | (o_o)  Local AI                                  |  | สถิติ Token & บริบท [Qwen 1.5B] [X] |  |
|  |        [Lite 1.5B][Adv 3B]  [ออโต้][คุยล้วน][ค้นเว็บ] |  |-----------------------------|  |
|  |        [แชตใหม่] [สถิติ Token]  [Lite Ready]       |  | ขีดจำกัดบริบท (Context Window)|  |
|  |--------------------------------------------------|  | [====--------] 380/4,096 (9%)|  |
|  | [i] ไม่พบ Tavily API Key จึงใช้งาน DuckDuckGo แทน [X]|  |                             |  |
|  |--------------------------------------------------|  | ความจำในเซสชัน: 2/10 รอบ    |  |
|  | User: อุณหภูมิกรุงเทพตอนนี้กี่องศา                    |  | ความยาวบริบท: 450/2,400 อักษร|  |
|  |                                                  |  | โฟกัส: กรุงเทพมหานคร         |  |
|  | Assistant: ขณะนี้กรุงเทพมหานครมีอุณหภูมิ 31.2°C ...  |  |                             |  |
|  | [ โมเดล: Qwen2.5 1.5B | ใช้เครื่องมือ: get_weather ]|  | รอบล่าสุด: สังเคราะห์ LLM     |  |
|  |                                                  |  | Input: 290 | Output: 90     |  |
|  |                                                  |  | ความเร็ว: 41.9 t/s           |  |
|  |                                                  |  | ยอดสะสม: 380 tokens (1 ครั้ง)|  |
|  +--------------------------------------------------+  +-----------------------------+  |
+-----------------------------------------------------------------------------------------+
```

### รายละเอียดปุ่มควบคุม:
1. **Model Switcher (`Lite (1.5B)` / `Adv (3B)`):**
   - **Lite Mode:** ใช้แรมเพียง ~1,150 MB เหมาะสำหรับการตอบทั่วไป รวดเร็ว และประหยัดพลังงาน
   - **Adv Mode:** ใช้แรม ~2,350 MB เหมาะสำหรับการวิเคราะห์เชิงลึก การเขียนโค้ด และการให้เหตุผลหลายชั้น
2. **Tool Mode Switcher (`ออโต้` / `คุยล้วน` / `ค้นเว็บ`):**
   - **ออโต้ (Auto):** โหมด Adaptive RAG อัจฉริยะ เลือกระหว่างข้อมูลในตัว, เครื่องมือ, หรือการค้นหาเว็บตามเจตนาคำถาม
   - **คุยล้วน (Chat):** ปิดการสืบค้นเว็บและ Wikipedia ทั้งหมด ตอบกลับด้วย Parametric Knowledge ทันทีเพื่อความรวดเร็วสูงสุด (ยังคงใช้เครื่องมือภายในเครื่อง เช่น เวลา, คำนวณ, สถานะเครื่อง)
   - **ค้นเว็บ (Search):** บังคับสืบค้นข้อมูลเว็บเปิดสดใหม่ผ่าน Tavily หรือ DuckDuckGo สำหรับทุกคำถามที่เป็นความรู้
3. **ปุ่ม `แชตใหม่` (New Chat):**
   - ล้างประวัติการสนทนาในหน้าต่างแชต คืนหน่วยความจำเซสชันบนเซิร์ฟเวอร์ และรีเซ็ตมาตรวัด Token กลับเป็น 0 ทันที
4. **ปุ่ม `สถิติ Token` (Telemetry Drawer):**
   - เปิด/ปิด แผงควบคุมด้านข้างเพื่อตรวจสอบสถานะ Token และบริบทแบบ Real-time โดยไม่บดบังพื้นที่แชต
5. **ป้ายกำกับความโปร่งใส (Metadata Badges):**
   - ใต้ข้อความตอบกลับของ AI จะระบุชื่อโมเดลที่ใช้ประมวลผลจริง และรายชื่อเครื่องมือที่ถูกเรียกใช้งานอย่างชัดเจน

---

## 4. สถาปัตยกรรมระบบและการไหลของข้อมูล (System Architecture)

```mermaid
flowchart TD
    User([User Prompt]) --> ClientUI[Web Chat Frontend]
    ClientUI -->|POST /api/chat/stream| Server[Express.js Server]
    
    subgraph Edge_Runtime [Raspberry Pi 5 Server]
        Server --> Queue[FIFO RequestQueue]
        Queue --> Normalizer[Thai Query Normalizer & Resolver]
        
        Normalizer --> FastCheck{Lexical Meta & Note Recall}
        FastCheck -->|Hit 0ms| FastOut[Instant Verified Answer]
        
        FastCheck -->|Miss| PolicyRouter[Router & Tool Mode Policy]
        
        PolicyRouter -->|Local / Chit-chat| DirectGen[Direct / Humor Engine]
        PolicyRouter -->|Structured Tool| ToolExec[Deterministic Tools Execution]
        PolicyRouter -->|External Retrieval| SearchExec[Dual Search: Tavily / DDG / Wiki]
        
        ToolExec -->|Structured Answer| AnswerComposer[Answer Composer: 0-Token Template]
        SearchExec --> CleanContext[Clean Extractive Context]
        
        CleanContext --> SynthesisEngine[Faithful LLM Synthesis]
        DirectGen --> SynthesisEngine
        
        subgraph Local_Ollama [Ollama Daemon Runtime]
            SynthesisEngine --> OllamaClient[Streamed Ollama Client]
            OllamaClient --> ActiveModel["Model: qwen2.5:1.5b / 3b (numCtx: 4096)"]
        end
        
        ActiveModel --> PolarityGuard[Anti-Truncation & Polarity Guard]
        PolarityGuard --> Telemetry[Telemetry Engine & Usage Ledger]
        AnswerComposer --> Telemetry
        FastOut --> Telemetry
    end
    
    Telemetry -->|SSE Event: status / token / done| ClientUI
    ClientUI --> ChatBubble[Chat Feed + Metadata Badge]
    ClientUI --> TelemetryDrawer[Real-time Token Drawer]
    ClientUI --> AvatarExpression[Animated Avatar Feeling]
```

---

## 5. เครื่องมือในระบบทั้ง 9 ตัว (Built-in Deterministic Tools)

ทุกเครื่องมือทำงานแบบ Deterministic ผ่านระบบตรวจสอบความถูกต้องของพารามิเตอร์และควบคุม Timeout ป้องกันการค้าง:

| ชื่อเครื่องมือ | คำอธิบายหน้าที่ | แหล่งข้อมูล | รูปแบบการตอบกลับ |
| :--- | :--- | :--- | :--- |
| `get_system_info` | ตรวจสอบสถานะฮาร์ดแวร์ (RAM, CPU, อุณหภูมิ, Uptime) | ระบบปฏิบัติการ (Node.js OS API) | โครงสร้างแม่แบบ (0 Token) |
| `get_current_time` | ตรวจสอบวันและเวลาปัจจุบันตามเขตเวลา | ระบบนาฬิกาเครื่อง (Intl DateTime) | โครงสร้างแม่แบบ (0 Token) |
| `calculate` | คำนวณทางคณิตศาสตร์อย่างปลอดภัย ปราศจาก `eval()` | Pure Function Tokenizer | โครงสร้างแม่แบบ (0 Token) |
| `get_weather` | ตรวจสอบสภาพอากาศ อุณหภูมิ และความชื้นแบบ Real-time | Open-Meteo API | โครงสร้างแม่แบบ (0 Token) |
| `get_fx` | ตรวจสอบและคำนวณอัตราแลกเปลี่ยนเงินตราสากล | Frankfurter Currency API | โครงสร้างแม่แบบ (0 Token) |
| `get_news` | ดึงพาดหัวข่าวเด่นล่าสุดตามหมวดหมู่ภาษาไทย | Google News RSS Feed | โครงสร้างแม่แบบ (0 Token) |
| `search_github` | ค้นหาคลังโค้ด ยอดดาว และภาษาโปรแกรมบน GitHub | GitHub REST API | โครงสร้างแม่แบบ (0 Token) |
| `search_wikipedia` | ค้นหาบทความเชิงลึก ข้ามหน้ากำกวม และเจาะจง Passage | Wikipedia API (TH/EN) | สังเคราะห์สรุปเนื้อหา (LLM) |
| `search_web` | สืบค้นข้อมูลเว็บเปิดแบบสดใหม่ (Tavily AI -> DuckDuckGo) | Tavily Search / DuckDuckGo Lite | สังเคราะห์สรุปเนื้อหา (LLM) |

---

## 6. โครงสร้างไฟล์ในโปรเจกต์ (Repository Structure)

```text
Local-AI-Agent/
├── docs/                               # เอกสารข้อกำหนดและคู่มือสถาปัตยกรรม
│   ├── PROJECT_CONTEXT.md              # สถาปัตยกรรมระบบและพิมพ์เขียวฉบับหลัก
│   ├── AGENT_API_CONTRACT.md           # สัญญาข้อกำหนด API (Version 2.0.0)
│   ├── PI_RUNBOOK.md                   # คู่มือการติดตั้ง ZRAM และ Systemd บน Raspberry Pi 5
│   ├── AGENT_RULES.md                  # กฎเหล็กเชิงวิศวกรรม (Zero Emojis, Restrained Typography)
│   ├── OLLAMA_AGENT_SKILL.md           # แนวทางการปรับแต่งโมเดลขนาดเล็ก (Small LLM Logic)
│   └── TOKEN_OPTIMIZATION_GUIDE.md     # คู่มือการบริหารจัดการ Context และลด Token
├── AI-Agent/                           # แกนประมวลผล AI Agent (Deep Module)
│   ├── index.js                        # จุดเชื่อมต่อหลัก ส่งออก runAgent() และ applyToolModePolicy()
│   ├── agent.js                        # ตัวควบคุมหลัก (Pipeline: Recall -> Resolve -> Route -> Synthesize)
│   ├── telemetry.js                    # ระบบคำนวณ Token และรวบรวมสถิติ Real-time (0 Disk Writes)
│   ├── toolMode.js                     # ระบบควบคุมโหมดเครื่องมือ (auto, chat, search)
│   ├── modelManager.js                 # ระบบสลับโมเดลแบบไดนามิก ปลอดภัยด้วย Sequential Unload
│   ├── router.js                       # ระบบคัดกรองเจตนา 100% Deterministic (23 หมวดหมู่)
│   ├── resolver.js                     # ระบบขยายคำถามต่อเนื่อง (Conversational Query Resolver)
│   ├── answer.js                       # ระบบจัดรูปคำตอบและ Anti-Truncation ภาษาไทย
│   ├── safety.js                       # ระบบตรวจสอบความปลอดภัยและเตือนสารพิษ/สิ่งผิดกฎหมาย
│   ├── normalizer.js                   # ตัวแปลงคำย่อภาษาไทย, Slang, และโครงสร้าง Active/Passive SOV
│   ├── memory.js                       # ระบบความจำเซสชัน (10 รอบ) และ Note Memory Ledger ใน RAM
│   ├── culture.js                      # คลังมุกตลกไทย คำศัพท์วัยรุ่น และ Roleplay Persona
│   ├── queue.js                        # FIFO RequestQueue ควบคุม Concurrency ป้องกันแรมล้น
│   ├── server.js                       # Express Server ให้บริการ REST API และ SSE Streaming
│   ├── ollamaClient.js                 # ตัวเชื่อมต่อ Ollama รองรับ Streaming, Abort, และ numCtx 4096
│   ├── parse.js                        # ฟังก์ชันอ่าน JSON ปลอดภัย และ Sliding History Sanitizer
│   ├── cli.js                          # สคริปต์สำหรับทดสอบคุยผ่าน Terminal
│   ├── README.md                       # คู่มือประจำโมดูล AI Agent
│   └── tools/                          # โฟลเดอร์รวบรวมเครื่องมือ Deterministic Tools
│       ├── registry.js                 # ระบบลงทะเบียน ตรวจสอบสิทธิ์ และคุม Timeout
│       ├── systemInfo.js               # เครื่องมือ get_system_info
│       ├── time.js                     # เครื่องมือ get_current_time
│       ├── calculator.js               # เครื่องมือ calculate
│       ├── weather.js                  # เครื่องมือ get_weather
│       ├── fx.js                       # เครื่องมือ get_fx
│       ├── news.js                     # เครื่องมือ get_news
│       ├── feedParser.js               # ตัวแปลง RSS/XML Feed ข่าว
│       ├── github.js                   # เครื่องมือ search_github
│       ├── wiki.js                     # เครื่องมือ search_wikipedia พร้อม Deep Passage Extraction
│       ├── webSearch.js                # เครื่องมือ search_web แบบ Single Facade
│       └── search/                     # โมดูลผู้ให้บริการสืบค้นเว็บ
│           ├── tavily.js               # ผู้ให้บริการ Tavily API (AI-summarized)
│           └── duckduckgo.js           # ผู้ให้บริการ DuckDuckGo HTML Lite (Zero-Key)
├── Frontend/                           # หน้าต่างแชตและแอนิเมชันอวตาร
│   ├── index.html                      # โครงสร้างหน้าเว็บ แผงควบคุม และ Telemetry Drawer
│   ├── style.css                       # สไตล์ชีท Cyber-Minimalist รองรับ Responsive มือถือ
│   ├── app.js                          # ตัวจัดการฝั่ง Client รองรับ SSE Streaming และ Real-time Meters
│   └── ReadMe.md                       # คู่มือการทำงานของ Frontend
├── .agents/                            # Local AI Agent Developer Skills
│   └── skills/                         # codebase-design, small-llm-agent-logic, tdd, to-tickets, etc.
├── tests/                              # ชุดทดสอบระบบอัตโนมัติ (290 tests, 71 suites ผ่าน 100%)
│   ├── *.test.js                       # ชุดทดสอบ Unit & Integration ครบทุกโมดูล
│   └── eval/                           # สคริปต์รัน Benchmark วัดความแม่นยำและประสิทธิภาพ
├── package.json                        # Node.js Project Manifest (Pure ES Modules)
├── .gitignore                          # ระเบียบความสะอาดของคลังโค้ด
└── README.md                           # เอกสารฉบับนี้
```

---

## 7. ผลการทดสอบและประสิทธิภาพ (Benchmarks & Quality Scorecard)

ระบบผ่านการทดสอบอย่างเข้มงวดด้วยชุดทดสอบมาตรฐานของ Node.js (`node --test`) และชุดประเมิน Benchmark คุณภาพ:

| ตัวชี้วัดการประเมิน | เกณฑ์เป้าหมาย | ผลลัพธ์ที่วัดได้จริง | สถานะ |
| :--- | :--- | :--- | :--- |
| **Unit & Integration Tests** | ผ่าน 100% | **284 ผ่าน / 6 ข้ามตามฮาร์ดแวร์จริง / 0 ล้มเหลว** (290 tests, 71 suites) | ผ่าน |
| **Router Intent Accuracy** | >= 95.0% | **86 / 86 (100.0%)** ครอบคลุม 23 หมวดหมู่ | ผ่าน |
| **Multi-Turn Recall Rate (10 รอบ)** | >= 90.0% | **27 / 27 (100.0%)** จดจำคำถามแรกและบริบทต่อเนื่องสมบูรณ์ | ผ่าน |
| **Tool Mode Policy Accuracy** | 100.0% | **16 / 16 (100.0%)** ควบคุมการปิด/เปิดเครื่องมือถูกต้องทุกโหมด | ผ่าน |
| **Truncation Defect Count** | 0 คำตอบ | **0 รายการ** (ไม่พบอาการประโยคขาดช่วงกลางคัน) | ผ่าน |
| **MicroSD Card Writes** | 0 Bytes | **0 Bytes** (บันทึกข้อมูลเซสชันใน RAM ทั้งหมด) | ผ่าน |
| **Node.js Memory Footprint (RSS)** | < 128 MB | **~41.0 MB** | ผ่าน |
| **Ollama Resident RAM (Lite)** | < 1.5 GB | **~1.15 GB** (`qwen2.5:1.5b`) | ผ่าน |
| **Ollama Resident RAM (Adv)** | < 2.5 GB | **~2.35 GB** (`qwen2.5:3b`) | ผ่าน |

---

## 8. สรุปจุดเชื่อมต่อ API (API Endpoints Reference)

| Method | Endpoint | หน้าที่และการทำงาน |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | ส่งคำถามและรับคำตอบ JSON แบบซิงโครนัสรอบเดียว |
| `POST` | `/api/chat/stream` | รับคำตอบแบบ Server-Sent Events (SSE) ทีละ Token พร้อมอัปเดตสถานะและข้อมูล Telemetry |
| `GET` | `/api/model/status` | ตรวจสอบโหมดโมเดลปัจจุบัน (`lite`/`advanced`), สถานะแรม, และชื่อโมเดลที่อยู่ใน RAM |
| `POST` | `/api/model/switch` | สลับโหมดโมเดล AI อย่างปลอดภัย (`{ "mode": "lite" \| "advanced" }`) |
| `GET` | `/api/tools/status` | ตรวจสอบโหมดเครื่องมือที่รองรับ และสถานะการกำหนดค่าของ Tavily API Key |
| `GET` | `/api/chat/session/:id` | ดึงประวัติการสนทนา, Focus Entity, และสรุปสถิติ Token ของเซสชันนั้นๆ |
| `DELETE`| `/api/chat/session/:id` | ล้างประวัติการสนทนาและคืนหน่วยความจำของเซสชันทันที (เรียกใช้เมื่อกดแชตใหม่) |
| `GET` | `/api/health` | ตรวจสอบสถานะการทำงานของฮาร์ดแวร์ Raspberry Pi 5, แรม, คิวงาน, และจำนวนเซสชัน |

---

## 9. สารบัญเอกสารเชิงลึก (Documentation Index)

- [AI-Agent/README.md](file:///c:/Projects/Local-AI-Agent/AI-Agent/README.md): เอกสารเชิงลึกของโมดูล AI Agent, สถาปัตยกรรม ReAct, และระบบ Telemetry
- [Frontend/ReadMe.md](file:///c:/Projects/Local-AI-Agent/Frontend/ReadMe.md): คู่มือส่วนแสดงผลหน้าเว็บ, การเชื่อมต่อ SSE, แผงวัดสถิติ Token, และ Mock Mode
- [docs/PROJECT_CONTEXT.md](file:///c:/Projects/Local-AI-Agent/docs/PROJECT_CONTEXT.md): พิมพ์เขียวสถาปัตยกรรมระบบฉบับหลักสำหรับทีมพัฒนา
- [docs/AGENT_API_CONTRACT.md](file:///c:/Projects/Local-AI-Agent/docs/AGENT_API_CONTRACT.md): สัญญาข้อกำหนด API (Payload Schema และ SSE Events)
- [docs/PI_RUNBOOK.md](file:///c:/Projects/Local-AI-Agent/docs/PI_RUNBOOK.md): คู่มือการตั้งค่า ZRAM, Systemd, และการระบายความร้อนบน Raspberry Pi 5
- [docs/AGENT_RULES.md](file:///c:/Projects/Local-AI-Agent/docs/AGENT_RULES.md): รัฐธรรมนูญวิศวกรรม (Zero Emojis, Restrained Typography, Git Governance)
- [docs/TOKEN_OPTIMIZATION_GUIDE.md](file:///c:/Projects/Local-AI-Agent/docs/TOKEN_OPTIMIZATION_GUIDE.md): คู่มือและกลยุทธ์การบริหารจัดการ Token บนอุปกรณ์เอดจ์
- [docs/OLLAMA_AGENT_SKILL.md](file:///c:/Projects/Local-AI-Agent/docs/OLLAMA_AGENT_SKILL.md): หลักการวิศวกรรมสำหรับโมเดลภาษาขนาดเล็ก (Small LLM Logic)
