# AI Agent Engineering Constitution & Operating Guidelines

Version: 2.0.0
Status: Active
Scope: Local-AI-Agent Repository
Audience: All AI Agents, Autonomous Systems, and Contributing Engineers

---

## 1. Git Governance & Scope Control

กฎระเบียบการควบคุมเวอร์ชันและความปลอดภัยของ Source Control เพื่อป้องกันความเสียหายของโค้ดและการส่งงานที่อยู่นอกเหนือขอบเขต

### 1.1 Zero Autonomous Mutation
AI Agent จะต้องไม่รันคำสั่ง `git commit` หรือ `git push` โดยอัตโนมัติหรือโดยพลการโดยเด็ดขาด ไม่ว่าในกรณีใดๆ ทั้งสิ้น

### 1.2 Explicit Scope Approval Protocol
เมื่อทำงานเสร็จสิ้นในแต่ละรอบ Agent จะต้องปฏิบัติตามลำดับขั้นตอนดังนี้:
1. ดำเนินการเขียนโค้ดและรันชุดทดสอบทั้งหมด (`node --test`) จนผ่าน 100%
2. จัดทำรายงานสรุปรายการไฟล์ที่มีการเพิ่มหรือแก้ไข พร้อมอธิบายวัตถุประสงค์ของการเปลี่ยนแปลง (Scope Breakdown)
3. ร่างข้อความ Commit Message ตามมาตรฐาน Conventional Commits นำเสนอต่อผู้ใช้
4. รอรับการอนุมัติ (Explicit Approval) จากผู้ใช้ก่อน จึงจะสามารถเรียกคำสั่ง Git ตามที่ได้รับมอบหมายได้

### 1.3 Commit Scoping & Atomic Operations
- การ commit ต้องเป็นแบบ Atomic: รวมเฉพาะไฟล์ที่อยู่ในบริบทของงานนั้นๆ
- ห้าม stage ไฟล์คอนฟิกส่วนตัว หรือไดเรกทอรีที่ถูกระบุไว้ใน `.gitignore` เช่น `tests/`, `.env` เว้นแต่จะได้รับคำสั่งเจาะจง

---

## 2. Code & Comment Quality Standards

มาตรฐานความสะอาดของโค้ด การบันทึกบริบทเชิงวิศวกรรม และการกำจัด AI Slop ออกจากระบบ

### 2.1 Human-Grade Technical Comments
คอมเมนต์ในโค้ดต้องเขียนในมุมมองของวิศวกรซอฟต์แวร์มืออาชีพ:
- อธิบาย "ทำไม" (Why) และ "บริบทเชิงระบบ" (Architectural Context) ห้ามอธิบายสิ่งที่โค้ดบอกชัดเจนอยู่แล้ว (What)
- ห้ามเขียนคอมเมนต์ไร้สาระแบบ AI Slop เช่น `// increment i by 1`, `// return the result`, `// this function handles logic`
- ระบุข้อจำกัดของฮาร์ดแวร์ หรือเหตุผลเบื้องหลังตัวเลข Magic Numbers ให้ชัดเจน

### 2.2 Zero Emojis Policy
ห้ามใช้อีโมจิหรือสัญลักษณ์ตกแต่งที่ไม่จำเป็นในทุกส่วนของโปรเจกต์ ซึ่งรวมถึง:
- ซอร์สโค้ดและคอมเมนต์
- เอกสารคู่มือและ Markdown ทุกไฟล์
- ข้อความ Git Commit Messages
- ข้อความตอบกลับและการสรุปงานของ Agent ในระบบแชต

### 2.3 Restrained Typography
รักษา Signal-to-Noise Ratio ให้สูงสุด:
- ไม่ใช้การเน้นตัวหนาพร่ำเพรื่อในเอกสารหรือรายงานสรุปผล
- ใช้การเน้นตัวหนาเฉพาะหัวข้อ นิยาม หรือคำสั่งสำคัญเท่านั้น เพื่อให้อ่านง่ายและคงความจริงจังในระดับงานวิศวกรรม

---

## 3. Systemic Thinking & Architectural Invariants

หลักการออกแบบสถาปัตยกรรมเชิงลึกและการคงอยู่ของสัจพจน์ระบบ เพื่อป้องกัน Regression

### 3.1 Deep Module Architecture
ออกแบบโมดูลตามหลักการ Deep Module อย่างเคร่งครัด:
- Small Interface: พื้นผิวภายนอกต้องเรียบง่ายและรับค่าเท่าที่จำเป็น
- Deep Implementation: ความซับซ้อนภายใน (ReAct loop, Adaptive RAG, Tool modes, Note ledger) ต้องถูกซ่อนอยู่ภายในโมดูล
- Seam Isolation: จุดเชื่อมต่อระหว่างภายนอกกับ Agent Engine ต้องผ่านฟังก์ชันเดียวคือ `runAgent(request)` โดยที่ caller ไม่ต้องรับรู้สถานะภายในของโมเดล

### 3.2 Invariant Preservation
ก่อนเริ่มแก้ไขโค้ด Agent ต้องวิเคราะห์ผลกระทบต่อระบบภาพรวม (Systemic Impact):
- ต้องไม่ทำลาย Public API Contract เดิมที่ตกลงไว้ใน `docs/AGENT_API_CONTRACT.md`
- โครงสร้างผลลัพธ์ตอบกลับ `{ text, status, feeling, toolsUsed, notice, sessionId, error, model, modelLabel, mode, usage }` ต้องคงอยู่เสมอ

