# AI Agent Module (Raspberry Pi 5)

โมดูลนี้เป็นส่วนประมวลผล AI Agent สำหรับโปรเจกต์ Local-AI-Agent ทำหน้าที่รับข้อความจาก Backend, วิเคราะห์คำสั่ง, ตัดสินใจเรียกใช้ Tool (ReAct pattern), และส่งคืนผลลัพธ์พร้อมค่าอารมณ์ (feeling) กลับไปให้ Frontend ใช้แสดงผลบน Avatar

โมดูลนี้ออกแบบให้ทำงานเป็นอิสระ (Deep Module) โดยเชื่อมต่อกับ Ollama ในเครื่อง และควบคุมปริมาณ Token กับการใช้หน่วยความจำเพื่อให้ทำงานบน Raspberry Pi 5 (RAM 4GB) ได้อย่างเสถียร

---

## 1. โครงสร้างไฟล์

```text
AI-Agent/
├── index.js          Entry point หลักสำหรับให้ Backend เรียกใช้งาน
├── agent.js          ตัวควบคุม ReAct loop, loop guard, และการสรุปผลลัพธ์
├── ollamaClient.js   ตัวเชื่อมต่อ Ollama API (stream, timeout ที่ยกเลิก request จริง, keep-alive)
├── parse.js          ฟังก์ชันอ่าน JSON จากโมเดล, ตรวจ feeling และล้างประวัติแชต
├── cli.js            สคริปต์สำหรับทดสอบรันคำถามผ่าน Terminal
├── README.md         เอกสารฉบับนี้
└── tools/            โฟลเดอร์เก็บฟังก์ชันเครื่องมือ
    ├── registry.js   ระบบลงทะเบียนและตรวจสอบสิทธิ์ของ Tool
    ├── systemInfo.js ฟังก์ชันอ่านสถานะเครื่องและแรม (get_system_info)
    └── time.js       ฟังก์ชันอ่านเวลาและวันที่ (get_current_time)
```

---

## 2. ข้อตกลงการแก้ไขโค้ดสำหรับสมาชิกในทีม

เพื่อให้ระบบทำงานร่วมกันได้โดยไม่เกิดข้อผิดพลาดหรือทำให้บอร์ดค้าง รบกวนปฏิบัติตามแนวทางนี้ครับ:

### ไฟล์ที่เรียกใช้งานหรือแก้ไขเพิ่มเติมได้

1. `AI-Agent/index.js`:
   - ฝั่ง Backend สามารถ import ฟังก์ชัน `runAgent` ไปใช้งานใน Express หรือ API route ได้ทันที
2. `AI-Agent/tools/`:
   - สมาชิกในทีมสามารถเพิ่ม Tool ใหม่ได้ตามต้องการ (เช่น อ่านเซนเซอร์ หรือควบคุมอุปกรณ์) โดยเขียนตามรูปแบบในหัวข้อด้านล่าง
3. `AI-Agent/cli.js`:
   - ใช้พิมพ์ทดสอบคุยกับ Agent ใน Terminal ได้ตามสะดวก

### ไฟล์ที่ไม่ควรแก้ไข

1. `AI-Agent/agent.js`:
   - มี ReAct loop, loop guard (จำกัดไม่เกิน 3 รอบ), และระบบตัดประวัติแชตเก่า (Sliding window) เพื่อคุมปริมาณ Token และป้องกันบอร์ดแรมเต็ม
2. `AI-Agent/ollamaClient.js`:
   - มีการตั้งค่า timeout (25 วินาที) ที่ยกเลิก request ไปยัง Ollama จริงเมื่อหมดเวลา, keep-alive (2 นาที), และตั้ง `num_ctx` 1536 กับ `num_thread` 3 ให้เหมาะกับ Pi 5 (ปรับได้ด้วย env `OLLAMA_NUM_CTX` และ `OLLAMA_NUM_THREAD` เท่านั้น ไม่ต้องแก้โค้ด)
3. `AI-Agent/parse.js`:
   - ด่านตรวจผลลัพธ์จากโมเดลก่อนใช้งานจริง ทั้ง JSON, ค่า feeling และประวัติแชตที่ Backend ส่งมา
