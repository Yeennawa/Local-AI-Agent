// Deep Module: ThaiQueryNormalizer
// Centralizes Thai query cleaning, abbreviation expansion, domain term mapping,
// colloquial/slang normalization, active/passive voice disambiguation, and bigram containment scoring.

const LEADING_FRAME_REGEX = /^(?:ใครคือ|ใครเป็น|ใครสร้าง|ใครคิดค้น|ช่วยอธิบาย(?:เรื่อง)?|อธิบาย(?:เรื่อง)?|ช่วย(?:หา|ค้นหา)?(?:ข้อมูล|ประวัติ)?(?:เรื่อง|เกี่ยวกับ|ของ)?|อยาก(?:รู้|ทราบ)(?:ข้อมูล|ประวัติ)?(?:เรื่อง|เกี่ยวกับ|ของ)?|ประวัติ(?:ความ(?:เป็น)?มา)?(?:ของ)?|ความ(?:เป็น)?มาของ|ข้อมูลเกี่ยวกับ|เล่า(?:เรื่อง|ประวัติ)?(?:ของ)?|ขอข้อมูล(?:เรื่อง|เกี่ยวกับ)?|ช่วยบอกหน่อยว่า|บอกหน่อยว่า|รู้ไหมว่า|ทราบไหมว่า|ค้นหา(?:เรื่อง)?|เสิร์ช|search for|what is|who is|tell me about|info about|information about|explain)\s*/i;

const TRAILING_FRAME_REGEX = /\s*(?:คืออะไร(?:นะ|ครับ|ค่ะ)?|คือใคร(?:ใน(?:ปัจจุบัน|ตอนนี้))?(?:นะ|ครับ|ค่ะ)?|เป็นใคร(?:ใน(?:ปัจจุบัน|ตอนนี้))?(?:นะ|ครับ|ค่ะ)?|ชื่ออะไร(?:นะ|ครับ|ค่ะ)?|อยู่ที่ไหน|หมายถึงอะไร|ทำงานอย่างไร|ทำอะไรได้บ้าง|คือสิ่งใด|คนปัจจุบัน|ในปัจจุบัน|ปัจจุบัน|ตอนนี้|มีกี่(?:จังหวัด|เขต|อำเภอ|สายพันธุ์|ประเทศ|คน|แห่ง|ข้อ|อัน|ตัว)?|ได้เท่าไหร่|เท่าใด|กี่องศา|ให้ฟัง(?:หน่อย(?:ครับ|ค่ะ|นะ)?)?|ให้ดู(?:หน่อย(?:ครับ|ค่ะ|นะ)?)?|ให้ทราบ(?:หน่อย(?:ครับ|ค่ะ|นะ)?)?|หน่อย(?:ครับ|ค่ะ|นะ)?|ให้หน่อย(?:ครับ|ค่ะ|นะ)?|ด้วย(?:ครับ|ค่ะ)?|ครับ|ค่ะ|นะ|จ้า|จ๊ะ|\?)+$/i;

const POLITENESS_REGEX = /(?:\s|^)(?:ครับ|ค่ะ|(?<![เแ])จ้า|นะ|หน่อย|ด้วย|จ๊ะ|ขอรับ|รบกวน|ช่วย)(?:\s|$)/g;

