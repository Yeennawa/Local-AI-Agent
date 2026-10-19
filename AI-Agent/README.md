# AI Agent Module (Raspberry Pi 5)

โมดูลนี้เป็นส่วนประมวลผล AI Agent สำหรับโปรเจกต์ Local-AI-Agent ทำหน้าที่รับข้อความจาก Backend หรือ Web Client, วิเคราะห์คำสั่ง, ตัดสินใจเรียกใช้ Tool (ReAct pattern), และส่งคืนผลลัพธ์พร้อมค่าอารมณ์ (feeling) กลับไปให้ Frontend ใช้แสดงผลบน Avatar

โมดูลนี้ออกแบบให้ทำงานเป็นอิสระ (Deep Module) โดยเชื่อมต่อกับ Ollama ในเครื่อง และควบคุมปริมาณ Token กับการใช้หน่วยความจำเพื่อให้ทำงานบน Raspberry Pi 5 (RAM 4GB) ได้อย่างเสถียร 100% ปราศจากอาการหน่วยความจำล้น (OOM) และปกป้อง MicroSD Card จากการสึกหรอ (Zero Disk Writes)

---

## 1. โครงสร้างไฟล์ในโมดูล

```text
AI-Agent/
├── index.js          Entry point หลัก (Deep Module seam ส่งออกฟังก์ชัน runAgent)
├── agent.js          ตัวควบคุมหลัก (pipeline: metaRecall -> noteRecall -> resolve -> route -> execute -> compose -> remember)
├── router.js         ระบบคัดกรองเจตนาแบบ Deterministic 100% ปราศจาก LLM decision loop
├── resolver.js       ระบบขยายคำถามต่อเนื่อง (Conversational Query Resolver) เติมประธาน/กรรมที่หาย
├── answer.js         ระบบจัดรูปคำตอบ (Answer Composer) ตอบข้อมูลโครงสร้างด้วย Template (0 Tokens) และเกลาบริบทเว็บ/วิกิ
├── safety.js         ระบบป้องกันความปลอดภัยและควบคุม Polarity (Polarity & Warning Guard)
├── normalizer.js     ระบบปรับสภาพข้อความภาษาไทย (Thai Query Normalizer) ถอดคำย่อ, ขยายคีย์เวิร์ด, SOV Disambiguation
├── memory.js         ระบบความจำเซสชันและ Note Memory Ledger ในหน่วยความจำ (0 MicroSD card writes)
├── culture.js        โมดูลความรู้รอบตัว มุกตลก คำศัพท์วัยรุ่น และ Roleplay Persona Adapter
├── queue.js          ระบบคิวคำขอแบบเข้าก่อน-ออกก่อน (FIFO RequestQueue) ควบคุมการรันบน Pi 5
├── server.js         Express Server ให้บริการ API (/api/chat, /api/chat/stream, /api/health)
├── ollamaClient.js   ตัวเชื่อมต่อ Ollama API (stream, abort controller, keep-alive 2m)
├── parse.js          ฟังก์ชันอ่าน JSON จากโมเดล, ตรวจสอบ feeling และล้างประวัติแชต (sliding window)
├── cli.js            สคริปต์สำหรับทดสอบรันคำถามผ่าน Terminal
├── README.md         เอกสารฉบับนี้
└── tools/            โฟลเดอร์เก็บฟังก์ชันเครื่องมือ (Deterministic Tools ทั้ง 9 ตัว)
    ├── registry.js   ระบบลงทะเบียน ตรวจสอบสิทธิ์ และคุม Timeout (5 วินาที) ของ Tool
    ├── systemInfo.js เครื่องมืออ่านสถานะเครื่องและแรม (get_system_info)
    ├── time.js       เครื่องมืออ่านเวลาและวันที่ปัจจุบัน (get_current_time)
    ├── calculator.js เครื่องมือคำนวณคณิตศาสตร์ปลอดภัย (calculate)
    ├── github.js     เครื่องมือค้นหาคลังโค้ดและผู้ใช้ GitHub (search_github)
    ├── wiki.js       เครื่องมือค้นหา Wikipedia พร้อมกลยุทธ์ 5 ชั้นและ Deep Passage Retrieval (search_wikipedia)
    ├── webSearch.js  เครื่องมือค้นหาเว็บเปิด Zero-Key (search_web) ดึงผลลัพธ์จาก DuckDuckGo Lite & Wikipedia
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
5. `search_web`: ค้นหาข้อมูลเว็บเปิดแบบ Zero-Key API ไม่เสียค่าใช้จ่าย ดึงข้อมูลจาก DuckDuckGo HTML Lite และ Wikipedia Snippet พร้อม LRU Cache
6. `get_news`: ดึงข่าวเด่นล่าสุดจาก Google News RSS ภาษาไทย รองรับการกรองตามหมวดหมู่ (`technology`, `business`, `world`, `general`)
7. `get_weather`: ตรวจสอบสภาพอากาศ อุณหภูมิ ความชื้น และความเร็วลมแบบ Real-time จาก Open-Meteo API
8. `get_fx`: คำนวณและแปลงอัตราแลกเปลี่ยนเงินตราต่างประเทศล่าสุด (เช่น USD, JPY, EUR เป็น THB)
9. `search_github`: ค้นหา Repository ยอดนิยม ข้อมูลเจ้าของโปรเจกต์ จำนวนดาว และภาษาที่ใช้บน GitHub

---

## 3. สถาปัตยกรรมความปลอดภัยและการปกป้องฮาร์ดแวร์ (Pi 5 Protection)

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
   - กำหนด `num_ctx: 1536` และ `num_thread: 3` เพื่อสงวน 1 CPU Core สำหรับ Node.js Event Loop
   - ใช้ `keep_alive: "2m"` ป้องกันการโหลดโมเดลเข้าออก RAM บ่อยครั้ง
   - กำหนด Sliding Window เก็บเฉพาะบทสนทนา 4 ข้อความล่าสุด (2 Turns) และจำกัดขนาดของข้อความไม่ให้บวม

---

## 4. คู่มือการติดตั้งและเปิดใช้งาน

### ติดตั้ง Ollama และดาวน์โหลดโมเดล (ทำครั้งเดียว):

```bash
# ติดตั้ง Ollama
curl -fsSL https://ollama.com/install.sh | sh

