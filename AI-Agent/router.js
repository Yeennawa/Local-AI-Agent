// Intent Router (Deep Module)
// Provides deterministic, 0-token intent classification and parameter extraction
// before falling back to small LLM decisions, preventing common small-model routing bugs.

const ALIASES = {
  'ราสเบอร์รีพาย': 'Raspberry Pi',
  'ราสเบอร์รี่พาย': 'Raspberry Pi',
  'รัสเบอรี่พาย': 'Raspberry Pi'
};

const FILLER_PREFIX_REGEX = /^(?:ช่วย(?:หา|ค้นหา)?(?:ข้อมูล|ประวัติ)?(?:เกี่ยวกับ|ของ)?|อยาก(?:รู้|ทราบ)(?:ข้อมูล|ประวัติ)?(?:เกี่ยวกับ|ของ)?|ประวัติ(?:ความ(?:เป็น)?มา)?(?:ของ)?|ความ(?:เป็น)?มาของ|ข้อมูลเกี่ยวกับ|เล่า(?:เรื่อง|ประวัติ)?(?:ของ)?|ค้นหา(?:เรื่อง)?|เสิร์ช|search for|what is|who is|tell me about|info about|information about)\s*/i;

const FILLER_SUFFIX_REGEX = /\s*(?:คืออะไร(?:นะ|ครับ|ค่ะ)?|คือใคร(?:นะ|ครับ|ค่ะ)?|อยู่ที่ไหน|หมายถึงอะไร|ทำงานอย่างไร|ทำอะไรได้บ้าง|คือสิ่งใด|หน่อย(?:ครับ|ค่ะ|นะ)?|ให้หน่อย(?:ครับ|ค่ะ|นะ)?|ด้วย(?:ครับ|ค่ะ)?|ครับ|ค่ะ|นะ|จ้า|จ๊ะ|\?)+$/i;

const POLITENESS_REGEX = /\s*(?:ครับ|ค่ะ|จ้า|นะ|หน่อย|ด้วย|จ๊ะ|ขอรับ|รบกวน|ช่วย)\s*/g;

export function extractTopic(message, focusEntity = null) {
  if (typeof message !== 'string') return '';
  let cleaned = message.trim();

  // Coreference resolution for simple Thai pronouns when a focus entity exists
  if (focusEntity && /(?:แล้ว)?มัน(?:คืออะไร|คือใคร|มีอะไร)/i.test(cleaned)) {
    return focusEntity;
  }

  // Remove leading conversational prompts
  cleaned = cleaned.replace(FILLER_PREFIX_REGEX, '');

  // Remove trailing question tags and politeness
  cleaned = cleaned.replace(FILLER_SUFFIX_REGEX, '');
  cleaned = cleaned.replace(POLITENESS_REGEX, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Check alias table
  for (const [thaiName, standardName] of Object.entries(ALIASES)) {
    if (cleaned === thaiName || cleaned.includes(thaiName)) {
      return standardName;
    }
  }

  return cleaned;
}

export function extractMathExpression(message) {
  if (typeof message !== 'string') return '';
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^(?:ช่วย(?:คำนวณ|คิดเลข)?|คำนวณ|คิดเลข|หาค่า(?:ของ)?|calculate|solve)\s*/i, '');
  cleaned = cleaned.replace(/\s*(?:ได้เท่าไหร่|เท่ากับเท่าไหร่|ได้เท่าใด|คือเท่าไหร่|มีค่าเท่าใด|ให้หน่อย(?:ครับ|ค่ะ|นะ)?|หน่อย(?:ครับ|ค่ะ|นะ)?|ครับ|ค่ะ|นะ|\?)+$/i, '');
  return cleaned.trim();
}