4. `AI-Agent/tools/registry.js`:
   - มี whitelist ชื่อ Tool, ตรวจชนิดของ parameter และตัด Tool ที่ค้างเกิน 5 วินาที โดยไม่ throw error ออกมา

---

## 3. คู่มือการติดตั้งและรันบน Raspberry Pi 5

เมื่อนำโค้ดไปรันบน Raspberry Pi 5 (Raspberry Pi OS 64-bit) ให้ทำตามขั้นตอนดังนี้:

### ขั้นตอนที่ 1: ติดตั้ง Ollama (ระดับ OS - ทำครั้งเดียว)

เปิด Terminal บน Raspberry Pi 5 แล้วรันคำสั่ง:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

หากต้องการให้เครื่องอื่นในวงแลนยิงเข้ามาหา Ollama บน Pi ได้ ให้เปิดอนุญาต network:

```bash
sudo systemctl edit ollama.service
```

เพิ่มข้อความ:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
```

แล้วรีสตาร์ต service:

```bash
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

### ขั้นตอนที่ 2: ดาวน์โหลดโมเดล

ดาวน์โหลดโมเดล qwen2.5:1.5b (ขนาดประมาณ 986 MB ใช้แรมประมาณ 1.2GB เหมาะกับ Pi 5):

```bash
ollama pull qwen2.5:1.5b
```

### ขั้นตอนที่ 3: ติดตั้ง Node.js Dependencies

```bash
git clone https://github.com/Yeennawa/Local-AI-Agent.git
cd Local-AI-Agent
npm install
```

### ขั้นตอนที่ 4: ทดสอบการทำงาน

```bash
# รันชุดทดสอบอัตโนมัติ
npm test

# หรือทดสอบผ่าน CLI
node AI-Agent/cli.js "เครื่องสถานะเป็นยังไงบ้าง แรมเหลือเท่าไหร่"
```

---

## 4. ตัวอย่างการเชื่อมต่อสำหรับฝั่ง Backend

ฝั่ง Backend สามารถเรียกใช้ฟังก์ชัน `runAgent` ได้ดังนี้:

```javascript
import { runAgent } from './AI-Agent/index.js';

app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  const result = await runAgent({
    message,
    conversationHistory: conversationHistory || []
  });

  res.json(result);
});
```

### รูปแบบข้อมูลที่ส่งกลับ (AgentResponse)

```json
{
  "text": "ขณะนี้เครื่อง Raspberry Pi 5 มีแรมเหลือ 2,150 MB จาก 4,096 MB ครับ",
  "status": "idle",
  "feeling": "happy",
  "toolsUsed": [
    {
      "tool": "get_system_info",
      "params": {},
      "result": { "freeMemoryMB": 2150, "memoryUsagePercent": 47.5 },
      "durationMs": 2
    }
  ],
  "error": null
}
```

- ค่า `feeling` มี: `happy`, `neutral`, `surprised`, `confused`, `proud` สำหรับนำไปสลับรูปหน้า Avatar
- ค่า `status` มี: `idle`, `using_tool`, `error` สำหรับแสดงสถานะการทำงาน

---

## 5. วิธีเพิ่ม Tool ใหม่

หากต้องการเพิ่ม Tool ใหม่ (เช่น อ่านเซนเซอร์):

1. สร้างไฟล์ใน `AI-Agent/tools/<toolName>.js`:

```javascript
export const sensorTool = {
  name: 'read_sensor',
  description: 'อ่านค่าอุณหภูมิและความชื้นจากเซนเซอร์',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  dangerous: false,
  async execute() {
    return { temperature: 28.5, humidity: 65 };
  }
};
```

2. ลงทะเบียนใน `AI-Agent/tools/registry.js`:

```javascript
import { sensorTool } from './sensor.js';

// ใน constructor:
this.registerTool(sensorTool);
```

3. รัน `npm test` เพื่อตรวจสอบความถูกต้อง ระบบจะตรวจพบ Tool ใหม่และให้ AI เลือกใช้งานได้ทันที