# ดึงโมเดล qwen2.5:1.5b (ขนาดประมาณ 986 MB)
ollama pull qwen2.5:1.5b
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
# รันชุดทดสอบ Unit และ Integration Tests ทั้งหมด (226 tests, 59 suites)
npm test

# รันชุดทดสอบประเมินผลคุณภาพและความแม่นยำของ Intent Router & Memory (69/69 tests)
node tests/eval/runner.js

# ทดสอบคุยกับ Agent ผ่าน Terminal โดยตรง
node AI-Agent/cli.js "นายกไทยคนปัจจุบันคือใคร"
```

---

## 5. การเชื่อมต่อ API สำหรับนักพัฒนา (API Contract)

### 1. HTTP Endpoint ทั่วไป (`POST /api/chat`)
ส่งข้อความคำถาม และรับคำตอบ JSON แบบรอบเดียว:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ตอนนี้เวลาเท่าไหร่แล้ว", "sessionId": "session-001"}'
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
  "sessionId": "session-001",
  "error": null
}
```

### 2. Server-Sent Events Streaming (`POST /api/chat/stream`)
รับคำตอบแบบ Real-time ทีละ Token สำหรับหน้าจอแชตที่ต้องการให้ข้อความทยอยพิมพ์:
```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "เล่าประวัติความเป็นมาของคอมพิวเตอร์สั้นๆ", "sessionId": "session-001"}'
```
Event ที่ส่งออกมา:
- `event: status`: ส่งสถานะการทำงานปัจจุบัน (`using_tool`, `synthesizing`)
- `event: token`: ส่งชิ้นส่วนข้อความ `{ "token": "คอมพิวเตอร์" }`
- `event: done`: ส่งโครงสร้าง `AgentResponse` ฉบับเต็มเมื่อการสังเคราะห์เสร็จสิ้น

### 3. Health & Telemetry Endpoint (`GET /api/health`)
ตรวจสอบข้อมูลสถานะฮาร์ดแวร์ คิวงาน และหน่วยความจำของบอร์ด Raspberry Pi 5:
```bash
curl http://localhost:3000/api/health
```
