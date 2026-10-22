# AI Agent Module (Raspberry Pi 5)

โมดูลนี้เป็นส่วนประมวลผล AI Agent สำหรับโปรเจกต์ Local-AI-Agent ทำหน้าที่รับข้อความจาก Backend หรือ Web Client, วิเคราะห์คำสั่ง, ตัดสินใจเรียกใช้ Tool (ReAct pattern), และส่งคืนผลลัพธ์พร้อมค่าอารมณ์ (feeling) กลับไปให้ Frontend ใช้แสดงผลบน Avatar

โมดูลนี้ออกแบบให้ทำงานเป็นอิสระ (Deep Module) โดยเชื่อมต่อกับ Ollama ในเครื่อง และควบคุมปริมาณ Token กับการใช้หน่วยความจำเพื่อให้ทำงานบน Raspberry Pi 5 (RAM 4GB) ได้อย่างเสถียร 100% ปราศจากอาการหน่วยความจำล้น (OOM) และปกป้อง MicroSD Card จากการสึกหรอ (Zero Disk Writes)

---

## 1. โครงสร้างไฟล์ในโมดูล

```text
AI-Agent/
├── index.js          Entry point หลัก (Deep Module seam ส่งออกฟังก์ชัน runAgent และ applyToolModePolicy)
├── agent.js          ตัวควบคุมหลัก (pipeline: metaRecall -> noteRecall -> resolve -> route -> toolMode -> execute -> compose -> remember)
├── telemetry.js      โมดูลคำนวณและประเมิน Token, Context Window, และสถิติ Real-time (0 MicroSD writes)
├── toolMode.js       ระบบควบคุมโหมดเครื่องมือแบบ Pure Functional (auto, chat, search)
├── router.js         ระบบคัดกรองเจตนาแบบ Deterministic 100% ปราศจาก LLM decision loop
├── resolver.js       ระบบขยายคำถามต่อเนื่อง (Conversational Query Resolver) เติมประธาน/กรรมที่หาย
├── answer.js         ระบบจัดรูปคำตอบ (Answer Composer) ตอบข้อมูลโครงสร้างด้วย Template (0 Tokens) และเกลาบริบทเว็บ/วิกิ
├── safety.js         ระบบป้องกันความปลอดภัยและควบคุม Polarity (Polarity & Warning Guard)
├── normalizer.js     ระบบปรับสภาพข้อความภาษาไทย (Thai Query Normalizer) ถอดคำย่อ, ขยายคีย์เวิร์ด, SOV Disambiguation
├── memory.js         ระบบความจำเซสชันและ Note Memory Ledger ในหน่วยความจำ (0 MicroSD card writes)
├── culture.js        โมดูลความรู้รอบตัว มุกตลก คำศัพท์วัยรุ่น และ Roleplay Persona Adapter
├── modelManager.js   ระบบจัดการสลับโมเดลแบบไดนามิก (ModelManager) ควบคุม sequential unload และ RAM verification
├── queue.js          ระบบคิวคำขอแบบเข้าก่อน-ออกก่อน (FIFO RequestQueue) ควบคุมการรันบน Pi 5
├── server.js         Express Server ให้บริการ API (/api/chat, /api/chat/stream, /api/health, /api/model/*, /api/tools/status)
├── ollamaClient.js   ตัวเชื่อมต่อ Ollama API (stream, abort controller, keep-alive 2m)
├── parse.js          ฟังก์ชันอ่าน JSON จากโมเดล, ตรวจสอบ feeling และล้างประวัติแชต (sliding window)
├── cli.js            สคริปต์สำหรับทดสอบรันคำถามผ่าน Terminal
├── README.md         เอกสารฉบับนี้
└── tools/            โฟลเดอร์เก็บฟังก์ชันเครื่องมือ (Deterministic Tools ทั้ง 9 ตัว)
    ├── registry.js   ระบบลงทะเบียน ตรวจสอบสิทธิ์ และคุม Timeout (รองรับ per-tool timeout)
    ├── systemInfo.js เครื่องมืออ่านสถานะเครื่องและแรม (get_system_info)
    ├── time.js       เครื่องมืออ่านเวลาและวันที่ปัจจุบัน (get_current_time)
    ├── calculator.js เครื่องมือคำนวณคณิตศาสตร์ปลอดภัย (calculate)
    ├── github.js     เครื่องมือค้นหาคลังโค้ดและผู้ใช้ GitHub (search_github)
    ├── wiki.js       เครื่องมือค้นหา Wikipedia พร้อมกลยุทธ์ 5 ชั้นและ Deep Passage Retrieval (search_wikipedia)
    ├── webSearch.js  เครื่องมือค้นหาเว็บแบบ Single Facade (search_web) จัดการ fallback Tavily -> DuckDuckGo -> Wikipedia
    ├── search/       โฟลเดอร์ผู้ให้บริการสืบค้นเว็บ (Modular Search Providers)
    │   ├── tavily.js      ผู้ให้บริการค้นหา Tavily API (รวดเร็ว, AI-summarized)
    │   └── duckduckgo.js  ผู้ให้บริการค้นหา DuckDuckGo HTML Lite แบบ Zero-Key
    ├── news.js       เครื่องมือดึงข่าวสารล่าสุดจาก Google News RSS (get_news)
    ├── feedParser.js โมดูลช่วยแปลงข้อมูล RSS Feed สำหรับข่าว
    ├── weather.js    เครื่องมือตรวจสอบสภาพอากาศและอุณหภูมิ Real-time (get_weather)
    └── fx.js         เครื่องมือตรวจสอบและคำนวณอัตราแลกเปลี่ยนเงินตราสากล (get_fx)
```

