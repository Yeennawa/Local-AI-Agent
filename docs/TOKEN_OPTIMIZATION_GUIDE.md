# Token & Context Optimization Guide (Edge AI Playbook)

**Target Platform:** Raspberry Pi 5 (4GB RAM) & Small Local LLMs (1.5B - 3B)  
**Project:** Local-AI-Agent  
**Core Tenet:** *Maximum factual accuracy and response speed with minimal token waste and zero MicroSD flash wear.*

---

## 1. Executive Summary: The Two Context Budgets

ในการพัฒนาระบบ AI บนอุปกรณ์เอดจ์อย่าง Raspberry Pi 5 การจัดการ Token และ Context Window มีความสำคัญอย่างยิ่งยวดเนื่องจากข้อจำกัดด้านฮาร์ดแวร์ โดยแบ่งออกเป็น 2 งบประมาณหลัก:

1. **Runtime LLM Context Budget (โมเดลในเครื่อง):**
   - บน CPU Quad-Core ARM Cortex-A76 การคำนวณ Attention Matrix ในแต่ละโทเค็นมีความหน่วงเชิงเส้นตามขนาดของบริบท (KV Cache)
   - หากบริบทบวมเกิน 1,500 - 2,000 โทเค็นโดยไม่จำเป็น ความเร็วในการสร้างคำตอบ (Time-to-First-Token) จะช้าลงอย่างเห็นได้ชัด และเพิ่มความเสี่ยงต่อการเกิดหน่วยความจำตึงตัว (Memory Pressure)
   - เป้าหมาย: ลดขนาด Prompt ของ LLM ให้เหลือเฉพาะข้อมูลที่จำเป็นและถูกต้องที่สุด

2. **Developer & Agent Working Context Budget (กระบวนการพัฒนา):**
   - การสั่งงานหรือทดสอบระบบผ่าน AI Pair-Programming หากดึงข้อมูลทั้งไฟล์ขนาดใหญ่ หรือรันผลทดสอบยาวเหยียด จะทำให้ Context Window ของเครื่องมือเต็มเร็วและเพิ่ม Latency โดยไม่จำเป็น
   - เป้าหมาย: ใช้เครื่องมือที่ให้ผลลัพธ์แบบเจาะจง (Targeted Inspection & Test Slicing)

---

## 2. กลยุทธ์ประหยัด Token ในระดับสถาปัตยกรรม (Runtime Optimization Levers)

ระบบ `Local-AI-Agent` ใช้ 8 กลยุทธ์ทางสถาปัตยกรรมเพื่อประหยัด Token ได้มากกว่า 75% เมื่อเทียบกับสถาปัตยกรรม ReAct ทั่วไป:

### 1. 100% Deterministic Router Fast-Path (`router.js`)
- **การประหยัด:** 100% ของ Token ในรอบวางแผน (ลดได้ 80 - 150 tokens ต่อคำขอ)
- **กลไก:** แทนที่จะส่ง Prompt ไปถามโมเดลว่า "คำถามนี้ต้องใช้ Tool อะไร" ระบบใช้ Intent Router ที่ทำงานแบบ Pure Functional Rules คัดกรอง 23 หมวดหมู่ในเวลา 0 ms ส่งคำสั่งไปยัง Tool ที่ถูกต้องได้ทันทีโดยไม่ต้องเรียก LLM เลยแม้แต่รอบเดียว

### 2. Structured Answer Composer (`answer.js`)
- **การประหยัด:** 100% ของ Token ในรอบสร้างคำตอบสำหรับ Structured Tools
- **กลไก:** สำหรับเครื่องมือที่มีโครงสร้างข้อมูลชัดเจน (`get_weather`, `get_fx`, `calculate`, `get_current_time`, `get_system_info`, `get_news`, `search_github`) ระบบใช้แม่แบบ (Deterministic Template) ตอบกลับได้ทันทีโดยไม่ต้องส่งผลลัพธ์กลับเข้า LLM เพื่อสรุปซ้ำ

### 3. CoALA Note Memory Ledger (`memory.js`)
- **การประหยัด:** 0 Token และ 0 ms สำหรับคำถามซ้ำหรือคำถามที่มีข้อเท็จจริงแน่นอน
- **กลไก:** เมื่อระบบตรวจสอบคำตอบจากภายนอกเรียบร้อยแล้ว จะบันทึกคู่คำถาม-คำตอบลงใน RAM (LRU Eviction) เมื่อผู้ใช้ถามซ้ำหรือถามคล้ายเดิม ระบบจะ Recall คำตอบที่ถูกต้องกลับไปใน 0 ms ป้องกันอาการหลอนและประหยัดการประมวลผลได้ 100%

### 4. Tool Mode Policy (`toolMode.js`)
- **การประหยัด:** 60 - 85% ของ Prompt Context ใน Chat Mode
- **กลไก:** ในโหมด `คุยล้วน` (Chat Mode) ระบบจะตัดการดึงข้อมูลจากเว็บและ Wikipedia ออกทั้งหมด บังคับให้โมเดลตอบด้วย Parametric Knowledge ทันที เหมาะสำหรับการสนทนาทั่วไปที่รวดเร็วและใช้โทเค็นน้อยที่สุด