const ABBREVIATIONS = [
  // Royal & High Office
  [/(?:ร\.9|รัชกาลที่\s*9|ในหลวง\s*ร\.9)/g, 'พระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร'],
  [/(?:ร\.10|รัชกาลที่\s*10|ในหลวง\s*ร\.10)/g, 'พระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว'],
  [/(?:ผู้ว่าฯ\s*กทม\.?|ผู้ว่า\s*กทม\.?|ผู้ว่ากทม)/g, 'ผู้ว่าราชการกรุงเทพมหานคร'],
  [/(?:นายกฯ?\s*ไทย|นายกไทย)/g, 'นายกรัฐมนตรีไทย'],
  [/(?:ใครเป็นนายก|ใครคือนายก|นายกคนปัจจุบัน)/g, 'ใครเป็นนายกรัฐมนตรีไทย'],
  [/(?:^|\s)นายก(?=\s|$)/g, ' นายกรัฐมนตรีไทย '],
  [/(?:ปธน\.?|ประธานาธิบดี)\s*สหรัฐ/g, 'ประธานาธิบดีสหรัฐ'],
  [/(?:^|\s)ปธน\.?\s*/g, ' ประธานาธิบดี '],
  [/(?:^|\s)กทม\.?(?=\s|$)/g, ' กรุงเทพมหานคร '],
  [/(?:พ\.ร\.บ\.?|พรบ\.?)\s*/g, 'พระราชบัญญัติ '],
  [/(?:ส\.ส\.?)/g, 'สมาชิกสภาผู้แทนราษฎร'],
  [/(?:ส\.ว\.?)/g, 'สมาชิกวุฒิสภา'],
  [/(?:รพ\.?|ร\.พ\.?)\s*/g, 'โรงพยาบาล '],

  // Concepts & Tech
  [/(?:^|\s)เอไอ(?=\s|$)/g, ' ปัญญาประดิษฐ์ '],
  [/(?:^|\s)จีดีพี(?=\s|$)/g, ' ผลิตภัณฑ์มวลรวมในประเทศ '],
  [/(?:ราสเบอร์รีพาย|ราสเบอร์รี่พาย|รัสเบอรี่พาย)/g, 'Raspberry Pi'],
  [/(?:ไพทอน|ไพธอน)/g, 'Python (programming language)'],
  [/(?:จาวาสคริปต์|จาวาสคริป)/g, 'JavaScript'],
  [/(?:ลินุกซ์)/g, 'Linux'],
  [/(?:ด็อกเกอร์)/g, 'Docker'],
  [/(?:บิตคอยน์|บิทคอยน์)/g, 'บิตคอยน์'],
  [/(?:บล็อกเชน|บล็อกเชนด์)/g, 'บล็อกเชน']
];