---

## 2. เครื่องมือที่รองรับในระบบ (Built-in Deterministic Tools)

ระบบมีเครื่องมือประมวลผลที่แม่นยำ 9 ตัว ทำงานแบบ Deterministic โดยไม่พึ่งพาการสุ่มของโมเดล:

1. `get_system_info`: อ่านค่าสถานะฮาร์ดแวร์ของ Raspberry Pi 5 (RAM รวม, RAM เหลือ, CPU Usage, อุณหภูมิ, Uptime)
2. `get_current_time`: ตรวจสอบวันและเวลาปัจจุบัน รองรับการระบุ Timezone (ค่าเริ่มต้น: `Asia/Bangkok`)
3. `calculate`: คำนวณนิพจน์คณิตศาสตร์อย่างแม่นยำ ปราศจากการใช้ `eval()` โดยรองรับทั้งเลขฐานสิบ ทศนิยม และฟังก์ชันตรีโกณมิติพื้นฐาน
4. `search_wikipedia`: ค้นหาข้อมูลเชิงลึกจาก Wikipedia ภาษาไทยและอังกฤษ พร้อมระบบข้าม Disambiguation, ตรวจสอบ Semantic Relevance, และดึง Passage ที่ตรงกับประเด็นคำถาม
5. `search_web`: ค้นหาข้อมูลเว็บเปิดแบบ Single Facade มีระบบ Fallback อัจฉริยะ (Tavily AI Search -> DuckDuckGo HTML Lite -> Wikipedia Snippet) พร้อมแนบการแจ้งเตือน (Notice) ในกรณีที่ไม่มี Tavily API Key
6. `get_news`: ดึงข่าวเด่นล่าสุดจาก Google News RSS ภาษาไทย รองรับการกรองตามหมวดหมู่ (`technology`, `business`, `world`, `general`)
7. `get_weather`: ตรวจสอบสภาพอากาศ อุณหภูมิ ความชื้น และความเร็วลมแบบ Real-time จาก Open-Meteo API
8. `get_fx`: คำนวณและแปลงอัตราแลกเปลี่ยนเงินตราต่างประเทศล่าสุด (เช่น USD, JPY, EUR เป็น THB)
9. `search_github`: ค้นหา Repository ยอดนิยม ข้อมูลเจ้าของโปรเจกต์ จำนวนดาว และภาษาที่ใช้บน GitHub

---

## 3. โหมดการทำงานของเครื่องมือ (Tool Modes)

เพื่อเพิ่มความยืดหยุ่นในการสนทนาและควบคุมการใช้ Token ผู้ใช้สามารถสลับโหมดการทำงานของเครื่องมือได้ผ่านหน้าเว็บ (จำค่าสถานะผ่าน `localStorage` เหมือน Gemini):

1. **Auto Mode (`auto`)** (ค่าเริ่มต้น):
   - ทำงานตาม Adaptive RAG อย่างเต็มรูปแบบ โดยจำแนกระดับเจตนา (Self-Awareness / Parametric / Structured / Retrieval)
   - เลือกใช้เครื่องมือตามความเหมาะสมของประโยคคำถามโดยอัตโนมัติ

