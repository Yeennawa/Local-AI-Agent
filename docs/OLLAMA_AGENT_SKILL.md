# Edge AI & Ollama Agent Engineering Guide
Target Platform: Raspberry Pi 5 (4GB RAM)
Architecture: Decoupled ReAct Pattern with Small Language Models (1B - 3B)

---

## 1. Core Philosophy and Architecture

การรันระบบ AI Agent บนอุปกรณ์เอดจ์อย่าง Raspberry Pi 5 ด้วยทรัพยากรจำกัด (Quad-core ARM, RAM 4GB) แตกต่างจากการเรียกใช้โมเดลขนาดใหญ่ผ่าน Cloud API อย่างสิ้นเชิง การนำโมเดลขนาด 70B+ มาเปรียบเทียบกับโมเดล 1B-3B บนอุปกรณ์ขนาดเล็กโดยใช้แนวทางเดิมจะทำให้ระบบล้มเหลวทันที ทั้งในด้านความเร็ว การใช้แรม และความถูกต้องของการตัดสินใจ

### ปัญหาของ In-Prompt Chaining บน Small LLM

ในการพัฒนา AI ทั่วไป มักใช้เทคนิค In-Prompt Chaining หรือให้อาร์กิวเมนต์ยาวๆ สั่งให้โมเดลคิด วิเคราะห์ วางแผน และสร้าง JSON หลายขั้นตอนในพรอมต์เดียว แนวทางนี้ใช้ได้ผลดีกับโมเดลระดับเรือธง แต่สำหรับโมเดลขนาด 1.5B (เช่น Qwen 2.5 1.5B):
- Parameter capacity ต่ำเกินกว่าจะจดจำ schema ที่ซับซ้อนไปพร้อมกับการประมวลผลตรรกะหลายชั้น
- Attention span สั้นลงอย่างเห็นได้ชัดเมื่อบริบทของข้อความยาวเกิน 1,500 โทเค็น
- โมเดลมักเกิดอาการลืมคำสั่ง สับสนระหว่างบทสนทนากับการเรียกใช้เครื่องมือ หรือหลุดโครงสร้าง JSON ออกมาเป็นข้อความธรรมดา

### Decoupled ReAct Pattern

เพื่อแก้ปัญหานี้ สถาปัตยกรรมที่ถูกต้องสำหรับ Edge AI คือการแยก State Machine ออกจากโมเดล:

```
[ User Request ]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ Node.js ReAct Controller (Deterministic State Machine) │
│ - Sliding window context                               │
│ - Circuit breaker (MAX_ITERATIONS <= 3)               │
│ - Tool call deduplication guard                       │
└────────────────────────────────┬───────────────────────┘
                                 │
     ┌───────────────────────────┴───────────────────────────┐
     ▼                                                       ▼
[ Step 1: Decision Phase ]                               [ Step 2: Observation & Answer ]
Ollama (temperature: 0.1)                                Node.js executes registered tool
Outputs next action only                                 Feeds observation back to Ollama
```

หลักการทำงานคือการเปลี่ยนบทบาทของโมเดลจาก "ผู้ควบคุมระบบทั้งหมด" ให้เหลือเพียง "ฟังก์ชันประเมินสถานการณ์ทีละขั้นตอน":
1. Node.js เป็นผู้คุมสถานะ (State Controller): ตัดสินใจว่ารอบนี้ต้องส่งข้อมูลอะไรให้โมเดล ตรวจสอบประวัติแชต และคุมโควตาการทำงาน
2. LLM ตัดสินใจเพียงหนึ่งก้าว (Single-step Decision): โมเดลมีหน้าที่แค่วิเคราะห์ว่า ณ ตอนนี้ ต้องเรียกใช้ Tool หรือพร้อมตอบผู้ใช้แล้ว
3. ระบบภายนอกประมวลผลเครื่องมือจริง (Deterministic Execution): Node.js ตรวจสอบความถูกต้องของคำขอ รันคำสั่งจริง และส่งผลลัพธ์กลับไปให้โมเดลเป็น Observation

### Untrusted Output Principle