export function extractGithubQuery(message) {
  if (typeof message !== 'string') return '';
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^(?:ช่วย(?:หา|ค้นหา)?|อยาก(?:ดู|เห็น|ค้นหา)|ขอดู|ค้นหา|หา|เสิร์ช|search|find)\s*/i, '');
  cleaned = cleaned.replace(/(?:ใน|บน)?\s*github\s*(?:หน่อย|ให้หน่อย|ด้วย)?/i, ' ');
  cleaned = cleaned.replace(/(?:repo|repository|โปรเจกต์|คลังโค้ด)\s*/i, ' ');
  cleaned = cleaned.replace(/^(?:for\s+)/i, '');
  cleaned = cleaned.replace(/\s*(?:ให้หน่อย(?:ครับ|ค่ะ|นะ)?|หน่อย(?:ครับ|ค่ะ|นะ)?|ด้วย(?:ครับ|ค่ะ)?|ครับ|ค่ะ|นะ|\?)+$/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

const NEWS_REGEX = /ข่าว|\bnews\b|headlines?/i;

// Order matters: first match wins. Patterns are also stripped from the message to find a leftover topic.
const NEWS_CATEGORY_PATTERNS = [
  ['world', /ต่างประเทศ|(?<=ข่าว)โลก|ต่างชาติ|international|\bworld\b/i],
  ['tech', /เทคโนโลยี|ไอที|เทค|\btech(?:nology)?\b|\bai\b/i],
  ['sports', /กีฬา|ฟุตบอล|\bsports?\b/i],
  ['business', /เศรษฐกิจ|ธุรกิจ|หุ้น|การเงิน|\bbusiness\b|\bfinance\b/i],
  ['science', /วิทยาศาสตร์|\bscience\b/i],
  ['health', /สุขภาพ|การแพทย์|\bhealth\b/i],
  ['entertainment', /บันเทิง|ดารา|\bentertainment\b/i],
  ['thai', /ประเทศไทย|ในประเทศ|(?<=ข่าว)ไทย|\bthai(?:land)?\b/i]
];

const NEWS_FILLER_REGEX = /ข่าว|\bnews\b|\bheadlines?\b|\blatest\b|\btoday\b|เป็นยังไงบ้าง|เป็นอย่างไรบ้าง|เกิดอะไรขึ้น|มีอะไรบ้าง|มีอะไร|น่าสนใจ|ล่าสุด|วันนี้|ตอนนี้|ปัจจุบัน|เกี่ยวกับ|อยากรู้|อยากทราบ|ช่วยสรุป|ช่วย|บอก|เล่า|หน่อย|บ้าง|ครับ|ค่ะ|นะ|\?/gi;

export function extractNewsParams(message) {
  const matched = NEWS_CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(message));
  let leftover = message;
  for (const [, pattern] of NEWS_CATEGORY_PATTERNS) {
    leftover = leftover.replace(new RegExp(pattern.source, 'gi'), ' ');
  }
  leftover = leftover.replace(NEWS_FILLER_REGEX, ' ').replace(/\s+/g, ' ').trim();

  if (leftover.length >= 2) return { query: leftover };
  return { category: matched ? matched[0] : 'thai' };
}

const CAPABILITY_REGEX = /ทำอะไรได้|ช่วยอะไรได้|ทำอะไรเป็น|ความสามารถ|what can you do|capabilit(?:y|ies)|abilit(?:y|ies)/i;
const CAPABILITY_FILLER_REGEX = /คุณ|เธอ|ตัวเอง|สามารถ|ทำอะไรได้|ช่วยอะไรได้|ทำอะไรเป็น|ความสามารถ|มีอะไร|อะไร|บ้าง|หรอ|เหรอ|ไหม|ครับ|ค่ะ|นะ|ได้|ของ|ตอนนี้|แม็กซ์|\bmax\b|บอท|\bai\b|\bwhat\b|\bcan\b|\byou\b|\bdo\b|\byour\b|capabilit(?:y|ies)|abilit(?:y|ies)|[?\s]/gi;

// True only when the question is about the assistant itself, not "<topic> ทำอะไรได้บ้าง".
export function isCapabilityInquiry(message) {
  if (!CAPABILITY_REGEX.test(message)) return false;
  return message.replace(CAPABILITY_FILLER_REGEX, '').length === 0;
}

const UNSUPPORTED_PLATFORM_REGEX = /facebook|เฟซบุ๊ก|เฟซบุ้ก|เฟสบุ๊ก|เฟสบุ้ก|twitter|ทวิตเตอร์|\bx\.com\b|instagram|อินสตาแกรม|\btiktok\b|ติ๊กต่อก|reddit|เรดดิท/i;
const READ_INTENT_REGEX = /ดู|อ่าน|ค้น|หา|เช็ค|โพสต์|เปิด|ข่าว|สรุป|แนะนำ|เล่า|\bread\b|\bsearch\b|\bnews\b|\bsummar/i;