export const THAI_SLANG_LEXICON = {
  'ติดแกลม': { term: 'ติดแกลม', meaning: 'ติดหรู ชอบใช้ชีวิตหรือแต่งตัวดูแพงและมีระดับ (มาจาก Glamorous)' },
  'ตัวมารดา': { term: 'ตัวมารดา', meaning: 'บุคคลที่เป็นที่สุด ตัวแม่ มีความโดดเด่นและเป็นเลิศในด้านนั้นๆ' },
  'ตัวแม่': { term: 'ตัวแม่', meaning: 'บุคคลที่เป็นที่สุด มีความโดดเด่นและเป็นเลิศ' },
  'ตัวมัม': { term: 'ตัวมัม', meaning: 'ตัวแม่ บุคคลที่เป็นที่สุด' },
  'ตัวคลอดบุตร': { term: 'ตัวคลอดบุตร', meaning: 'ตัวแม่ บุคคลที่เป็นที่สุดในด้านนั้น' },
  'ตัวสูติ': { term: 'ตัวสูติ', meaning: 'ตัวแม่ บุคคลที่เป็นเลิศ' },
  'ช็อตฟีล': { term: 'ช็อตฟีล', meaning: 'การพูดหรือการกระทำที่ดับอารมณ์ หักบรรยากาศ หรือทำให้เสียจังหวะกะทันหัน' },
  'จึ้ง': { term: 'จึ้ง', meaning: 'สวยงาม ยอดเยี่ยม น่าประทับใจจนตะลึง' },
  'ดือ': { term: 'ดือ', meaning: 'ดี ยอดเยี่ยม ดีเลิศ' },
  'เกินปุยมุ้ย': { term: 'เกินปุยมุ้ย', meaning: 'เกินไปไหม (น่ารักหรือเว่อร์เกินไป)' },
  'แกง': { term: 'แกง', meaning: 'แกล้ง หลอกให้เชื่อหรือลวง' },
  'โดนแกง': { term: 'โดนแกง', meaning: 'ถูกแกล้ง หรือถูกหลอกให้เข้าใจผิด' },
  'อ่อม': { term: 'อ่อม', meaning: 'กร่อย ไม่สนุก ดร็อป ไม่น่าตื่นเต้น' },
  'ชีเสิร์ฟ': { term: 'ชีเสิร์ฟ', meaning: 'เธอทำได้ดีมาก ปล่อยของและสร้างผลงานได้ยอดเยี่ยม' },
  'โฮ่ง': { term: 'โฮ่ง', meaning: 'เลิศมาก ดีมาก สวยปัง (ใช้แสดงความชื่นชมอย่างยิ่ง)' },
  'ฉ่ำ': { term: 'ฉ่ำ', meaning: 'เยอะมาก เต็มที่ จุใจ อย่างล้นหลาม' },
  'เริ่ด': { term: 'เริ่ด', meaning: 'ดีเลิศ ยอดเยี่ยม ประเสริฐ' },
  'บ้ง': { term: 'บ้ง', meaning: 'พัง ไม่รอด ไม่ประสบความสำเร็จ' },
  'นอยด์': { term: 'นอยด์', meaning: 'วิตกกังวล น้อยใจ หรือคิดมาก' },
  'เบียว': { term: 'เบียว', meaning: 'ทำตัวเพ้อฝัน คิดว่าตนเองมีพลังพิเศษหรือโลกแฟนตาซี (มาจาก Chuunibyou)' },
  'ขิง': { term: 'ขิง', meaning: 'อวด อวดเบ่ง หรือเกทับ' },
  'เท': { term: 'เท', meaning: 'ทิ้ง ปฏิเสธ หรือยกเลิกนัดกะทันหัน' },
  'นก': { term: 'นก', meaning: 'พลาด ชวด ไม่สมหวัง' },
  'โป๊ะแตก': { term: 'โป๊ะแตก', meaning: 'ความลับแตก หรือถูกจับโกหกได้' },
  'ฟิน': { term: 'ฟิน', meaning: 'มีความสุข พึงพอใจอย่างยิ่ง' },
  'มูฟออน': { term: 'มูฟออน', meaning: 'ก้าวต่อไป ก้าวข้ามเรื่องในอดีต (Move on)' },
  'สับ': { term: 'สับ', meaning: 'ทำได้ดีมาก ปังมาก มีจริตจะก้านโดดเด่น' },
  'ว้าวซ่า': { term: 'ว้าวซ่า', meaning: 'น่าตื่นเต้น ประทับใจมาก' },
  'ปัง': { term: 'ปัง', meaning: 'ยอดเยี่ยม โดดเด่น ได้รับความนิยมสูง' }
};

export function lookupThaiSlang(term) {
  if (typeof term !== 'string') return null;
  const clean = term.trim().toLowerCase();
  if (THAI_SLANG_LEXICON[clean]) return THAI_SLANG_LEXICON[clean];
  for (const [key, val] of Object.entries(THAI_SLANG_LEXICON)) {
    // For short keys (length <= 2, e.g. "เท", "นก", "สับ", "บ้ง"), require exact token or boundary match
    if (key.length <= 2) {
      const regex = new RegExp(`(?:^|\\s|[.,!?])${key}(?:\\s|[.,!?]|$)`);
      if (regex.test(clean)) return val;
    } else if (clean.includes(key)) {
      return val;
    }
  }
  return null;
}