ในการทำงานกับ Small LLM ต้องยึดหลักการไม่เชื่อถือผลลัพธ์จากโมเดลโดยเด็ดขาด:
- ห้ามนำสตริงที่ได้จากโมเดลไป eval หรือรันเป็นคำสั่งในระบบโดยตรง
- ทุกการเรียกใช้ฟังก์ชันต้องผ่าน Registry และ Whitelist เท่านั้น
- พารามิเตอร์ที่โมเดลส่งมาต้องผ่านการ Validate ประเภทข้อมูลก่อนส่งเข้าฟังก์ชันจริงเสมอ
- ผลลัพธ์ที่เป็น JSON ต้องรองรับความผิดพลาดในการจัดรูปแบบ เช่น การมีข้อความนำหน้า หรือการครอบด้วย Markdown code block

### Deep Module Boundary

โครงสร้างของระบบ AI Agent ต้องออกแบบให้เป็น Deep Module ตามหลักการซอฟต์แวร์ที่ดี:
- Interface ภายนอกต้องเรียบง่ายที่สุด มีเพียงฟังก์ชันหลักเช่น `runAgent({ message, conversationHistory })`
- ความซับซ้อนทั้งหมด ไม่ว่าจะเป็นการจัดการ Timeout, การคุม Context Window, การเชื่อมต่อ Socket ของ Ollama, หรือการต่อรอง ReAct Loop ต้องถูกซ่อนอยู่ภายในโมดูล
- ส่วนของ Backend และ Frontend ไม่ต้องรับรู้ว่าโมเดลกำลังทำ ReAct หรือเรียกใช้กี่ขั้นตอน สิ่งที่ส่งกลับออกไปต้องเป็นโครงสร้างข้อมูลมาตรฐานที่พร้อมแสดงผลทันที

---

## 2. Raspberry Pi 5 Runtime & Ollama Optimization

ฮาร์ดแวร์ Raspberry Pi 5 รุ่น RAM 4GB มีข้อจำกัดที่ต้องคำนึงถึงอย่างรอบคอบ ระบบปฏิบัติการและกระบวนการพื้นฐานของระบบใช้แรมไปแล้วประมาณ 600-800MB หากโปรแกรม Node.js ทำงานร่วมกับ Ollama จะเหลือพื้นที่หน่วยความจำปลอดภัยสำหรับการรันโมเดลไม่เกิน 2.5GB

### ตารางเปรียบเทียบการเลือกโมเดลบน Raspberry Pi 5

| Model | Quantization | Model Size (Disk) | Memory Usage (RAM) | Speed (Pi 5) | คำแนะนำ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| qwen2.5:0.5b | q4_k_m | 398 MB | ~650 MB | ~28 t/s | เร็วมาก แต่ความสามารถในการตัดสินใจเรียกใช้ Tool ยังไม่เสถียรพอ |
| qwen2.5:1.5b | q4_k_m | 986 MB | ~1.3 GB | ~14-16 t/s | จุดสมดุลที่ดีที่สุดระหว่างความเร็ว ความแม่นยำในการเรียก Tool และการกินแรม |
| qwen2.5:3b | q4_k_m | 1.9 GB | ~2.6 GB | ~7-8 t/s | ตอบคำถามได้ดีขึ้น แต่ความเร็วลดลงครึ่งหนึ่ง เสี่ยงต่อภาวะแรมตึงตัว |
| llama3.2:3b | q4_k_m | 2.0 GB | ~2.7 GB | ~6-7 t/s | ประมวลผลภาษาไทยได้ช้ากว่าตระกูล Qwen |

สำหรับระบบนี้ โมเดลที่เหมาะสมที่สุดคือ `qwen2.5:1.5b`

### การกำหนดค่า Options ใน Ollama

เมื่อส่งคำขอไปยัง Ollama API (`/api/chat` หรือ `/api/generate`) จำเป็นต้องระบุพารามิเตอร์เพื่อควบคุมการทำงานดังนี้:

```json
{
  "options": {
    "num_ctx": 1536,
    "num_thread": 3,
    "temperature": 0.1,
    "top_p": 0.9
  },
  "keep_alive": "2m"
}
```

เหตุผลเบื้องหลังของแต่ละค่า:

