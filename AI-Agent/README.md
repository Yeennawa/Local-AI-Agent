# AI Agent Module (Raspberry Pi 5)

โมดูลนี้เป็นแกนประมวลผล AI Agent สำหรับโปรเจกต์ Local-AI-Agent ทำหน้าที่รับข้อความจาก Backend หรือ Web Client, วิเคราะห์เจตนา, ตัดสินใจเรียกใช้ Tool (ReAct pattern), และส่งคืนผลลัพธ์พร้อมค่าอารมณ์ (feeling) กลับไปให้ Frontend ใช้แสดงผลบน Avatar

โมดูลนี้ออกแบบให้ทำงานเป็นอิสระ (Deep Module) โดยเชื่อมต่อกับ Ollama ในเครื่อง และควบคุมปริมาณ Token กับการใช้หน่วยความจำเพื่อให้ทำงานบน Raspberry Pi 5 (RAM 4GB) ได้อย่างเสถียร 100% ปราศจากอาการหน่วยความจำล้น (OOM) และปกป้อง MicroSD Card จากการสึกหรอ (Zero Disk Writes)

> **แผนผังการทำงานภายในโมดูล AI-Agent (Interactive HTML พร้อมส่งออกรูปทำสไลด์):**  
> คลิกเปิดไฟล์ **[เปิดดูออนไลน์ (Interactive Web)](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/ai-agent-pipeline.html) หรือ [เปิดบน Localhost](http://localhost:3000/architecture/ai-agent-pipeline.html)** บนเว็บเบราว์เซอร์เพื่อสำรวจลำดับการทำงานทั้ง 3 เฟสและกดปุ่ม **Export SVG / Export PNG** มุมขวาบนเพื่อนำภาพไปใช้งานได้ทันที

---

## 1. โครงสร้างไฟล์ในโมดูลครบทุกไฟล์

```text
AI-Agent/
├── index.js          Entry point หลัก (Deep Module seam ส่งออกฟังก์ชัน runAgent และ applyToolModePolicy)
├── agent.js          ตัวควบคุมหลัก (pipeline: metaRecall -> noteRecall -> resolve -> route -> toolMode -> execute -> compose -> remember)
├── server.js         Express Server ให้บริการ API (/api/chat, /api/chat/stream, /api/linux/execute, /api/os/metrics, /api/health)
├── queue.js          ระบบคิวคำขอแบบเข้าก่อน-ออกก่อน (Linux FIFO Runqueue v2) ควบคุมการรันบน Pi 5 พร้อมคำนวณ EWMA + P90 ETA
├── ollamaClient.js   ตัวเชื่อมต่อ Ollama API (stream, abort controller, keep-alive 2m, numCtx 4096, Watchdog Heartbeat)
├── modelManager.js   ระบบจัดการสลับโมเดลแบบไดนามิก (1.5B / 3B) ควบคุม sequential unload และ RAM verification
├── osMonitor.js      ตัววัดสถานะเคอร์เนล Linux (/proc/meminfo, ZRAM, SoC Temp, Rolling CPU) และ Active Governor ป้องกัน OOM
├── telemetry.js      โมดูลคำนวณและประเมิน Token, Context Window, และสถิติ Real-time (0 MicroSD writes)
├── toolMode.js       ระบบควบคุมโหมดเครื่องมือแบบ Pure Functional (auto, chat, search, linux)
├── router.js         ระบบคัดกรองเจตนาแบบ Deterministic 100% (23 หมวดหมู่) ปราศจาก LLM decision loop
├── resolver.js       ระบบเชื่อมโยงคำถามต่อเนื่อง (Conversational Query Resolver) เติมประธาน/กรรมที่หาย
├── normalizer.js     ระบบปรับสภาพข้อความภาษาไทย (Thai Query Normalizer) ถอดคำย่อ, ขยายคีย์เวิร์ด, SOV Disambiguation
├── memory.js         ระบบความจำเซสชัน 30 รอบ (3,200 ตัวอักษร) และ Note Memory Ledger ในหน่วยความจำ (0 MicroSD writes)
├── answer.js         ระบบจัดรูปคำตอบ (Answer Composer) ตอบข้อมูลโครงสร้างด้วย Template (0 Tokens) และ Anti-Truncation ภาษาไทย
├── reflection.js     ระบบตรวจประเมินคุณภาพคำตอบสองชั้น (Two-Pass Self-Reflection) และตรวจจับการมั่วปี พ.ศ./ค.ศ.
├── languageGuard.js  ระบบตรวจจับภาษาและกำจัดตัวอักษรภาษาอื่นปนเปื้อน (CJK Character Leakage Cleaner)
├── safety.js         ระบบป้องกันความปลอดภัยและควบคุม Polarity (Polarity & Warning Guard)
├── replies.js        ตัวสร้างคำตอบตรงสำหรับข้อมูลตัวตน โหมดโมเดลที่กำลังทำงาน และรายการเครื่องมือในระบบ
├── culture.js        โมดูลความรู้รอบตัว มุกตลก คำศัพท์วัยรุ่น และ Roleplay Persona Adapter
├── parse.js          ฟังก์ชันอ่าน JSON จากโมเดล, ตรวจสอบ feeling และล้างประวัติแชต (sliding window)
├── cli.js            สคริปต์สำหรับทดสอบรันคำถามผ่าน Terminal
├── README.md         เอกสารฉบับนี้
├── linux/            โมดูลผู้ช่วย Linux OS (OS Lab Assistant)
│   ├── catalog.js       แคตตาล็อกคำสั่ง Linux 38 รายการ พร้อมคำอธิบาย Flag ละเอียด
│   ├── commandGuard.js  ระบบตรวจสอบความปลอดภัยคำสั่ง ป้องกัน Injection/คำสั่งทำลายระบบ และรัน execFile ปลอดภัย
│   └── linuxAssistant.js ตัวประมวลผลคำสั่งระบบ OS Lab แบบ Catalog-First และ Fallback Guarded LLM
└── tools/            โฟลเดอร์เก็บฟังก์ชันเครื่องมือ (Deterministic Tools ทั้ง 10 ตัว)
    ├── registry.js   ระบบลงทะเบียน ตรวจสอบสิทธิ์ และคุม Timeout (รองรับ per-tool timeout)
    ├── linuxTool.js  เครื่องมือผู้ช่วย Linux (linux_assistant)
    ├── systemInfo.js เครื่องมืออ่านสถานะเครื่องและแรม (get_system_info)
    ├── time.js       เครื่องมืออ่านเวลาและวันที่ปัจจุบัน (get_current_time)
    ├── calculator.js เครื่องมือคำนวณคณิตศาสตร์ปลอดภัย (calculate)
    ├── github.js     เครื่องมือค้นหาคลังโค้ดและผู้ใช้ GitHub (search_github)
    ├── wiki.js       เครื่องมือค้นหา Wikipedia พร้อมกลยุทธ์ 5 ชั้นและ Deep Passage Retrieval (search_wikipedia)
    ├── webSearch.js  เครื่องมือค้นหาเว็บแบบ Single Facade (search_web) จัดการ fallback Tavily -> DuckDuckGo
    ├── search/       โฟลเดอร์ผู้ให้บริการสืบค้นเว็บ (Modular Search Providers)
    │   ├── tavily.js      ผู้ให้บริการค้นหา Tavily API พร้อมระบบวินิจฉัยสถานะ API Key
    │   └── duckduckgo.js  ผู้ให้บริการค้นหา DuckDuckGo HTML Lite แบบ Zero-Key
    ├── news.js       เครื่องมือดึงข่าวสารล่าสุดจาก Google News RSS (get_news)
    ├── feedParser.js โมดูลช่วยแปลงข้อมูล RSS Feed สำหรับข่าว
    ├── weather.js    เครื่องมือตรวจสอบสภาพอากาศและอุณหภูมิ Real-time (get_weather)
    └── fx.js         เครื่องมือตรวจสอบและคำนวณอัตราแลกเปลี่ยนเงินตราสากล (get_fx)
```

---

## 2. เครื่องมือที่รองรับในระบบ (10 Deterministic Tools)

ระบบมีเครื่องมือประมวลผลที่แม่นยำ 10 ตัว ทำงานแบบ Deterministic โดยไม่พึ่งพาการสุ่มของโมเดล:

1. `linux_assistant`: ผู้ช่วยคำสั่งระบบปฏิบัติการ Linux พร้อมแคตตาล็อก 38 หมวดงานและตัวตรวจสอบความปลอดภัยคำสั่ง
2. `get_system_info`: อ่านค่าสถานะฮาร์ดแวร์ของ Raspberry Pi 5 (RAM รวม, RAM เหลือ, CPU Usage, อุณหภูมิ, Uptime)
3. `get_current_time`: ตรวจสอบวันและเวลาปัจจุบัน รองรับการระบุ Timezone (ค่าเริ่มต้น: `Asia/Bangkok`)
4. `calculate`: คำนวณนิพจน์คณิตศาสตร์อย่างแม่นยำ ปราศจากการใช้ `eval()`
5. `search_wikipedia`: ค้นหาข้อมูลเชิงลึกจาก Wikipedia ภาษาไทยและอังกฤษ พร้อมระบบข้าม Disambiguation
6. `search_web`: ค้นหาข้อมูลเว็บเปิดแบบ Single Facade มีระบบ Fallback อัจฉริยะ (Tavily AI -> DuckDuckGo HTML Lite)
7. `get_news`: ดึงข่าวเด่นล่าสุดจาก Google News RSS ภาษาไทย
8. `get_weather`: ตรวจสอบสภาพอากาศ อุณหภูมิ ความชื้น และความเร็วลมแบบ Real-time จาก Open-Meteo API
9. `get_fx`: คำนวณและแปลงอัตราแลกเปลี่ยนเงินตราต่างประเทศล่าสุด (เช่น USD, JPY, EUR เป็น THB)
10. `search_github`: ค้นหา Repository ยอดนิยม ข้อมูลเจ้าของโปรเจกต์ จำนวนดาว และภาษาที่ใช้บน GitHub

---

## 3. โหมดการทำงานของเครื่องมือ (Tool Modes)

ผู้ใช้สามารถสลับโหมดการทำงานของเครื่องมือได้ผ่านหน้าเว็บ (จำค่าสถานะผ่าน `localStorage`):

1. **Auto Mode (`auto`)** (ค่าเริ่มต้น): ทำงานตาม Adaptive RAG เต็มรูปแบบ เลือกระหว่างข้อมูลในตัว, เครื่องมือ, หรือการค้นหาเว็บตามเจตนาคำถาม
2. **Chat Mode (`chat`)**: ปิดการค้นหาเว็บภายนอกทั้งหมด ตอบคำถามทั่วไปด้วย Parametric Knowledge ทันทีเพื่อความรวดเร็วและประหยัด Token
3. **Search Mode (`search`)**: ยกระดับคำถามความรู้ทั่วไปและคำค้นหาให้เรียกใช้ `search_web` เพื่อสืบค้นข้อมูลเว็บเปิดแบบสดใหม่
4. **Linux Mode (`linux`)**: เจาะจงงานระบบปฏิบัติการ Linux และการทดลองบนบอร์ด Pi 5 รันคำสั่งปลอดภัยผ่านระบบ Command Guard

---

## 4. สถาปัตยกรรมความปลอดภัยและการปกป้องฮาร์ดแวร์ (Pi 5 Protection)

1. **FIFO Concurrency Control (`queue.js`)**: จำกัดให้ Ollama รันการอนุมานได้ทีละ 1 Request ป้องกัน OOM Crash พร้อมคำนวณเวลารอคอยแบบวิทยาศาสตร์ (EWMA + P90 Tail Latency)
2. **Zero Disk Writes & Note Memory Ledger (`memory.js`)**: ประวัติการสนทนาย้อนหลัง 30 รอบ (3,200 ตัวอักษร) จัดเก็บใน RAM ผ่านโครงสร้าง Map ไม่มีการเขียนไฟล์ชั่วคราวลงใน MicroSD Card
3. **Linux Kernel Telemetry & Active Governor (`osMonitor.js`)**: อ่านค่าจริงจาก `/proc/meminfo`, `/sys/block/zram0/mm_stat`, และ `/sys/class/thermal/thermal_zone0/temp` พร้อมปรับลดโควตา Token หรือบังคับใช้โมเดล Lite อัตโนมัติเมื่อหน่วยความจำเหลือน้อยกว่าเกณฑ์ปลอดภัย
4. **Linux Command Guard (`commandGuard.js`)**: วิเคราะห์ Token ของคำสั่ง Linux ก่อนรัน บล็อกคำสั่งอันตราย (`rm`, `dd`, `mkfs`, Fork Bomb, Root Tampering) และจำกัดการรันบนบอร์ด Pi เฉพาะคำสั่งประเภท Read-Only ตรวจสอบระบบ
5. **Token & Context Optimization (`ollamaClient.js` & `telemetry.js`)**: กำหนด Context Window 4,096 tokens โควตาสังเคราะห์คำตอบ 600 tokens (Lite) และ 768 tokens (Adv) พร้อมระบบ Anti-Truncation ป้องกันประโยคขาดช่วง
6. **Dynamic Model Switching (`modelManager.js`)**: สลับโมเดลระหว่าง `Lite` (1.5B, RAM ~1.15 GB) และ `Advanced` (3B, RAM ~2.35 GB) ด้วยกลไก Sequential Unload ปล่อยโมเดลเดิมออกจาก RAM ก่อนโหลดโมเดลใหม่เสมอ