2. **Chat Mode (`chat`)**:
   - ปิดการค้นหาเว็บภายนอก (Web Search, Wikipedia, News, GitHub) ทั้งหมด
   - ตอบคำถามทั่วไปด้วย Parametric Knowledge ทันทีเพื่อความรวดเร็วและประหยัด Token
   - ยังคงเปิดใช้งานเครื่องมือภายในเครื่องที่จำเป็นและข้อมูลโครงสร้างความปลอดภัยสูง (`get_current_time`, `get_system_info`, `calculate`, `get_weather`, `get_fx`)

3. **Search Mode (`search`)**:
   - ยกระดับคำถามความรู้ทั่วไปและคำค้นหา Wikipedia ให้เรียกใช้ `search_web` เพื่อสืบค้นข้อมูลเว็บเปิดแบบสดใหม่
   - ยังคงรักษาบทสนทนาทักทาย (Greeting), ข้อมูลตัวตน (Identity) และคำขอมุกตลก (Joke) ไว้โดยไม่เรียกค้นหาโดยไม่จำเป็น

---

## 4. ผู้ให้บริการสืบค้นเว็บและการสำรองข้อมูล (Search Providers & Fallback)

เครื่องมือ `search_web` ทำงานในรูปแบบ Single Facade ป้องกันปัญหา Token บวมจากการประกาศ Tool ซ้ำซ้อน โดยมีลำดับการทำงานดังนี้:

1. **Tavily Search Provider**: หากมีการกำหนด `TAVILY_API_KEY` ในสภาพแวดล้อม ระบบจะใช้ผลการสืบค้นที่ผ่านการสรุปและคัดกรองเนื้อหามาแล้ว
2. **DuckDuckGo HTML Lite Provider**: หากไม่มี API Key หรือการเชื่อมต่อไปยัง Tavily ล้มเหลว ระบบจะสลับไปดึงข้อมูลจาก DuckDuckGo HTML Lite โดยอัตโนมัติ (Zero-Key) พร้อมส่งการแจ้งเตือน (`notice: tavily_key_missing`) แจ้งให้ผู้ใช้ทราบบนหน้าต่างแชต
3. **Wikipedia Fallback**: หาก DuckDuckGo ถูกจำกัดอัตราการเรียก (Rate Limit) ระบบจะค้นหาบทความที่เกี่ยวข้องจาก Wikipedia เป็นด่านสุดท้าย

---

## 5. สถาปัตยกรรมความปลอดภัยและการปกป้องฮาร์ดแวร์ (Pi 5 Protection)

1. **FIFO Concurrency Control (`queue.js`)**:
   - ป้องกันการเกิด Out of Memory (OOM) โดยจำกัดให้ Ollama รันการอนุมาน (Inference) ได้ทีละ 1 Request เท่านั้น
   - รองรับคิวรอสูงสุด 10 คำขอ หากเกินจะตอบกลับด้วย HTTP 503 (`Server busy: Queue is full`) ทันทีโดยระบบไม่ล่ม
2. **Zero Disk Writes & Note Memory Ledger (`memory.js`)**:
   - ประวัติการสนทนาต่อเนื่อง (Multi-turn Context สูงสุด 10 รอบ) และ Focus Entity จัดเก็บใน RAM ผ่านโครงสร้างข้อมูล JavaScript Map ทั้งหมด
   - Note Memory Ledger จดจำคำถามและคำตอบที่ผ่านการตรวจสอบแล้วใน RAM เพื่อตอบกลับคำถามเดิมหรือคำถามคล้ายกันใน 0ms โดยไม่ต้องเรียกโมเดล ลดภาระการคำนวณและลดโอกาสการเกิดอาการหลอน (Zero Hallucination)
   - ไม่มีการเขียนบันทึกไฟล์ชั่วคราวลงใน MicroSD Card เพื่อยืดอายุการใช้งาน Flash Memory ของบอร์ด
3. **Intent Router & Normalizer (`router.js` & `normalizer.js`)**:
   - แปลงคำย่อภาษาไทย เช่น "นายก", "กทม", "จนท" ให้เป็นคำเต็ม
   - คัดกรองเจตนาของผู้ใช้ไปยัง Tool ที่เหมาะสมด้วย Deterministic Rules 100% ทำให้ลดเวลาและ Token ในรอบตัดสินใจของโมเดลได้อย่างสิ้นเชิง