1. `num_ctx: 1536`
   - ค่าเริ่มต้นของ Ollama มักเป็น 4096 หรือ 8192 ซึ่ง KV Cache จะถูกจองพื้นที่ในหน่วยความจำ RAM ล่วงหน้า
   - การเปิด Context กว้างเกินไปบนเครื่องแรม 4GB จะทำให้ KV Cache กินแรมโดยเปล่าประโยชน์ และเพิ่มความเสี่ยงที่ระบบจะถูก Linux OOM Killer ปิดกระบวนการ
   - การตั้งไว้ที่ 1536 เพียงพอสำหรับ System Prompt, ประวัติแชต 4 เทิร์น, Tool schemas และผลลัพธ์ Observation

2. `num_thread: 3`
   - ซีพียูของ Pi 5 เป็น Quad-core Cortex-A76 (4 คอร์)
   - หากตั้งค่าเป็น 4 เธรด Ollama จะแย่งการทำงานของซีพียูทั้งหมด ทำให้ Node.js Event Loop เกิดอาการกระตุกหรือตอบสนองช้าลง
   - การตั้งไว้ที่ 3 เธรดช่วยให้เหลือ 1 คอร์สำหรับ Node.js, งานเครือข่าย และระบบปฏิบัติการ

3. `keep_alive: "2m"`
   - กำหนดให้ Ollama คงโมเดลไว้ในแรมเป็นเวลา 2 นาทีหลังจากประมวลผลเสร็จ
   - หากมีการสนทนาต่อเนื่อง ผู้ใช้จะไม่เสียเวลาโหลดโมเดลใหม่ (หลีกเลี่ยง Cold Start)
   - หากไม่มีการสนทนาเกิน 2 นาที ระบบจะคืนแรม 1.3GB กลับสู่ระบบปฏิบัติการโดยอัตโนมัติ

4. Temperature Management ตามแต่ละเฟส
   - Decision / Action Phase: ใช้ `temperature: 0.1` เพื่อให้โมเดลตอบอย่างแม่นยำ ไม่สุ่ม และสร้างโครงสร้าง JSON ที่เสถียร
   - Synthesis / Final Answer Phase: ใช้ `temperature: 0.7` เพื่อให้ภาษาในการตอบมีความเป็นธรรมชาติและมีการแสดงอารมณ์ที่หลากหลาย

---

## 3. Tool Definition and Prompt Schema Engineering

Small Language Model ไม่สามารถแยกแยะ Tool ที่มีโครงสร้างซับซ้อนได้ดี การออกแบบ Tool ต้องใช้หลักการความเรียบง่ายและมีความหมายชัดเจนในตัวเอง

### กฎการออกแบบ Tool สำหรับ Small LLM

1. ใช้เฉพาะ Flat Parameters:
   - หลีกเลี่ยงพารามิเตอร์แบบ Object ซ้อน Object ให้ใช้เฉพาะ string, number, หรือ boolean
   - หากมีข้อมูลหลายตัว ให้แยกเป็นฟิลด์เดี่ยวในระดับบนสุด

2. High-Signal Descriptions:
   - เขียนคำอธิบายฟังก์ชันให้กระชับ ระบุหน้าที่ตรงไปตรงมา และบอกเงื่อนไขว่าเมื่อไหร่ควรใช้
   - ระบุตัวอย่างค่าที่ถูกต้องในคำอธิบายพารามิเตอร์อย่างชัดเจน

3. Strict Whitelisting:
   - ตรวจสอบชื่อเครื่องมือก่อนสั่งทำงานจริงเสมอ หากโมเดลสร้างชื่อฟังก์ชันที่ไม่มีอยู่ในระบบ ให้ปฏิเสธและแจ้งกลับทันที

4. Deduplication Guard:
   - ป้องกันไม่ให้โมเดลเรียก Tool เดิมซ้ำด้วยพารามิเตอร์เดิมในรอบ ReAct เดียวกัน
   - หากโมเดลพยายามเรียกซ้ำ ให้ส่งผลลัพธ์เดิมกลับไปเป็น Observation พร้อมแจ้งโมเดลว่าข้อมูลนี้ได้รับไปแล้ว เพื่อบังคับให้โมเดลสรุปคำตอบ

### เปรียบเทียบการออกแบบ Tool Schema

