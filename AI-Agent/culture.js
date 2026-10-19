// All-Ages Cultural, Humor, Slang, and Persona Module (Deep Module)
// Provides curated Thai jokes, modern social slang explanations, and roleplay persona adapters.
// Guarantees zero-hallucination wit and instant latency for everyday conversational entertainment.

import { lookupThaiSlang } from './normalizer.js';

const JOKES_BANK = [
  'ถาม: กบอะไรเอ่ย มี 2 ขา?\nตอบ: กบจำแลง (กบแปลงร่าง) หรือกบโดนตัดขา... ไม่ใช่ครับ ตอบว่า กบเลือกนาย!',
  'ถาม: ปลาอะไรเอ่ย ขี้เกียจที่สุดในโลก?\nตอบ: ปล่าวาน (วานให้คนอื่นทำแทน)!',
  'ถาม: กาอะไรเอ่ย บินไม่ได้?\nตอบ: กาน้ำร้อนครับ!',
  'ถาม: ขนมอะไรเอ่ย กินแล้วรวย?\nตอบ: ขนมทองหยิบ ทองหยอด ฝอยทองครับ เพราะมีทองเต็มไปหมด!',
  'ถาม: วันอะไรเอ่ย ไม่ควรกินยา?\nตอบ: วันจันทร์... เพราะวันจันทร์ไม่ต้องกิน "ยาจันทร์" (ยันต์)!',
  'ถาม: ยายอะไรเอ่ย เดินเร็วที่สุด?\nตอบ: ยายสปีด (Hi-speed)!',
  'ถาม: ส้มอะไรเอ่ย กลัวความมืด?\nตอบ: ส้มโอ... เพราะส้มโอ กลัว "โอมืด"!',
  'ถาม: ช้างอะไรเอ่ย ตัวเล็กที่สุดในโลก?\nตอบ: ช้างน้ำ... อ๊ะ ไม่ใช่ ตอบ ช้างน้อยครับ!',
  'ถาม: อะไรเอ่ย อยู่บนฟ้า มีสีขาว มีปีก แต่ไม่ใช่เครื่องบิน?\nตอบ: นกใส่เสื้อขาวครับ!',
  'ถาม: เดือนอะไรเอ่ย มี 31 วัน?\nตอบ: เดือนมกราคม มีนาคม พฤษภาคม กรกฎาคม สิงหาคม ตุลาคม และธันวาคมครับ (ตอบถูกทุกเดือนเลย!)'
];

const sessionJokes = new Map();

export function getThaiJoke(sessionId = 'default') {
  let usedIndices = sessionJokes.get(sessionId);
  if (!usedIndices) {
    usedIndices = new Set();
    sessionJokes.set(sessionId, usedIndices);
  }

  // If all jokes exhausted in this session, reset rotation
  if (usedIndices.size >= JOKES_BANK.length) {
    usedIndices.clear();
  }

  // Find an unused joke index
  const availableIndices = [];
  for (let i = 0; i < JOKES_BANK.length; i++) {
    if (!usedIndices.has(i)) {
      availableIndices.push(i);
    }
  }

  const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  usedIndices.add(chosenIndex);

  return JOKES_BANK[chosenIndex];
}

const SLANG_USAGE_EXAMPLES = {
  'ติดแกลม': 'ตัวอย่าง: "วันนี้แต่งตัวเต็มยศไปกินก๋วยเตี๋ยวเรือ ฟีลติดแกลมเวอร์"',
  'ตัวมารดา': 'ตัวอย่าง: "งานนี้พส.เดินแบบได้เฟียร์ซมาก ยกให้เป็นตัวมารดาแห่งวงการ"',
  'ช็อตฟีล': 'ตัวอย่าง: "กำลังเม้าท์มอยเรื่องสนุกๆ อยู่ดีๆ เพื่อนถามเรื่องการบ้าน ทำเอาช็อตฟีลเลย"',
  'จึ้ง': 'ตัวอย่าง: "ชุดนี้ใส่แล้วจึ้งมาก ทุกคนในงานต้องเหลียวหลังมอง"',
  'ดือ': 'ตัวอย่าง: "ชาเขียวร้านนี้คือดือมาก หวานน้อยกลมกล่อม"',
  'เกินปุยมุ้ย': 'ตัวอย่าง: "น้องแมวนอนหลับน่ารักเกินปุยมุ้ย ใจฟูไปหมดแล้ว"',
  'อ่อม': 'ตัวอย่าง: "ปาร์ตี้คืนนี้คนเปิดเพลงชวนหลับ บรรยากาศเริ่มอ่อมแล้วแก"',
  'ชีเสิร์ฟ': 'ตัวอย่าง: "ขึ้นเวทีคราวนี้ชีเสิร์ฟลุคเจ้าหญิง ร้องเพลงสะกดคนดูทั้งฮอลล์"',
  'โฮ่ง': 'ตัวอย่าง: "แต่งหน้าลุคนี้คือโฮ่งมากคุณน้า สวยตะโกนสุดๆ"'
};

export function explainSlangOrMeme(term) {
  if (typeof term !== 'string') return null;
  const slang = lookupThaiSlang(term);
  if (!slang) return null;

  const example = SLANG_USAGE_EXAMPLES[slang.term] || `ตัวอย่าง: "ประโยคนี้ใช้คำว่า ${slang.term} เพื่อเน้นความรู้สึกตามกระแสโซเชียล"`;

  return [
    `คำว่า "${slang.term}" หมายถึง: ${slang.meaning}`,
    example
  ].join('\n');
}

const ROLEPLAY_PATTERNS = [
  /(?:สมมติว่าคุณเป็น|สมมุติว่าคุณเป็น|สวมบทบาทเป็น|ลองเป็น|แปลงร่างเป็น)\s*(.+)/i,
  /(?:พูดคุยแบบ|คุยแบบ|พูดจาแบบ|ตอบแบบ)\s*(.+)/i
];

export function buildRoleplayPrompt(message) {
  if (typeof message !== 'string') return null;
  const text = message.trim();

  for (const pattern of ROLEPLAY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const persona = match[1].replace(/(?:หน่อย|นะ|ด้วย|ครับ|ค่ะ|\?)+$/g, '').trim();
      return `สวมบทบาทเป็น: "${persona}" โดยตอบคำถามหรือคุยด้วยน้ำเสียง บุคลิก และสไตล์การพูดของ "${persona}" อย่างเป็นธรรมชาติและสนุกสนาน`;
    }
  }

  return null;
}