4. **Token & Memory Optimization (`ollamaClient.js` & `agent.js`)**:
   - กำหนด Context Window 4,096 tokens (`numCtx: 4096`) เพื่อให้โมเดลมีพื้นที่อ่านเนื้อหาเว็บและเอกสารอ้างอิงได้อย่างครบถ้วน
   - ขยายโควตาการสังเคราะห์คำตอบ: 600 tokens สำหรับ Lite Mode (1.5B) และ 768 tokens สำหรับ Advanced Mode (3B)
   - กำหนดเวลา Timeout ป้องกันการค้างที่ 45 วินาทีสำหรับ Network Stall และสูงสุด 180 วินาทีสำหรับ Deep Thinking
   - ขยายขีดจำกัดความยาวคำตอบสูงสุดเป็น 2,400 ตัวอักษร พร้อมระบบตัดคำตามวรรคตอนธรรมชาติ
5. **Anti-Truncation & Safe Thai Formatting (`answer.js`)**:
   - ระบบขจัดอาการประโยคขาดช่วง: ตรวจสอบและสงวนโครงสร้างประโยคภาษาไทยที่ลงท้ายด้วยคำธรรมชาติ (เช่น "ครับ", "ค่ะ", "นะคะ") โดยไม่ตัดคำย่อ (เช่น "พ.ศ.", "ค.ศ.")
   - รักษารูปแบบการเว้นวรรคและการขึ้นย่อหน้าใหม่ (`\n\n`) อย่างเป็นระเบียบ ไม่บีบอัดข้อความเป็นบรรทัดเดียว
6. **Dynamic Model Switching & Identity Synchronization (`modelManager.js`)**:
   - รองรับ 2 โหมด: **Lite Mode** (`qwen2.5:1.5b`, RAM ~1,150 MB) สำหรับงานทั่วไป และ **Advanced Mode** (`qwen2.5:3b`, RAM ~2,350 MB) สำหรับงานวิเคราะห์เชิงลึก
   - ใช้กลไก **Sequential Switching**: ตรวจสอบไฟล์โมเดลบนดิสก์ก่อน (`client.list()`) -> สั่ง Unload โมเดลเก่าออกจาก RAM (`keep_alive: 0`) -> วนตรวจสอบสถานะหน่วยความจำ (`client.ps()`) จนโมเดลเก่าหายไปจริง -> จึงเริ่มโหลดโมเดลใหม่เข้า RAM เพื่อป้องกันปัญหา Linux OOM Crash บน Raspberry Pi 5
   - ปลอดภัยด้วย **RequestQueue Mutual Exclusion**: คำขอสลับโมเดลจะเข้าคิวรอให้การสร้างข้อความแชตปัจจุบันเสร็จสิ้นก่อนเสมอ ป้องกันการ Unload โมเดลทับซ้อนกลางคัน
   - ซิงค์ค่าชื่อและโหมดโมเดลบนแชตบับเบิลและ UI ให้ตรงกับความเป็นจริงทุกครั้งที่มีการสลับโหมด

---

## 6. ระบบ Telemetry และหน้าต่างแสดงสถานะการใช้งาน Token แบบ Real-time

โมดูล `telemetry.js` ทำหน้าที่ประเมินและติดตามปริมาณการใช้งาน Token และสถิติขีดจำกัดบริบท (Context Window) โดยไม่ส่งผลกระทบต่อความเร็วในการตอบของ AI และไม่มีการบันทึกไฟล์ลงดิสก์ (0 Disk Writes):

1. **การประเมิน Token ภาษาไทยและอังกฤษ (Zero-dependency Tokenizer)**:
   - อักขระภาษาไทย: ประเมิน ~0.65 tokens ต่อตัวอักษร
   - อักขระละตินและช่องว่าง: ประเมิน ~1 token ต่อ 3.8 ตัวอักษร
   - คำนวณ Overhead ของ ChatML Formatting (+4 tokens/ข้อความ, +2 priming tokens)