รูปแบบที่ไม่ควรใช้ (Shallow & Complex):
```json
{
  "name": "system_diagnostics",
  "description": "Comprehensive hardware and OS monitor for system health telemetry",
  "parameters": {
    "filter": {
      "type": "object",
      "properties": {
        "metrics": { "type": "array", "items": { "type": "string" } },
        "timeRange": { "type": "string" }
      }
    }
  }
}
```
ข้อเสีย: โมเดลขนาด 1.5B มักสร้าง array ผิด หรือใส่ object ไม่ครบ ทำให้ JSON parsing ล้มเหลว

รูปแบบที่ถูกต้อง (Deep & Flat):
```json
{
  "name": "get_system_info",
  "description": "Get current Raspberry Pi hardware stats including memory usage, CPU cores, platform, and uptime.",
  "parameters": {}
}
```
ข้อดี: ไม่มีพารามิเตอร์ที่ต้องคาดเดา ลดโอกาสเกิดความผิดพลาดลงเหลือศูนย์

---

## 4. Circuit Breakers and System Resilience

ในการรันระบบบนสภาพแวดล้อมจริง ความเสถียรของระบบไม่ได้ขึ้นอยู่กับความฉลาดของโมเดล แต่ขึ้นอยู่กับระบบป้องกันความผิดพลาดที่เขียนครอบไว้

### 1. Loop Guard (MAX_ITERATIONS <= 3)

โมเดลขนาดเล็กอาจติดอยู่ในสถานะวนลูป เช่น พยายามเรียกใช้ Tool ซ้ำไปซ้ำมาเพราะไม่เข้าใจผลลัพธ์ Observation
ระบบ ReAct Controller ต้องจำกัดรอบการทำงานไว้ที่ 3 รอบ:

```javascript
let iterations = 0;
const MAX_ITERATIONS = 3;

while (iterations < MAX_ITERATIONS) {
  iterations += 1;
  const decision = await getModelDecision(promptHistory);
  
  if (decision.action === 'final_answer') {
    return decision;
  }
  
  // Execute tool and record observation...
}

// เมื่อครบโควตา บังคับให้โมเดลสังเคราะห์คำตอบจากข้อมูลที่มีอยู่ทันที
return await forceFinalAnswer(promptHistory);
```

### 2. Request Timeout และ AbortController

เมื่อรันบน Raspberry Pi 5 การเรียกโมเดลครั้งแรก (Cold Start) หรือช่วงที่ซีพียูรับภาระหนักอาจทำให้การตอบสนองช้าลง แต่ระบบต้องไม่ค้างอย่างไม่มีกำหนด
- กำหนดค่า Timeout ไว้ที่ 25 วินาที
- ใช้อ็อบเจกต์ `AbortController` เพื่อตัดการเชื่อมต่อ Socket ทันทีที่หมดเวลา ป้องกันปัญหา connection ค้างสะสมในระบบ

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 25000);

