// Deep Module: Safety & Polarity Guard
// Single source of truth for dangerous substances, toxicity warnings, and negation guards.

export const DANGER_TERMS_REGEX = /(?:อันตราย|เป็นพิษ|ห้าม(?:ให้|รับประทาน|กิน)|ไม่ควร(?:ให้|กิน)|ผิดกฎหมาย|ทำให้เสียชีวิต|ตายได้|สารพิษ|เป็นอันตราย|ห้ามรับประทาน)/;

export const WARNING_MENTIONS_REGEX = /(?:อันตราย|พิษ|ห้าม|ไม่ควร|ไม่ได้|ตาย|เสียชีวิต|ผิดกฎหมาย)/;

export const FALSELY_POSITIVE_REGEX = /(?:กินได้|ปลอดภัย|ไม่มีปัญหา|ทานได้)/;

export function containsDangerWarning(text) {
  if (typeof text !== 'string') return false;
  return DANGER_TERMS_REGEX.test(text);
}

export function isFalselyPositiveAnswer(answerText, referenceText) {
  if (!referenceText || !containsDangerWarning(referenceText)) return false;
  if (typeof answerText !== 'string') return true;

  const mentionsWarning = WARNING_MENTIONS_REGEX.test(answerText);
  const saysPositive = FALSELY_POSITIVE_REGEX.test(answerText) && !/(?:ห้าม|ไม่ควร|ไม่ได้)/.test(answerText);

  return !mentionsWarning || saysPositive;
}

/**
 * Provides authoritative domain safety facts for common high-risk questions
 * to answer naturally without noisy web scraping.
 */
export function getSafetyKnowledgeHint(message) {
  if (typeof message !== 'string') return null;
  const raw = message.toLowerCase();

  // Case 1: Consuming domestic pets (cats/dogs) in Thailand
  if (/(?:กินแมว|กินหมา|กินสุนัข|เนื้อแมว|เนื้อหมา|แมวกินได้ไหม|คน.*กินแมว|บริโภคแมว)/i.test(raw)) {
    return 'ข้อเท็จจริงสำคัญ: 1. หากหมายถึงคนกินแมว ในประเทศไทยห้ามบริโภคเนื้อแมวหรือสุนัข และผิด พ.ร.บ. ป้องกันการทารุณกรรมและการจัดสวัสดิภาพสัตว์ พ.ศ. 2557 อีกทั้งมีความเสี่ยงต่อโรคติดต่อและพยาธิ 2. หากหมายถึงอาหารที่แมวกินได้ แมวสามารถกินเนื้อสัตว์ปรุงสุก (เช่น ไก่ ปลา) หรืออาหารเม็ดสำหรับแมวได้ แต่ห้ามกินอาหารปรุงรสจัดหรือมีสารพิษ';
  }

  // Case 2: Pets consuming toxic substances
  if (/(?:ช็อกโกแลต|ช็อคโกแลต)/i.test(raw) && /(?:แมว|หมา|สุนัข|สัตว์)/i.test(raw)) {
    return 'ข้อเท็จจริงสำคัญ: สัตว์เลี้ยง (สุนัขและแมว) ห้ามกินช็อกโกแลตเด็ดขาด เนื่องจากมีสารธีโอโบรมีน (Theobromine) และคาเฟอีน ซึ่งตับของสัตว์ไม่สามารถย่อยสลายได้ ทำให้หัวใจเต้นผิดจังหวะ ชัก และอาจเสียชีวิตได้';
  }

  if (/(?:องุ่น|ลูกเกด)/i.test(raw) && /(?:แมว|หมา|สุนัข|สัตว์)/i.test(raw)) {
    return 'ข้อเท็จจริงสำคัญ: สุนัขและแมวห้ามกินองุ่นและลูกเกดเด็ดขาด เพราะอาจทำให้เกิดภาวะไตวายเฉียบพลัน แม้กินในปริมาณเพียงเล็กน้อย';
  }

  if (/(?:พาราเซตามอล|พารา)/i.test(raw) && /(?:แมว|หมา|สุนัข|สัตว์)/i.test(raw)) {
    return 'ข้อเท็จจริงสำคัญ: ห้ามให้แมวกินยาพาราเซตามอลเด็ดขาด เพราะแมวไม่มีเอนไซม์ย่อยสลายตัวยานี้ ทำให้เม็ดเลือดแดงแตก หายใจไม่ออก และเสียชีวิตได้อย่างรวดเร็ว';
  }

  if (/(?:หัวหอม|กระเทียม)/i.test(raw) && /(?:แมว|หมา|สุนัข|สัตว์)/i.test(raw)) {
    return 'ข้อเท็จจริงสำคัญ: หัวหอมและกระเทียมมีสารทำลายเม็ดเลือดแดงในสุนัขและแมว ทำให้เกิดภาวะโลหิตจาง ห้ามให้สัตว์เลี้ยงรับประทาน';
  }

  return null;
}
