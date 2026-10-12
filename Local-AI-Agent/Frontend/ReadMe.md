# Local AI Agent - Frontend

Frontend สำหรับหน้าแชตของโปรเจกต์ Local AI Agent

## หน้าที่ของ Frontend

- รับข้อความจากผู้ใช้
- ส่งข้อความไปยัง Backend ผ่าน API
- แสดงสถานะกำลังประมวลผล
- รับคำตอบจาก Backend
- แสดงคำตอบของ AI
- แสดงข้อความแจ้งเตือนเมื่อเชื่อมต่อไม่ได้หรือใช้เวลานานเกินไป

> Frontend จะไม่เชื่อมต่อ Ollama โดยตรง โดย Backend จะเป็นตัวกลางระหว่าง Frontend และ Ollama

## เทคโนโลยีที่ใช้

- HTML
- CSS
- Vanilla JavaScript
- Fetch API

## โครงสร้างไฟล์

```text
frontend/
├── index.html
├── style.css
├── app.js
└── README.md
```

## รายละเอียดของแต่ละไฟล์

- `index.html` โครงสร้างหน้าเว็บไซต์
- `style.css` สี รูปแบบ และการจัดวางหน้าเว็บไซต์
- `app.js` การรับข้อความ การจัดการสถานะ และการเรียก Backend API
- `README.md` คู่มือการใช้งานและข้อตกลง API

## วิธีเปิดใช้งาน Frontend

แนะนำให้เปิดผ่าน Live Server ใน Visual Studio Code

1. เปิดโฟลเดอร์โปรเจกต์ด้วย Visual Studio Code
2. เปิดไฟล์ `index.html`
3. คลิกขวาภายในไฟล์
4. เลือก `Open with Live Server`

## การทดสอบโดยไม่มี Backend

เปิดไฟล์ `app.js` และตั้งค่า:

```javascript
const USE_MOCK_API = true;
```

เมื่อเปิด Mock Mode หน้าเว็บจะแสดงคำตอบจำลอง โดยไม่ต้องเปิด Backend หรือ Ollama

## การเชื่อมต่อ Backend จริง

เมื่อ Backend พร้อมใช้งาน ให้เปิดไฟล์ `app.js` และเปลี่ยนเป็น:

```javascript
const USE_MOCK_API = false;
```

Frontend จะเรียก Backend จาก URL:

```javascript
const API_URL = "http://localhost:3000/api/chat";
```

## ข้อตกลง API

### Endpoint

```http
POST http://localhost:3000/api/chat
```

### Request Header

```http
Content-Type: application/json
```

### Request Body

Frontend จะส่งข้อมูลรูปแบบนี้:

```json
{
  "prompt": "ข้อความจากผู้ใช้"
}
```

### Successful Response

Backend ต้องส่งคำตอบกลับมาในรูปแบบนี้:

```json
{
  "response": "คำตอบจาก AI"
}
```

ชื่อข้อมูล `response` ต้องตรงตามที่กำหนด เพราะ Frontend จะอ่านคำตอบจาก `data.response`

### Error Response

หาก Backend เกิดข้อผิดพลาด สามารถส่งข้อมูลรูปแบบนี้:

```json
{
  "error": "รายละเอียดข้อผิดพลาด"
}
```

Backend ควรส่ง HTTP Status Code ที่เหมาะสม เช่น:

- `400` ข้อมูลจากผู้ใช้ไม่ถูกต้อง
- `500` เกิดข้อผิดพลาดภายใน Backend
- `503` ไม่สามารถเชื่อมต่อ Ollama ได้