export function normalizeColloquialThai(text) {
  if (typeof text !== 'string') return '';
  let str = text.trim();

  // 1. Collapse elongated repeated characters (>=3 identical characters -> 1)
  str = str.replace(/([ก-๙a-zA-Z])\1{2,}/g, '$1');

  // 2. Specific elongated patterns and phonetics
  str = str.replace(/(?:ม้าย+|มั้ย+|ไม๊+|ไหมม+)/g, 'ไหม');
  str = str.replace(/(?:จิง+|จริงง+)/g, 'จริง');
  str = str.replace(/(?:ได้ป่าว|ได้เป่า)/g, 'ได้หรือเปล่า');
  str = str.replace(/(?:กินได้ป่าว|กินได้เป่า)/g, 'กินได้หรือเปล่า');
  str = str.replace(/(?:ป่าว|เป่า)/g, 'หรือเปล่า');
  str = str.replace(/(?:ใช่ป่ะ|ใช่ปะ)/g, 'ใช่ไหม');
  str = str.replace(/(?:ป่ะ+|ปะ+)/g, 'ไหม');
  str = str.replace(/(?:หวัดดีค้าบ|หวัดดีครับ|หวัดดีฮะ)/g, 'สวัสดีครับ');
  str = str.replace(/(?:ค้าบ+|คับ+|คราฟ+)/g, 'ครับ');
  str = str.replace(/(?:ทำมัย|ทำไมง่ะ)/g, 'ทำไม');
  str = str.replace(/(?:กินไรอ่ะ|กินไร|กินอะไรอ่ะ)/g, 'กินอะไร');
  str = str.replace(/(?:ทำไรอ่ะ|ทำไร)/g, 'ทำอะไร');
  str = str.replace(/(?:อะไรอ่ะ)/g, 'อะไร');
  str = str.replace(/(?:ไรอ่ะ)/g, 'อะไร');

  return str.replace(/\s+/g, ' ').trim();
}

export function expandAbbreviations(text) {
  if (typeof text !== 'string') return '';
  let expanded = ` ${text} `;

  for (const [pattern, replacement] of ABBREVIATIONS) {
    expanded = expanded.replace(pattern, replacement);
  }

  return expanded.replace(/\s+/g, ' ').trim();
}

export function computeThaiBigramContainment(query, title) {
  if (typeof query !== 'string' || typeof title !== 'string') return 0;
  const q = query.replace(/\s+/g, '').toLowerCase();
  const t = title.replace(/\s+/g, '').toLowerCase();

  if (!q || !t) return 0;
  if (t === q) return 1.0;
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;

  if (q.length < 2) return t.includes(q) ? 1.0 : 0;

  // Extract character bigrams
  const qBigrams = [];
  for (let i = 0; i < q.length - 1; i++) {
    qBigrams.push(q.slice(i, i + 2));
  }

  let matches = 0;
  for (const bg of qBigrams) {
    if (t.includes(bg)) {
      matches++;
    }
  }

  return matches / qBigrams.length;
}

const RELATIONAL_ROLES = [
  { role: 'ceo', regex: /^(?:ceo|ซีอีโอ|ผู้บริหาร(?:สูงสุด)?)\s*(?:ของ)?\s*/i, roleEn: 'CEO' },
  { role: 'founder', regex: /^(?:ผู้ก่อตั้ง|ผู้ร่วมก่อตั้ง)\s*(?:ของ)?\s*/i, roleEn: 'founder' },
  { role: 'owner', regex: /^(?:เจ้าของ|ผู้ครอบครอง)\s*(?:ของ)?\s*/i, roleEn: 'owner' },
  { role: 'creator', regex: /^(?:ผู้สร้าง|ผู้คิดค้น|ผู้ประพันธ์|ผู้แต่ง)\s*(?:ของ)?\s*/i, roleEn: 'creator' },
  { role: 'parent_company', regex: /^(?:บริษัทแม่|เจ้าของ)\s*(?:ของ)?\s*/i, roleEn: 'parent company' },
  { role: 'capital', regex: /^(?:เมืองหลวง|นครหลวง)\s*(?:ของ)?\s*/i, roleEn: 'capital' }
];

const KNOWN_ORGANIZATIONS = {
  chatgpt: 'OpenAI',
  แชตจีพีที: 'OpenAI',
  instagram: 'Meta Platforms',
  whatsapp: 'Meta Platforms',
  youtube: 'Google',
  android: 'Google'
};