---

## 4. Evidence-Based Engineering & Edge Constraints

การออกแบบและปรับปรุงระบบโดยอิงหลักฐานเชิงประจักษ์และข้อจำกัดของอุปกรณ์ Edge

### 4.1 Raspberry Pi 5 Target Specifications
ระบบนี้ออกแบบเพื่อทำงานบนฮาร์ดแวร์จริงที่มีข้อจำกัด:
- CPU: Broadcom BCM2712 Quad-Core Cortex-A76 @ 2.4GHz (ไม่มี GPU แยกสำหรับการประมวลผล)
- RAM: 4GB LPDDR4X (ต้องแบ่งปันให้ OS, Node.js, และ Ollama Daemon)
- Working Memory Limit: ห้ามบริโภคหน่วยความจำเกิน 2.8GB เพื่อป้องกัน Kernel OOM Killer

### 4.2 Token & Context Budgeting
เพื่อรักษาความเร็วและป้องกันความหน่วงจากการคำนวณ Attention Matrix บน CPU:
- Context Window (`numCtx`): รองรับสูงสุด 4,096 tokens (ค่าเริ่มต้นสำหรับ Unit Test อยู่ที่ 1,536 tokens)
- Generation Limit (`numPredict`):
  - 600 tokens สำหรับ Lite Mode (1.5B)
  - 768 tokens สำหรับ Advanced Mode (3B)
- Sliding History Window: ส่งประวัติการสนทนาย้อนหลังไม่เกิน 10 ข้อความล่าสุด (1,200 ตัวอักษร) เข้าโมเดล
- Maximum Plain Reply Length: จำกัดความยาวข้อความคำตอบสรุปสูงสุดไม่เกิน 2,400 ตัวอักษร โดยใช้ระบบตัดคำตามวรรคตอนธรรมชาติ ป้องกันข้อความขาดช่วงกลางคัน

### 4.3 Empirical Justification Requirement
ข้อเสนอในการปรับปรุงระบบใดๆ จะต้องมีข้อมูลและเหตุผลเชิงเทคนิคสนับสนุนเสมอ:
- ห้ามอ้างข้อสมมุติฐานลอยๆ
- ทุกการตัดสินใจต้องอ้างอิงได้จาก: เวลาการตอบสนอง (Latency ในหน่วยมิลลิวินาที), ปริมาณการใช้หน่วยความจำ (RAM footprint), หรือจำนวน Token ที่ประหยัดได้

---

## 5. Verification & Test-Driven Discipline

ระเบียบการตรวจสอบคุณภาพและการรับประกันความถูกต้องของระบบ

### 5.1 Zero Unverified Deliverables
งานพัฒนาทุกชิ้นจะไม่ถือว่าเสร็จสมบูรณ์จนกว่าจะผ่านการรันชุดทดสอบ:
- ต้องรันคำสั่ง `node --test` เสมอ
- อัตราการผ่านการทดสอบต้องเป็น 100% (Zero Fails, Zero Skipped ยกเว้นกรณีตรวจจับฮาร์ดแวร์จริง)

### 5.2 Deterministic Testing & Isolation
- Unit Tests ต้องรันได้รวดเร็วและไม่พึ่งพา External Dependency ที่ควบคุมไม่ได้
- สำหรับการทดสอบที่เรียก Network หรือ Ollama Daemon ต้องมี Error Boundary และ Timeout ที่รัดกุม เพื่อป้องกันไม่ให้ชุดทดสอบค้าง
- ต้องครอบคลุม Edge Cases: การส่งค่าว่าง, ค่าผิดประเภท, การเรียก Tool ที่ไม่มีอยู่, และข้อผิดพลาดจากภายนอก

---

## 6. Tool Design & Failure Boundaries

มาตรฐานการออกแบบเครื่องมือเสริม (Tools) สำหรับ AI Agent

### 6.1 Non-Throwing Contract
ฟังก์ชันการทำงานของ Tool ทุกตัวต้องไม่ Throw Unhandled Exceptions ออกมา:
- หากเกิดข้อผิดพลาดจากการเชื่อมต่อหรือพารามิเตอร์ไม่ถูกต้อง ให้ดักจับและส่งคืนผลลัพธ์เป็นข้อความบรรยายข้อผิดพลาด
- เพื่อให้ ReAct Engine สามารถรับรู้สาเหตุและตัดสินใจตอบผู้ใช้ได้อย่างถูกต้องโดยที่โปรเซสหลักไม่หยุดทำงาน

### 6.2 High-Signal Schema & Token Clipping
- Schema Definition: กำหนดชื่อและรายละเอียดของ Tool ให้สั้นกระชับ เพื่อลดการใช้ Token ใน System Prompt
- Token Truncation: ข้อมูลดิบที่ได้จากภายนอกต้องตัดทอนให้เหลือเฉพาะเนื้อหาสำคัญก่อนส่งกลับเข้าโมเดลเสมอ (Wikipedia Passage ไม่เกิน 450 ตัวอักษร, Web Search Context ไม่เกิน 1,500 ตัวอักษร)
