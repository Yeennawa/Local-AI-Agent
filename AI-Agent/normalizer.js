// Deep Module: ThaiQueryNormalizer
// Centralizes Thai query cleaning, abbreviation expansion, domain term mapping,
// and bigram containment scoring behind a clean interface.

const LEADING_FRAME_REGEX = /^(?:ใครคือ|ใครเป็น|ใครสร้าง|ใครคิดค้น|ช่วยอธิบาย(?:เรื่อง)?|อธิบาย(?:เรื่อง)?|ช่วย(?:หา|ค้นหา)?(?:ข้อมูล|ประวัติ)?(?:เรื่อง|เกี่ยวกับ|ของ)?|อยาก(?:รู้|ทราบ)(?:ข้อมูล|ประวัติ)?(?:เรื่อง|เกี่ยวกับ|ของ)?|ประวัติ(?:ความ(?:เป็น)?มา)?(?:ของ)?|ความ(?:เป็น)?มาของ|ข้อมูลเกี่ยวกับ|เล่า(?:เรื่อง|ประวัติ)?(?:ของ)?|ขอข้อมูล(?:เรื่อง|เกี่ยวกับ)?|ช่วยบอกหน่อยว่า|บอกหน่อยว่า|รู้ไหมว่า|ทราบไหมว่า|ค้นหา(?:เรื่อง)?|เสิร์ช|search for|what is|who is|tell me about|info about|information about|explain)\s*/i;

const TRAILING_FRAME_REGEX = /\s*(?:คืออะไร(?:นะ|ครับ|ค่ะ)?|คือใคร(?:ใน(?:ปัจจุบัน|ตอนนี้))?(?:นะ|ครับ|ค่ะ)?|เป็นใคร(?:ใน(?:ปัจจุบัน|ตอนนี้))?(?:นะ|ครับ|ค่ะ)?|ชื่ออะไร(?:นะ|ครับ|ค่ะ)?|อยู่ที่ไหน|หมายถึงอะไร|ทำงานอย่างไร|ทำอะไรได้บ้าง|คือสิ่งใด|คนปัจจุบัน|ในปัจจุบัน|ปัจจุบัน|ตอนนี้|มีกี่(?:จังหวัด|เขต|อำเภอ|สายพันธุ์|ประเทศ|คน|แห่ง|ข้อ|อัน|ตัว)?|ได้เท่าไหร่|เท่าใด|กี่องศา|หน่อย(?:ครับ|ค่ะ|นะ)?|ให้หน่อย(?:ครับ|ค่ะ|นะ)?|ด้วย(?:ครับ|ค่ะ)?|ครับ|ค่ะ|นะ|จ้า|จ๊ะ|\?)+$/i;

const POLITENESS_REGEX = /\s*(?:ครับ|ค่ะ|จ้า|นะ|หน่อย|ด้วย|จ๊ะ|ขอรับ|รบกวน|ช่วย)\s*/g;

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

export function normalizeQuery(message, { focusEntity = null } = {}) {
  if (typeof message !== 'string') {
    return { canonicalTopic: '', searchCandidates: [], rawCleaned: '', isKnowledgeIntent: false };
  }

  const raw = message.trim();

  // Coreference resolution for simple Thai pronouns when a focus entity exists
  if (focusEntity && /(?:แล้ว)?มัน(?:คืออะไร|คือใคร|มีอะไร|อยู่ที่ไหน|ราคาเท่าไหร่)/i.test(raw)) {
    return {
      canonicalTopic: focusEntity,
      searchCandidates: [focusEntity],
      rawCleaned: focusEntity,
      isKnowledgeIntent: true
    };
  }

  // Pre-expand known compound phrases before frame stripping
  let preprocessed = raw;
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

  // Expand abbreviations on the cleaned topic
  const expanded = expandAbbreviations(cleaned);

  const canonicalTopic = expanded || cleaned || raw;

  // Generate candidates in prioritized order
  const candidatesSet = new Set();
  if (canonicalTopic) candidatesSet.add(canonicalTopic);
  if (cleaned && cleaned !== canonicalTopic) candidatesSet.add(cleaned);

  // If query had abbreviations, add standard root candidates
  if (/นายกรัฐมนตรีไทย/.test(canonicalTopic)) {
    candidatesSet.add('นายกรัฐมนตรีไทย');
  }
  if (/ผลิตภัณฑ์มวลรวมในประเทศ/.test(canonicalTopic)) {
    candidatesSet.add('ผลิตภัณฑ์มวลรวมในประเทศ');
  }

  const matchedLeading = LEADING_FRAME_REGEX.test(preprocessed);
  const matchedTrailing = TRAILING_FRAME_REGEX.test(preprocessed);
  const hadAbbr = expanded !== cleaned;
  const isKnowledgeIntent = Boolean(
    canonicalTopic &&
    canonicalTopic.length >= 2 &&
    (matchedLeading || matchedTrailing || hadAbbr || (focusEntity && /(?:แล้ว)?มัน/i.test(raw)))
  );

  return {
    canonicalTopic,
    searchCandidates: Array.from(candidatesSet),
    rawCleaned: cleaned,
    isKnowledgeIntent
  };
}