export function routeIntent({ message, history = [], focusEntity = null }) {
  if (typeof message !== 'string' || !message.trim()) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'empty_input' };
  }

  const raw = message.trim();
  const lower = raw.toLowerCase();

  // 1. Pure Greetings and Polite Chit-chat
  const isGreeting = /^(?:สวัสดี(?:ครับ|ค่ะ)?|หวัดดี|ดีครับ|ดีค่ะ|ฮัลโหล|hello(?:\s+there)?|hi(?:\s+there)?|hey|good\s+(?:morning|evening|afternoon)|สบายดีไหม|เป็นไงบ้าง|เป็นอย่างไรบ้าง|ขอบคุณ(?:มาก)?(?:นะ)?(?:ครับ|ค่ะ)?|thanks(?:\s+a\s+lot)?|thank\s+you|บาย(?:ครับ|ค่ะ|นะ)?|ลาก่อน(?:ครับ|ค่ะ|นะ)?|bye|goodbye)\s*$/i.test(raw);
  if (isGreeting) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'greeting_chat' };
  }

  // 1b. Questions about the assistant itself are answered from the real tool list.
  if (isCapabilityInquiry(raw)) {
    return { intent: 'direct', toolCall: null, confidence: 'high', reason: 'capabilities' };
  }

  // 1c. Social platforms we cannot read: say so honestly instead of letting the model improvise.
  if (UNSUPPORTED_PLATFORM_REGEX.test(raw) && READ_INTENT_REGEX.test(raw)) {
    return { intent: 'direct', toolCall: null, confidence: 'high', reason: 'unsupported_platform' };
  }

  // 1d. News of any category or topic.
  if (NEWS_REGEX.test(raw)) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_news', params: extractNewsParams(raw) },
      confidence: 'high',
      reason: 'news_lookup'
    };
  }

  // 2. Conflict Rule: Person / Entity / Office-holder questions
  // Questions containing "ใคร" or government/leadership roles must NEVER be routed to time tool,
  // even if they contain temporal words like "ตอนนี้", "ปัจจุบัน", "now", "currently".
  const hasPersonOrOfficeRole = /(?:ใคร|ใครคือ|คือใคร|นายก|นายกรัฐมนตรี|ประธานาธิบดี|ผู้ว่า|รัฐมนตรี|กษัตริย์|พระมหากษัตริย์|who|who is|prime minister|president)/i.test(raw);
  if (hasPersonOrOfficeRole) {
    const topic = extractTopic(raw, focusEntity) || (raw.includes('นายก') ? 'นายกรัฐมนตรีไทย' : raw);
    return {
      intent: 'tool',
      toolCall: {
        name: 'search_wikipedia',
        params: { topic }
      },
      confidence: 'high',
      reason: 'person_entity_knowledge'
    };
  }

  // 3. Explicit Time / Date Check
  // Must contain concrete time nouns. General adverbs ("ตอนนี้", "ปัจจุบัน") alone do NOT qualify.
  const hasExplicitTimeNoun = /(?:กี่โมง|เวลาเท่าไหร่|เวลาเท่าใด|เวลาอะไร|เวลากี่โมง|ขอดูเวลา|บอกเวลา|เวลานี้|วันนี้วันที่|วันที่เท่าไหร่|วันอะไร|เดือนอะไร|ปีอะไร|what time|current time|today's date)/i.test(raw);
  if (hasExplicitTimeNoun) {
    return {
      intent: 'tool',
      toolCall: {
        name: 'get_current_time',
        params: {}
      },
      confidence: 'high',
      reason: 'explicit_time'
    };
  }

  // 4. System Info Check (Hardware & OS metrics)
  const isSystemMetric = /(?:แรม|หน่วยความจำ|สเปก|สเปค|สถานะเครื่อง|อุณหภูมิ|ความจุ|ฮาร์ดแวร์|เปิดเครื่อง|เปิดทำงาน|cpu|ram|memory|uptime|system info)/i.test(raw);
  if (isSystemMetric) {
    return {
      intent: 'tool',
      toolCall: {
        name: 'get_system_info',
        params: {}
      },
      confidence: 'high',
      reason: 'system_metrics'
    };
  }

  // 5. Math and Calculation Check
  const isMathQuery = /(?:คำนวณ|คิดเลข|calculate|solve)/i.test(raw) ||
    /\d+\s*(?:บวก|ลบ|\+|\-|คูณ|\*|หาร|\/)\s*\d+/.test(raw) ||
    /\(?\d+\s*[\+\-\*\/]\s*\d+\)?/.test(raw);
  if (isMathQuery) {
    const expression = extractMathExpression(raw);
    if (expression) {
      return {
        intent: 'tool',
        toolCall: {
          name: 'calculate',
          params: { expression }
        },
        confidence: 'high',
        reason: 'arithmetic_calculation'
      };
    }
  }

  // 6. GitHub Search Check (Open source & repository search)
  const isGithubQuery = /(?:github|repo\b|repository\b|คลังโค้ด)/i.test(raw);
  if (isGithubQuery) {
    const query = extractGithubQuery(raw);
    if (query) {
      return {
        intent: 'tool',
        toolCall: {
          name: 'search_github',
          params: { query }
        },
        confidence: 'high',
        reason: 'github_search'
      };
    }
  }

  // 7. Knowledge & Conceptual Questions (Wikipedia)
  const isKnowledgeQuery = /(?:คืออะไร|คือใคร|ประวัติ|ประวัติศาสตร์|หมายถึงอะไร|อยู่ที่ไหน|ทำอะไรได้บ้าง|ข้อมูลเกี่ยวกับ|ค้นหา|วิกิ|wikipedia|what is|who is|explain)/i.test(raw);
  if (isKnowledgeQuery || (focusEntity && /(?:แล้ว)?มัน/i.test(raw))) {
    const topic = extractTopic(raw, focusEntity);
    if (topic && topic.length >= 2) {
      return {
        intent: 'tool',
        toolCall: {
          name: 'search_wikipedia',
          params: { topic }
        },
        confidence: 'high',
        reason: 'knowledge_lookup'
      };
    }
  }

  // 8. Ambiguous / Complex request requiring LLM reasoning
  return {
    intent: 'unknown',
    toolCall: null,
    confidence: 'low',
    reason: 'ambiguous_query'
  };
}