try {
  const response = await fetch(ollamaEndpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  return await response.json();
} finally {
  clearTimeout(timeoutId);
}
```

### 3. Markdown Fence and Fallback JSON Extraction

โมเดลมักใส่คำพูดเปิดหัวหรือปิดท้าย หรือครอบผลลัพธ์ด้วยเครื่องหมาย code block การใช้ `JSON.parse` แบบตรงไปตรงมาจะทำให้ระบบพังบ่อยครั้ง
ระบบต้องใช้กระบวนการสกัด JSON:
1. ใช้ Regular Expression ค้นหากลุ่มข้อความที่อยู่ระหว่างเครื่องหมาย markdown code block (` ```json ... ``` `)
2. หากไม่พบ ให้ค้นหากลุ่มข้อความที่ขึ้นต้นด้วย `{` และลงท้ายด้วย `}`
3. หากยังไม่สามารถ parse ได้ ให้ส่งข้อความนั้นกลับมาเป็นคำตอบแบบปกติในโหมด fallback แทนที่จะโยนข้อยกเว้น (Exception) ออกมา

### 4. Sliding Window Context Management

เพื่อป้องกันไม่ให้ Token เกินขีดจำกัด `num_ctx: 1536` ประวัติการสนทนาต้องถูกตัดทอนให้อยู่ในกรอบเสมอ:
- เก็บเฉพาะ 4 ข้อความล่าสุด (ผู้ใช้ 2 ข้อความ และโมเดล 2 ข้อความ)
- ละทิ้งข้อความที่เก่ากว่านั้น
- วิธีนี้ทำให้ขนาดของ Input Prompt คงที่อยู่ที่ประมาณ 400-700 โทเค็นเสมอ ป้องกันภาวะหน่วยความจำบวมและช่วยรักษาความเร็วในการประมวลผล

---

## 5. Telemetry, Profiling and Benchmarking

ในการนำระบบขึ้นไปรันบนอุปกรณ์จริง การตรวจวัดประสิทธิภาพช่วยให้เห็นปัญหาคอขวดและปรับปรุงระบบได้อย่างตรงจุด

### ตัวชี้วัดสำคัญ (Key Metrics)

1. Generation Speed (Tokens per Second):
   - คำนวณจากค่า `eval_count` และ `eval_duration` ที่ Ollama ส่งกลับมาใน response metadata:
   - `Tokens/sec = eval_count / (eval_duration_nanoseconds / 1,000,000,000)`
   - มาตรฐานที่ยอมรับได้สำหรับ Pi 5: มากกว่า 12 tokens/sec

2. Time to First Token (TTFT) / Prompt Eval Time:
   - คำนวณจากค่า `prompt_eval_duration`
   - ตัวเลขนี้บ่งบอกว่าโมเดลใช้เวลาอ่าน System Prompt และประวัติแชตนานแค่ไหนก่อนจะเริ่มสร้างคำตอบตัวแรก
   - มาตรฐานที่เหมาะสม: ไม่ควรเกิน 1.5 - 2.5 วินาที

3. Resident Set Size (RSS Memory):
   - การใช้แรมจริงของกระบวนการ Node.js ผ่าน `process.memoryUsage().rss`
   - กระบวนการ Node.js ไม่ควรใช้แรมเกิน 150MB

4. Hardware Throttling & Thermal State:
   - บน Pi 5 หากความร้อนสูงเกิน 80-85 องศาเซลเซียส ซีพียูจะลดความเร็วลง (Thermal Throttling) ทำให้ความเร็วในการสร้างโทเค็นตกลงทันที

### คำสั่งตรวจสอบสถานะฮาร์ดแวร์บน Raspberry Pi 5

เรียกใช้คำสั่งเหล่านี้ผ่าน Terminal ของ Pi 5 เพื่อประเมินสถานะของเครื่อง:

```bash
# ตรวจสอบอุณหภูมิซีพียู
vcgencmd measure_temp

# ตรวจสอบสถานะ Throttling (หากผลลัพธ์เป็น 0x0 แปลว่าปกติ ไม่มีการลดความเร็วหรือไฟตก)
vcgencmd get_throttled

# ตรวจสอบการใช้งานหน่วยความจำ RAM และ Swap แบบเข้าใจง่าย
free -h

# ดูปริมาณการใช้ทรัพยากรของแต่ละโปรเซสแบบเรียลไทม์
htop
```

### แนวทางการแก้ปัญหาที่พบบ่อย (Troubleshooting)

1. ระบบเริ่มตอบช้าลงเรื่อยๆ หลังเปิดใช้งานไปนานๆ:
   - สาเหตุ: ประวัติการสนทนาสะสมจนขนาด Prompt ใหญ่ขึ้นเรื่อยๆ
   - วิธีแก้: ตรวจสอบว่าระบบ Sliding Window ทำงานถูกต้อง และจำกัดประวัติแชตไม่เกิน 4 เทิร์น

2. บอร์ด Raspberry Pi 5 ค้าง หรือโปรแกรมดับไปเฉยๆ:
   - สาเหตุ: แรมเต็มจนระบบเรียกใช้ Swap หนัก หรือถูก Linux OOM Killer ปิดโปรเซส
   - วิธีแก้: ลดค่า `num_ctx` ลงเหลือ 1536 และตรวจสอบว่าตั้งค่า `keep_alive: "2m"` เพื่อไม่ให้ Ollama จองแรมทิ้งไว้

3. โมเดลเรียกใช้ Tool สลับไปมาไม่ยอมจบ:
   - สาเหตุ: System Prompt คลุมเครือ หรือ Observation ที่ส่งกลับไปไม่มีข้อมูลที่โมเดลต้องการ
   - วิธีแก้: ตรวจสอบ Loop Guard ให้ตัดรอบที่ 3 และปรับปรุงคำอธิบายของ Tool ให้ชัดเจนว่าข้อมูลใดส่งกลับมาแล้วบ้าง
