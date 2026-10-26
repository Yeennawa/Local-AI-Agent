# Local AI Agent - Frontend Documentation

เอกสารแนะนำสถาปัตยกรรมและการเชื่อมต่อของส่วนติดต่อผู้ใช้ (Frontend Web Client) สำหรับโปรเจกต์ `Local-AI-Agent`

![Frontend Web UI](../docs/assets/web-ui-overview.png)
> คลิกเปิดดูภาพหน้าจอขนาดเต็มพร้อมระบบส่งออกภาพคมชัดสูงสำหรับทำสไลด์: **[เปิดดูออนไลน์ (Interactive Web Preview)](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/web-ui-preview.html)** | **[เปิดบน Localhost](http://localhost:3000/architecture/web-ui-preview.html)**

> **แผนผังสถาปัตยกรรมและการไหลของ Event ฝั่ง Frontend (Interactive HTML พร้อมส่งออกรูปทำสไลด์):**  
> คลิกเปิดไฟล์ **[เปิดดูออนไลน์ (Interactive Web)](https://htmlpreview.github.io/?https://github.com/Yeennawa/Local-AI-Agent/blob/main/docs/architecture/frontend-architecture.html) หรือ [เปิดบน Localhost](http://localhost:3000/architecture/frontend-architecture.html)** บนเว็บเบราว์เซอร์เพื่อสำรวจการทำงานของ SSE Stream, แอนิเมชันอวตาร 0-CPU, และแผงวัดสถิติ Real-time พร้อมกดปุ่ม **Export SVG / Export PNG** มุมขวาบนเพื่อนำภาพไปใส่สไลด์ได้ทันที

---

## 1. ภาพรวมและหน้าที่ของ Frontend

Frontend ของระบบทำหน้าที่เป็นส่วนแสดงผลแบบโต้ตอบ (Interactive Web Client) ผ่านเว็บเบราว์เซอร์ โดยเชื่อมต่อกับ Backend ผ่าน HTTP REST API และ Server-Sent Events (SSE) มีหน้าที่หลักดังนี้:

1. **รับและส่งข้อความสนทนา**: รับข้อความคำถามจากผู้ใช้ จัดการประวัติการสนทนา (Sliding Window 30 รอบ) และส่งต่อไปยัง Backend
2. **แสดงผลแบบ Streaming**: รับข้อมูลผลลัพธ์ทีละ Token ผ่าน SSE เพื่อแสดงผลข้อความตอบกลับแบบค่อยๆ พิมพ์ (Typewriter Effect)
3. **ควบคุมโหมดการทำงาน**:
   - **Model Switcher**: สลับโหมด AI ระหว่าง `Lite (1.5B)` และ `Adv (3B)`
   - **Tool Mode Switcher**: ปรับโหมดการทำงานของเครื่องมือระหว่าง `ออโต้` (Auto), `คุยล้วน` (Chat), `ค้นเว็บ` (Search), และ `Linux` (ผู้ช่วยคำสั่งระบบ OS พร้อมปุ่มคัดลอกและรันบนบอร์ด Pi)
4. **แผงแสดงสถิติ Token & บริบท Real-time (Telemetry Side Drawer)**:
   - แสดงแถบวัดปริมาณ Token ใน Context Window (เพดาน 4,096 tokens)
   - แสดงสถานะความจำในเซสชัน (Sliding Memory สูงสุด 30 รอบ)
   - แสดงความเร็วในการสร้างโทเค็น (tokens/sec) และยอดรวมการใช้งานในแชตปัจจุบัน
   - รองรับการเปิด/ปิดด้วยปุ่ม `สถิติ Token` เพื่อไม่ให้บดบังการอ่าน
5. **แอนิเมชัน Avatar State Machine**: ขับเคลื่อนตัวละครอวตาร (`.ai-character`) ผ่าน CSS GPU Compositor บนเบราว์เซอร์ (ไม่กิน CPU ของบอร์ด Pi) รองรับ 6 สถานะ: `idle` (กะพริบตาและหายใจ), `listening` (เอียงหูฟังตอนพิมพ์), `queued` (รอคิว), `thinking` (สัญญาณเสากะพริบ), `tool` (ตาสแกนอ่านข้อมูล), `speaking` (ปากขยับตามโทเค็น) และสีหน้าอารมณ์ (`happy`, `neutral`, `surprised`, `confused`, `proud`) พร้อมรองรับ `prefers-reduced-motion`
6. **แสดงป้ายกำกับความโปร่งใส (Metadata Badges)**: แสดงชื่อโมเดลและเครื่องมือที่ถูกเรียกใช้งานจริงใต้ข้อความตอบกลับทุกข้อความ
7. **ระบบการ์ดคำสั่ง Linux (`.linux-card`)**: แสดงผลคำสั่ง Linux พร้อมป้ายระดับความเสี่ยง (Read-only / Modify / Destructive), ตารางอธิบาย Flag, ปุ่มคัดลอกคำสั่ง, และปุ่มรันบนบอร์ด Pi พร้อมแสดงผล Terminal จำลอง

---

## 2. โครงสร้างไฟล์

```text
Frontend/
├── index.html        # โครงสร้างหน้าเว็บ แผงควบคุม อวตาร และ Telemetry Drawer
├── style.css         # สไตล์ชีท Cyber-Minimalist และ Responsive Layout สำหรับมือถือ
├── app.js            # ตรรกะฝั่ง Client จัดการสถานะ, SSE Streaming, และ Real-time Meters
└── ReadMe.md         # เอกสารฉบับนี้
```

---

## 3. วิธีเปิดใช้งาน Frontend

### รูปแบบที่ 1: รันผ่าน Express Server (แนะนำ - Production & Development)
เมื่อรันเซิร์ฟเวอร์หลักผ่าน Node.js เซิร์ฟเวอร์จะให้บริการไฟล์ Frontend โดยอัตโนมัติบน Port 3000:

```bash
npm start
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

### รูปแบบที่ 2: รันแบบ Standalone ด้วย Mock Mode (ไม่ต้องเปิด Backend)
หากต้องการทดสอบหรือแก้ไขงานดีไซน์เฉพาะส่วนหน้าเว็บโดยไม่ต้องเปิด Ollama:
1. เปิดไฟล์ `Frontend/app.js` แล้วตั้งค่า:
   ```javascript
   const USE_MOCK_API = true;
   ```
2. เปิดไฟล์ `Frontend/index.html` ด้วย Live Server ใน Visual Studio Code หรือเปิดไฟล์บนเบราว์เซอร์โดยตรง

---

## 4. ข้อกำหนดการเชื่อมต่อ API (Frontend - Backend Integration Contract)

### 4.1 การส่งข้อความแบบสตรีมมิง (`POST /api/chat/stream`) - โหมดหลัก

Frontend จะเชื่อมต่อผ่าน SSE เพื่อรับข้อความแบบ Real-time:

#### Request Headers:
```http
POST /api/chat/stream
Content-Type: application/json
```

#### Request Body:
```json
{
  "message": "อุณหภูมิกรุงเทพตอนนี้กี่องศา",
  "sessionId": "sess_1729612345_a1b2c3",
  "toolMode": "auto",
  "conversationHistory": [
    { "role": "user", "content": "สวัสดี" },
    { "role": "assistant", "content": "สวัสดีครับ มีอะไรให้ช่วยไหมครับ" }
  ]
}
```

#### Server-Sent Events ที่ Frontend ดักฟัง:
1. `event: queue`: ส่งข้อมูลสถานะคิวงาน (`position`, `estimatedWaitSec`, `runningJob`)
2. `event: status`: ส่งสถานะการทำงานปัจจุบัน
   - ขณะวิเคราะห์: `{ "status": "analyzing", "mode": "auto" }`
   - ขณะคัดกรอง: `{ "status": "routed", "intent": "tool", "reasonThai": "เลือกเครื่องมือ..." }`
   - ขณะเรียก Tool: `{ "status": "using_tool", "tool": "get_weather", "label": "กำลังตรวจสอบสภาพอากาศ..." }`
   - ขณะ Tool เสร็จสิ้น: `{ "status": "tool_done", "tool": "get_weather", "durationMs": 450 }`
   - ขณะเริ่มสังเคราะห์: `{ "status": "synthesizing", "estimatedPromptTokens": 280, "maxContextTokens": 4096 }`
   - ข้อมูลโมเดล: `{ "status": "model_state", "warm": true, "loadMs": 0 }`
   - โทเค็นแรก: `{ "status": "first_token", "ttftMs": 420 }`
3. `event: token`: ชิ้นส่วนคำตอบที่ทยอยส่งออกมา `{ "token": "ขณะนี้" }`
4. `event: done`: ผลลัพธ์สุดท้ายฉบับสมบูรณ์พร้อมข้อมูล `usage` และ `toolsUsed`
5. `event: error`: ส่งข้อความข้อผิดพลาดเมื่อเกิดปัญหาในระบบ

---

## 5. การจัดเก็บสถานะบน Client (LocalStorage Keys)

Frontend บันทึกการตั้งค่าของผู้ใช้ไว้ใน `localStorage` เพื่อให้คงอยู่แม้รีเฟรชหน้าเว็บ:

| Key | ค่าที่เป็นไปได้ | หน้าที่ |
| :--- | :--- | :--- |
| `ai_agent_session_id` | `sess_<timestamp>_<random>` | รหัสประจำตัวของเซสชันการสนทนาปัจจุบัน |
| `ai_agent_tool_mode` | `"auto"` \| `"chat"` \| `"search"` \| `"linux"` | โหมดการทำงานของเครื่องมือที่เลือกไว้ล่าสุด |
| `ai_agent_telemetry_open`| `"1"` \| `"0"` | สถานะเปิดหรือปิดแผงสถิติ Token & บริบท |
| `ai_agent_model_mode` | `"lite"` \| `"advanced"` | โหมดโมเดล AI ที่เลือกไว้ล่าสุด |