### 5. Extractive Passage Slicing (`wiki.js`)
- **การประหยัด:** ตัดทอนเนื้อหาจากบทความวิกิพีเดียหลายหมื่นคำ ให้เหลือบริบทสำคัญไม่เกิน 450 ตัวอักษร
- **กลไก:** ใช้ระบบตัดแบ่งประโยคและค้นหา Passage ที่เกี่ยวข้องกับคำถามเชิงลึก (เช่น "ไอน์สไตน์ได้รางวัลโนเบลจากเรื่องอะไร") โดยไม่ส่งเนื้อหาทั้งหน้าเข้าสู่ LLM

### 6. Sliding Context Window & Dialogue Sanitizer (`parse.js` & `memory.js`)
- **การประหยัด:** ควบคุมขนาดประวัติแชตไม่ให้บวมสะสม
- **กลไก:** จำกัดประวัติการสนทนาย้อนหลังไม่เกิน 10 ข้อความ (สูงสุด 1,200 ตัวอักษร) พร้อมฟังก์ชันสรุปบทสนทนาเก่าเป็นประเด็นสั้นๆ ตัดบทสนทนาที่ไม่จำเป็นออกก่อนส่งเข้าโมเดล

### 7. Dual-Tier Model Management (`modelManager.js`)
- **การประหยัด:** จัดสรรทรัพยากรตามระดับความซับซ้อนของงาน
- **กลไก:** ใช้ `Lite Mode` (`qwen2.5:1.5b`, RAM ~1.15 GB) สำหรับคำถามทั่วไป และสลับสู่ `Advanced Mode` (`qwen2.5:3b`, RAM ~2.35 GB) เฉพาะเมื่อต้องการการคิดวิเคราะห์หลายขั้นตอน

### 8. Real-Time Telemetry Engine (`telemetry.js`)
- **การประหยัด:** ไม่สร้าง I/O Overhead และไม่เขียนไฟล์ลงดิสก์ (0 MicroSD Card Writes)
- **กลไก:** ประเมินโทเค็นภาษาไทย (~0.65 token/char) และอังกฤษ (~1 token/3.8 chars) แบบ In-Memory แสดงผลผ่านหน้าต่าง Telemetry Drawer โดยไม่ส่งผลกระทบต่อความเร็วการอนุมาน

---

## 3. กฎทอง 8 ข้อสำหรับนักพัฒนาและ AI Pair-Programming

เมื่อทำการแก้ไข พัฒนาฟีเจอร์ หรือดีบักโค้ดในโปรเจกต์นี้ ให้ปฏิบัติตามกฎเพื่อประหยัด Token และรักษาความสะอาดของระบบ:

### 1. The Line-Slicing Rule
อย่าเปิดดูทั้งไฟล์ขนาดยาว ให้ค้นหาชื่อฟังก์ชันหรือเลขบรรทัดก่อน แล้วใช้ `StartLine:EndLine` เปิดดูเฉพาะส่วนที่ต้องการแก้ไข (ครั้งละไม่เกิน 60 - 80 บรรทัด)

### 2. Targeted Test Execution
ในระหว่างการเขียนโค้ด ให้รันเฉพาะไฟล์ทดสอบที่เกี่ยวข้องโดยตรง:
```bash
# ถูกต้อง: รวดเร็ว ผลลัพธ์สั้น กระชับ
node --test tests/answer.test.js

# หลีกเลี่ยงระหว่างแก้โค้ดจุดเดียว: รันทั้ง 290 ข้อทำให้เทอร์มินัลพ่นข้อความยาว
node --test
```
*(รัน `npm test` ทั้งชุดเฉพาะขั้นตอนการยืนยันครั้งสุดท้ายก่อน Commit เท่านั้น)*

### 3. Compiler & Runtime Validation First
ไม่พิมพ์ข้อความถาม AI ให้ช่วยคาดเดาความถูกต้องเชิงสัญลักษณ์ ให้ใช้การรันชุดทดสอบหรือ Node.js Syntax Check ตรวจสอบทันที

### 4. Single Source of Truth for Constants
กำหนดค่าคงที่ เช่น ขนาด Context Window (`DEFAULT_MAX_CONTEXT_TOKENS = 4096`) ไว้ที่โมดูลที่รับผิดชอบโดยตรง (`telemetry.js`) แล้วเรียกใช้วิธี `export/import` ห้ามพิมพ์ตัวเลขซ้ำซ้อนในหลายๆ ไฟล์

### 5. Zero Emojis Policy
ห้ามใช้อีโมจิในโค้ด คอมเมนต์ คอมมิต หรือเอกสารทุกไฟล์ เพื่อรักษา Signal-to-Noise Ratio ให้สูงสุด

### 6. Offload Exploration to Subagents
หากต้องทำการสืบค้นไฟล์จำนวนมากหรืออ่านประวัติการเปลี่ยนแปลง ให้มอบหมายงานให้ Subagent ดำเนินการแยกบริบท แล้วส่งเฉพาะข้อสรุปกลับมา

### 7. Anti-Slop Documentation
ไม่เขียนคำอธิบายแนวคิดโปรแกรมมิ่งพื้นฐาน (เช่น อธิบายว่า `fetch` หรือ `Promise` คืออะไร) บันทึกเฉพาะข้อกำหนดเชิงวิศวกรรมเฉพาะตัวของระบบ เช่น การจัดการฮาร์ดแวร์ Raspberry Pi 5 และสถาปัตยกรรม Deep Module

### 8. Git-Diff Verification
ก่อนการ Commit ให้ตรวจสอบเฉพาะ Diff ของไฟล์ที่ถูกแก้ไข:
```bash
git status --short
git diff --stat
```
ตรวจสอบให้แน่ใจว่าไม่มีการแก้ไขไฟล์นอกขอบเขตงาน