2. **หน้าต่าง Side Drawer แสดงสถานะ Real-time บน Frontend**:
   - มีปุ่ม `สถิติ Token` ในแถบควบคุมข้างปุ่ม `แชตใหม่` เพื่อเปิด/ปิดหน้าต่างตามความต้องการ ไม่รกสายตา
   - จดจำสถานะเปิด/ปิดผ่าน `localStorage` (`ai_agent_telemetry_open`)
   - **มาตรวัดบริบท (Context Window Budget Meter)**: แถบสีแสดงสัดส่วน Token ที่ใช้ไปเทียบกับขีดจำกัด 4,096 tokens (สีเขียวปกติ <55%, สีเหลือง 55-80%, สีแดง >80%)
   - **ความจุความจำเซสชัน (Sliding Memory)**: แสดงจำนวนรอบที่ใช้งาน (สูงสุด 10 รอบ), ความยาวตัวอักษรบริบท, และ Focus Entity
   - **สถิติรอบล่าสุด (Last Turn)**: แสดง Input tokens, Output tokens, ความเร็วในการสร้าง (tokens/sec), และป้ายระบุว่าเป็นคำตอบแบบสังเคราะห์ LLM หรือตอบทันที (0 Token)
   - **สถิติสะสมในแชต (Session Cumulative)**: นับยอดรวม Token ที่ใช้ในแชตนี้ และจำนวนรอบที่เรียกใช้โมเดล โดยจะรีเซ็ตกลับเป็น 0 อัตโนมัติเมื่อกดปุ่ม `แชตใหม่`

3. **โครงสร้างข้อมูล Telemetry ในผลลัพธ์ (`usage`)**:
```json
{
  "model": "qwen2.5:1.5b",
  "modelLabel": "Qwen2.5 1.5B (Lite Mode)",
  "mode": "lite",
  "contextWindow": {
    "usedTokens": 380,
    "maxTokens": 4096,
    "usagePercent": 9.3,
    "historyTurnsUsed": 2,
    "maxHistoryTurns": 10,
    "contextCharsUsed": 450,
    "maxContextChars": 2400,
    "focusEntity": "Raspberry Pi"
  },
  "lastTurn": {
    "promptTokens": 290,
    "completionTokens": 90,
    "totalTokens": 380,
    "durationMs": 2150,
    "tokensPerSec": 41.9,
    "isDeterministic": false
  },
  "sessionTotal": {
    "promptTokens": 290,
    "completionTokens": 90,
    "totalTokens": 380,
    "llmCalls": 1,
    "deterministicTurns": 0,
    "totalTurns": 1
  }
}
```

---

## 7. คู่มือการติดตั้งและเปิดใช้งาน

### ติดตั้ง Ollama และดาวน์โหลดโมเดล (ทำครั้งเดียว):

```bash
# ติดตั้ง Ollama
curl -fsSL https://ollama.com/install.sh | sh

# ดึงโมเดล qwen2.5:1.5b (ขนาดประมาณ 986 MB)
ollama pull qwen2.5:1.5b
```

### การตั้งค่า Environment Variables (ทางเลือก):

```bash
# คัดลอกไฟล์ตัวอย่างสภาพแวดล้อม
cp .env.example .env

# แก้ไขไฟล์ .env หากต้องการใส่ Tavily Search API Key
# TAVILY_API_KEY=tvly-xxxxxxxxxxxx
```

### ติดตั้ง Dependencies และเปิดใช้งาน:

```bash
# ติดตั้งแพ็กเกจ Node.js
npm install

# รันเซิร์ฟเวอร์แบบ Full-stack (ให้บริการทั้ง API และหน้าเว็บ Frontend บนพอร์ต 3000)
npm start

# หรือรันเฉพาะ Express Server
node AI-Agent/server.js
```

### การทดสอบระบบ:

```bash
# รันชุดทดสอบ Unit และ Integration Tests ทั้งหมด (290 tests, 71 suites)
npm test

# รันชุดทดสอบประเมินผลคุณภาพและความแม่นยำของ Intent Router, Memory และ Tool Modes
node tests/eval/runner.js

# ทดสอบคุยกับ Agent ผ่าน Terminal โดยตรง
node AI-Agent/cli.js "นายกไทยคนปัจจุบันคือใคร"
```

---

## 8. การเชื่อมต่อ API สำหรับนักพัฒนา (API Contract)

