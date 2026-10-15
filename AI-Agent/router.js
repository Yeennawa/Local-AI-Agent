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

export function routeIntent({ message, history = [], focusEntity = null }) {
  if (typeof message !== 'string' || !message.trim()) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'empty_input' };
  }

  const raw = message.trim();
  const lower = raw.toLowerCase();

  // 1. Pure Greetings and Polite Chit-chat
  const isGreeting = /^(?:สวัสดี(?:ครับ|ค่ะ)?|หวัดดี|ดีครับ|ดีค่ะ|ฮัลโหล|hello(?:\s+there)?|hi(?:\s+there)?|hey|good\s+(?:morning|evening|afternoon)|ขอบคุณ(?:มาก)?(?:นะ)?(?:ครับ|ค่ะ)?|thanks(?:\s+a\s+lot)?|thank\s+you|บาย(?:ครับ|ค่ะ)?|ลาก่อน|bye|goodbye)\s*$/i.test(raw);
  if (isGreeting) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'greeting_chat' };
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
  const isSystemMetric = /(?:แรม|หน่วยความจำ|สเปก|สเปค|สถานะเครื่อง|อุณหภูมิ|ความจุ|ฮาร์ดแวร์|cpu|ram|memory|uptime|system info)/i.test(raw);
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

  // 5. Knowledge & Conceptual Questions (Wikipedia)
  const isKnowledgeQuery = /(?:คืออะไร|คือใคร|ประวัติ|ประวัติศาสตร์|หมายถึงอะไร|อยู่ที่ไหน|ข้อมูลเกี่ยวกับ|ค้นหา|วิกิ|wikipedia|what is|who is|explain)/i.test(raw);
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

  // 6. Ambiguous / Complex request requiring LLM reasoning
  return {
    intent: 'unknown',
    toolCall: null,
    confidence: 'low',
    reason: 'ambiguous_query'
  };
}