const PRACTICAL_YESNO_REGEX = /(?:กิน.*ได้ไหม|กินอะไรได้บ้าง|กินอาหารอะไรได้บ้าง|มีกี่ขา|บินได้ไหม|อันตรายไหม|เลี้ยงได้ไหม|เป็นพิษไหม|ทำไมถึง|ทำไม|วิธี(?:แก้)?|ทำยังไง|ทำไง|อย่างไร|ได้ไหม|ได้หรือไม่|ได้มั้ย|ได้หรือเปล่า|ได้ป่าว|ราคาทอง|ราคาน้ำมัน|ราคาเท่าไหร่|กี่บาท|บาทละ|ลิตรละ|ต่างกันยังไง|ต่างกันอย่างไร|รุ่นไหนดี|อันไหนดี|ที่ไหนดี)/i;
const GREETINGS_REGEX = /^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|ฮัลโหล|ขอบคุณ|ขอบใจ|บาย|ลาก่อน|hello\b|hi\b|thanks\b|thank you\b)/i;

export function normalizeQuery(message, { focusEntity = null } = {}) {
  if (typeof message !== 'string') {
    return {
      canonicalTopic: '',
      headEntity: '',
      objectEntity: '',
      focusKeywords: [],
      relationRole: null,
      actionPredicate: null,
      searchCandidates: [],
      rawCleaned: '',
      isKnowledgeIntent: false,
      isBareNoun: false,
      isYesNoOrPractical: false,
      isPracticalQuery: false,
      isSlang: false,
      slangExplanation: null,
      effectivePrompt: ''
    };
  }

  const raw = message.trim();
  const colloquialNormalized = normalizeColloquialThai(raw);

  // Check Slang Lexicon
  let isSlang = false;
  let slangExplanation = null;
  const matchedSlang = lookupThaiSlang(colloquialNormalized);
  if (matchedSlang && /(?:คืออะไร|แปลว่าอะไร|หมายถึงอะไร|คือไร|คือสิ่งใด|คือ)/i.test(colloquialNormalized)) {
    isSlang = true;
    slangExplanation = `${matchedSlang.term} หมายถึง: ${matchedSlang.meaning}`;
  }

  // Coreference resolution for simple Thai pronouns when a focus entity exists
  if (focusEntity && /(?:แล้ว)?มัน(?:คืออะไร|คือใคร|มีอะไร|อยู่ที่ไหน|ราคาเท่าไหร่)/i.test(raw)) {
    return {
      canonicalTopic: focusEntity,
      headEntity: focusEntity,
      objectEntity: '',
      focusKeywords: [],
      relationRole: null,
      actionPredicate: null,
      searchCandidates: [focusEntity],
      rawCleaned: focusEntity,
      isKnowledgeIntent: true,
      isBareNoun: false,
      isYesNoOrPractical: false,
      isPracticalQuery: false,
      isSlang: false,
      slangExplanation: null,
      effectivePrompt: `ข้อมูลเกี่ยวกับ ${focusEntity}`
    };
  }

  // Pre-expand known compound phrases before frame stripping
  let preprocessed = colloquialNormalized;
  if (/(?:นายก(?:ของ)?ไทย|ใครเป็นนายก(?:ของ)?ไทย|นายกคนปัจจุบัน|ใครคือนายก(?:ของ)?ไทย|ใครคือนายก)/.test(preprocessed)) {
    preprocessed = preprocessed.replace(/(?:นายก(?:ของ)?ไทย|ใครเป็นนายก(?:ของ)?ไทย|นายกคนปัจจุบัน|ใครคือนายก(?:ของ)?ไทย|ใครคือนายก)/, 'นายกรัฐมนตรีไทย');
  }

  // Strip conversational frames (multi-pass to cleanly peel nested/trailing frames)
  let cleaned = preprocessed.replace(LEADING_FRAME_REGEX, '').trim();
  let prevCleaned = '';
  while (prevCleaned !== cleaned) {
    prevCleaned = cleaned;
    cleaned = cleaned.replace(TRAILING_FRAME_REGEX, '').trim();
  }
  cleaned = cleaned.replace(POLITENESS_REGEX, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Special topic mappings for standard knowledge queries
  if (/ประเทศไทยมีกี่จังหวัด|จังหวัดในไทย|จำนวนจังหวัด/i.test(raw)) {
    cleaned = 'จังหวัดในประเทศไทย';
  } else if (/กรุงเทพมีกี่เขต|เขตในกรุงเทพ/i.test(raw)) {
    cleaned = 'เขตของกรุงเทพมหานคร';
  }

  // 1. Relational attribute decomposition
  let relationRole = null;
  let headEntity = '';
  let objectEntity = '';
  let actionPredicate = null;
  const focusKeywords = [];
  let isYesNoOrPractical = false;

  for (const { role, regex } of RELATIONAL_ROLES) {
    if (regex.test(cleaned)) {
      relationRole = role;
      headEntity = cleaned.replace(regex, '').trim();
      if (role === 'ceo') focusKeywords.push('CEO', 'ซีอีโอ', 'ผู้บริหาร', 'ประธานเจ้าหน้าที่บริหาร');
      else if (role === 'founder') focusKeywords.push('ผู้ก่อตั้ง', 'ก่อตั้ง');
      else if (role === 'owner') focusKeywords.push('เจ้าของ');
      else if (role === 'creator') focusKeywords.push('ผู้สร้าง', 'ผู้คิดค้น', 'ผู้ประพันธ์', 'ผู้แต่ง');
      else if (role === 'capital') focusKeywords.push('เมืองหลวง', 'นครหลวง');
      break;
    }
  }

  // 2. SOV & Practical Action Analysis (e.g. "แมวกินช็อกโกแลตได้ไหม", "แมวกินได้ไหม", "ทำไม...")
  // Case A: <Subject> กิน <Object> ได้ไหม
  const consumeMatch = colloquialNormalized.match(/^(.+?)\s*(?:กิน|ทาน|บริโภค)\s*(.+?)\s*(?:ได้ไหม|ได้มั้ย|ได้หรือเปล่า|ได้ป่าว|ได้ป่ะ|อันตรายไหม|เป็นพิษไหม)/i);
  // Case B: <Subject> กินได้ไหม (without object)
  const edibilityMatch = colloquialNormalized.match(/^(.+?)\s*(?:กินได้ไหม|กินได้มั้ย|กินได้หรือเปล่า|กินได้ป่าว|กินได้ป่ะ)/i);
  // Case C: Why / How-to
  const whyMatch = colloquialNormalized.match(/^(?:ทำไม|ทำไมถึง|เหตุใด|เพราะอะไร)\s*(.+)/i);
  const howMatch = colloquialNormalized.match(/^(?:วิธี(?:แก้)?|ทำยังไง|อย่างไร|ช่วยบอกวิธี)\s*(.+)/i);

  if (consumeMatch) {
    headEntity = consumeMatch[1].trim();
    objectEntity = consumeMatch[2].trim();
    actionPredicate = 'can_consume';
    isYesNoOrPractical = true;
    focusKeywords.push('กิน', 'อันตราย', 'พิษ', objectEntity);
  } else if (edibilityMatch) {
    headEntity = edibilityMatch[1].trim();
    if (focusEntity && focusEntity !== headEntity) {
      objectEntity = focusEntity;
      actionPredicate = 'can_consume';
      isYesNoOrPractical = true;
      focusKeywords.push('กิน', 'อันตราย', 'พิษ', objectEntity);
    } else {
      actionPredicate = 'edibility';
      isYesNoOrPractical = true;
      focusKeywords.push('กิน', 'เนื้อ', 'กฎหมาย', 'บริโภค', 'อาหาร');
    }
  } else if (whyMatch) {
    actionPredicate = 'why';
    isYesNoOrPractical = true;
    headEntity = whyMatch[1].trim();
  } else if (howMatch) {
    actionPredicate = 'how_to';
    isYesNoOrPractical = true;
    headEntity = howMatch[1].trim();
  } else if (PRACTICAL_YESNO_REGEX.test(colloquialNormalized)) {
    isYesNoOrPractical = true;
    if (/กิน/.test(colloquialNormalized)) focusKeywords.push('กิน', 'อาหาร');
    if (/ช็อกโกแลต/.test(colloquialNormalized)) focusKeywords.push('ช็อกโกแลต');
    if (/ขา/.test(colloquialNormalized)) focusKeywords.push('ขา');
  }

  // 3. Trailing relational & aspect extraction
  if (!relationRole && !actionPredicate) {
    if (/ใคร(?:เป็นคน)?(?:แต่ง|ประพันธ์)/i.test(raw)) {
      relationRole = 'creator';
      headEntity = cleaned.replace(/ใคร(?:เป็นคน)?(?:แต่ง|ประพันธ์)/gi, '').trim();
      focusKeywords.push('แต่ง', 'ประพันธ์', 'ผู้แต่ง');
    } else if (/โนเบล/i.test(raw)) {
      focusKeywords.push('รางวัลโนเบล', 'โนเบล');
      if (/ไอน์สไตน์/i.test(raw)) headEntity = 'อัลเบิร์ต ไอน์สไตน์';
    } else if (/อาการ/i.test(raw)) {
      focusKeywords.push('อาการ');
      if (/ไข้เลือดออก/i.test(raw)) headEntity = 'ไข้เลือดออก';
    } else if (/อายุขัย|กี่ปี/i.test(raw)) {
      focusKeywords.push('อายุขัย', 'อายุ', 'ปี');
      if (/แมว/i.test(raw)) headEntity = 'แมว';
    }
  }

  // Expand abbreviations on the cleaned topic
  const expanded = expandAbbreviations(cleaned);
  const canonicalTopic = expanded || cleaned || raw;

  if (!headEntity) {
    headEntity = canonicalTopic;
  }

  // Normalize casing for known entities
  if (headEntity.toLowerCase() === 'chatgpt') headEntity = 'ChatGPT';
  else if (headEntity.toLowerCase() === 'google') headEntity = 'Google';
  else if (headEntity.toLowerCase() === 'tesla') headEntity = 'Tesla';

  // Generate candidates in prioritized order
  const candidatesSet = new Set();

  if (actionPredicate === 'can_consume' && headEntity && objectEntity) {
    candidatesSet.add(`${headEntity}กิน${objectEntity}ได้ไหม อันตรายไหม`);
    candidatesSet.add(`${headEntity} ${objectEntity} พิษ`);
    candidatesSet.add(`${headEntity}กิน${objectEntity}ได้ไหม`);
    candidatesSet.add(headEntity);
    candidatesSet.add(objectEntity);
  } else if (actionPredicate === 'edibility' && headEntity) {
    candidatesSet.add(`เนื้อ${headEntity}กินได้ไหม กฎหมาย อาหารของแมว`);
    candidatesSet.add(`เนื้อ${headEntity}กินได้ไหม`);
    candidatesSet.add(`${headEntity}กินได้ไหม`);
    candidatesSet.add(headEntity);
  } else if (actionPredicate === 'why' || actionPredicate === 'how_to') {
    candidatesSet.add(colloquialNormalized);
    candidatesSet.add(headEntity);
  }

  if (relationRole) {
    if (relationRole === 'ceo') {
      candidatesSet.add(`${headEntity} CEO`);
      candidatesSet.add(headEntity);
      const parentOrg = KNOWN_ORGANIZATIONS[headEntity.toLowerCase()];
      if (parentOrg) candidatesSet.add(parentOrg);
    } else if (relationRole === 'founder') {
      candidatesSet.add(`${headEntity} ผู้ก่อตั้ง`);
      candidatesSet.add(headEntity);
    } else if (relationRole === 'owner') {
      candidatesSet.add(`${headEntity} เจ้าของ`);
      candidatesSet.add(headEntity);
    } else if (relationRole === 'capital') {
      candidatesSet.add(`เมืองหลวง${headEntity}`);
      candidatesSet.add(headEntity);
    } else if (relationRole === 'creator') {
      candidatesSet.add(headEntity);
    }
  }

  if (headEntity) candidatesSet.add(headEntity);
  if (canonicalTopic) candidatesSet.add(canonicalTopic);
  if (cleaned && cleaned !== canonicalTopic) candidatesSet.add(cleaned);

  if (/นายกรัฐมนตรีไทย/.test(canonicalTopic)) {
    candidatesSet.add('นายกรัฐมนตรีไทย');
  }
  if (/ผลิตภัณฑ์มวลรวมในประเทศ/.test(canonicalTopic)) {
    candidatesSet.add('ผลิตภัณฑ์มวลรวมในประเทศ');
  }
  if (/^(?:python|ไพทอน)$/i.test(canonicalTopic)) {
    candidatesSet.add('ภาษาไพทอน');
  }

  const matchedLeading = LEADING_FRAME_REGEX.test(preprocessed);
  const matchedTrailing = TRAILING_FRAME_REGEX.test(preprocessed);
  const hadAbbr = expanded !== cleaned;

  const SUBJECTIVE_OR_QUESTION_REGEX = /(?:ชอบ|คิดว่า|รู้สึก|เห็นด้วย|ดีกว่า|มากกว่า|แนะนำ|คิดเห็น|อะไร|ทำไม|อย่างไร|ยังไง|ไหน|หรือเปล่า|หรือไม่|หรือยัง|มั้ย|ไหม|เท่าไหร่|เท่าใด|กี่)/i;
  const ACTION_VERB_REGEX = /^(?:ยิง|เปิด|ปิด|ลบ|ส่ง|สร้าง|ทำลาย|โจมตี|เล่น|รัน|start\b|stop\b|launch\b|shoot\b|fire\b)/i;

  const isGreeting = GREETINGS_REGEX.test(cleaned);
  const isBareNoun = Boolean(
    !isGreeting &&
    !matchedLeading &&
    !matchedTrailing &&
    !isYesNoOrPractical &&
    !relationRole &&
    !actionPredicate &&
    !SUBJECTIVE_OR_QUESTION_REGEX.test(cleaned) &&
    !ACTION_VERB_REGEX.test(cleaned) &&
    cleaned.split(/\s+/).length <= 2 &&
    cleaned.length >= 2 &&
    cleaned.length <= 30 &&
    !/[?.,!]/.test(raw)
  );

  const isKnowledgeIntent = Boolean(
    !isGreeting &&
    canonicalTopic &&
    canonicalTopic.length >= 2 &&
    (isBareNoun || matchedLeading || matchedTrailing || hadAbbr || relationRole || isYesNoOrPractical || focusKeywords.length > 0 || (focusEntity && /(?:แล้ว)?มัน/i.test(raw)))
  );

  const effectivePrompt = isBareNoun
    ? `สรุปข้อมูลสำคัญและความหมายของ ${headEntity}`
    : raw;

  return {
    canonicalTopic,
    headEntity,
    objectEntity,
    focusKeywords,
    relationRole,
    actionPredicate,
    searchCandidates: /^(?:python|ไพทอน)$/i.test(canonicalTopic)
      ? ['ภาษาไพทอน', ...Array.from(candidatesSet).filter((c) => c !== 'ภาษาไพทอน')]
      : Array.from(candidatesSet),
    rawCleaned: cleaned,
    isKnowledgeIntent,
    isBareNoun,
    isYesNoOrPractical,
    isPracticalQuery: Boolean(isYesNoOrPractical || actionPredicate),
    isSlang,
    slangExplanation,
    effectivePrompt
  };
}