### 1. HTTP Endpoint ทั่วไป (`POST /api/chat`)
ส่งข้อความคำถาม และรับคำตอบ JSON แบบรอบเดียว:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ตอนนี้เวลาเท่าไหร่แล้ว", "sessionId": "session-001", "toolMode": "auto"}'
```

ตัวอย่าง Response:
```json
{
  "text": "ขณะนี้เวลา 14:30 น. ของวันเสาร์ที่ 18 ตุลาคม 2569 ครับ",
  "status": "idle",
  "feeling": "happy",
  "toolsUsed": [
    {
      "tool": "get_current_time",
      "params": { "timezone": "Asia/Bangkok" },
      "result": { "formatted": "14:30:00", "date": "2026-10-18" },
      "durationMs": 1
    }
  ],
  "notice": null,
  "sessionId": "session-001",
  "error": null,
  "model": "qwen2.5:1.5b",
  "modelLabel": "Qwen2.5 1.5B",
  "mode": "lite",
  "usage": {
    "model": "qwen2.5:1.5b",
    "modelLabel": "Qwen2.5 1.5B",
    "mode": "lite",
    "contextWindow": {
      "usedTokens": 45,
      "maxTokens": 4096,
      "usagePercent": 1.1,
      "historyTurnsUsed": 1,
      "maxHistoryTurns": 10,
      "contextCharsUsed": 65,
      "maxContextChars": 2400,
      "focusEntity": null
    },
    "lastTurn": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0,
      "durationMs": 3,
      "tokensPerSec": 0,
      "isDeterministic": true
    },
    "sessionTotal": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0,
      "llmCalls": 0,
      "deterministicTurns": 1,
      "totalTurns": 1
    }
  }
}
```

### 2. Server-Sent Events Streaming (`POST /api/chat/stream`)
รับคำตอบแบบ Real-time ทีละ Token สำหรับหน้าจอแชตที่ต้องการให้ข้อความทยอยพิมพ์:
```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "เล่าประวัติความเป็นมาของคอมพิวเตอร์สั้นๆ", "sessionId": "session-001", "toolMode": "chat"}'
```
Event ที่ส่งออกมา:
- `event: status`: ส่งสถานะการทำงานปัจจุบัน (`using_tool`, `synthesizing`, หรือ `notice`) พร้อมค่า `estimatedPromptTokens` และ `maxContextTokens`
- `event: token`: ส่งชิ้นส่วนข้อความ `{ "token": "คอมพิวเตอร์" }`
- `event: done`: ส่งโครงสร้าง `AgentResponse` ฉบับเต็มพร้อมฟิลด์ `usage` เมื่อการสังเคราะห์เสร็จสิ้น

### 3. Tool & Search Status Endpoint (`GET /api/tools/status`)
ตรวจสอบสถานะโหมดเครื่องมือที่รองรับ และสถานะ Tavily API Key:
```bash
curl http://localhost:3000/api/tools/status
```
ตัวอย่าง Response:
```json
{
  "modes": {
    "auto": { "name": "auto", "label": "ออโต้", "description": "Adaptive RAG" },
    "chat": { "name": "chat", "label": "คุยล้วน", "description": "Parametric only" },
    "search": { "name": "search", "label": "ค้นเว็บ", "description": "Web search" }
  },
  "tavilyConfigured": false
}
```

### 4. Health & Telemetry Endpoint (`GET /api/health`)
ตรวจสอบข้อมูลสถานะฮาร์ดแวร์ คิวงาน หน่วยความจำ และสถานะโมเดลที่ใช้งานอยู่:
```bash
curl http://localhost:3000/api/health
```

### 5. Model Status Endpoint (`GET /api/model/status`)
ตรวจสอบโหมดที่กำลังใช้งานอยู่, ชื่อโมเดล, สถานะการโหลด, และรายการโมเดลที่อยู่ใน RAM:
```bash
curl http://localhost:3000/api/model/status
```
ตัวอย่าง Response:
```json
{
  "mode": "lite",
  "model": "qwen2.5:1.5b",
  "label": "Lite Mode (1.5B)",
  "state": "ready",
  "lastError": null,
  "estimatedRamMB": 1150,
  "loadedModels": []
}
```

### 6. Dynamic Model Switch Endpoint (`POST /api/model/switch`)
สลับโหมดโมเดล AI ระหว่าง `lite` (1.5B) และ `advanced` (3B) อย่างปลอดภัย:
```bash
curl -X POST http://localhost:3000/api/model/switch \
  -H "Content-Type: application/json" \
  -d '{"mode": "advanced"}'
```
ตัวอย่าง Response:
```json
{
  "success": true,
  "previousMode": "lite",
  "currentMode": "advanced",
  "mode": "advanced",
  "label": "Advanced Mode (3B)",
  "model": "qwen2.5:3b",
  "estimatedRamMB": 2350,
  "loadedModels": ["qwen2.5:3b"]
}
```
