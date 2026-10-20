import { normalizeQuery, expandAbbreviations } from './normalizer.js';
import { getThaiJoke, explainSlangOrMeme, buildRoleplayPrompt } from './culture.js';

export const CITY_TIMEZONES = {
  'โตเกียว': 'Asia/Tokyo',
  'ญี่ปุ่น': 'Asia/Tokyo',
  'tokyo': 'Asia/Tokyo',
  'japan': 'Asia/Tokyo',
  'ลอนดอน': 'Europe/London',
  'อังกฤษ': 'Europe/London',
  'london': 'Europe/London',
  'นิวยอร์ก': 'America/New_York',
  'สหรัฐ': 'America/New_York',
  'new york': 'America/New_York',
  'ปารีส': 'Europe/Paris',
  'ฝรั่งเศส': 'Europe/Paris',
  'paris': 'Europe/Paris',
  'โซล': 'Asia/Seoul',
  'เกาหลี': 'Asia/Seoul',
  'seoul': 'Asia/Seoul',
  'korea': 'Asia/Seoul',
  'สิงคโปร์': 'Asia/Singapore',
  'singapore': 'Asia/Singapore',
  'ฮ่องกง': 'Asia/Hong_Kong',
  'hong kong': 'Asia/Hong_Kong',
  'ซิดนีย์': 'Australia/Sydney',
  'ออสเตรเลีย': 'Australia/Sydney',
  'sydney': 'Australia/Sydney',
  'กรุงเทพ': 'Asia/Bangkok',
  'ไทย': 'Asia/Bangkok',
  'bangkok': 'Asia/Bangkok'
};

export function extractCityTimezone(message) {
  if (typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  for (const [key, tz] of Object.entries(CITY_TIMEZONES)) {
    if (lower.includes(key)) {
      return { timezone: tz, city: key };
    }
  }
  return null;
}

export function extractTopic(message, focusEntity = null) {
  if (typeof message !== 'string') return '';
  const { canonicalTopic } = normalizeQuery(message, { focusEntity });
  return canonicalTopic;
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
  cleaned = cleaned.replace(/^(?:ช่วย(?:หา|ค้นหา)?|อยาก(?:ดู|เห็น|ค้นหา)|ขอดู|ค้นหา|หา|เสิร์ช|search|find)\s*/i, '').trim();
  cleaned = cleaned.replace(/(?:ใน|บน)?\s*github\s*(?:หน่อย|ให้หน่อย|ด้วย)?/i, ' ').trim();
  cleaned = cleaned.replace(/(?:repo|repository|โปรเจกต์|คลังโค้ด)\s*/i, ' ').trim();
  cleaned = cleaned.replace(/^(?:for\s+)/i, '').trim();
  cleaned = cleaned.replace(/\s*(?:ให้หน่อย(?:ครับ|ค่ะ|นะ)?|หน่อย(?:ครับ|ค่ะ|นะ)?|ด้วย(?:ครับ|ค่ะ)?|ครับ|ค่ะ|นะ|\?)+$/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

const NEWS_REGEX = /ข่าว|\bnews\b|headlines?/i;

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

export function isCapabilityInquiry(message) {
  if (!CAPABILITY_REGEX.test(message)) return false;
  return message.replace(CAPABILITY_FILLER_REGEX, '').length === 0;
}

const UNSUPPORTED_PLATFORM_REGEX = /facebook|เฟซบุ๊ก|เฟซบุ้ก|เฟสบุ๊ก|เฟสบุ้ก|twitter|ทวิตเตอร์|\bx\.com\b|instagram|อินสตาแกรม|\btiktok\b|ติ๊กต่อก|reddit|เรดดิท/i;
const READ_INTENT_REGEX = /ดู|อ่าน|ค้น|หา|เช็ค|โพสต์|เปิด|ข่าว|สรุป|แนะนำ|เล่า|\bread\b|\bsearch\b|\bnews\b|\bsummar/i;

const WEATHER_FILLER_REGEX = /(?:สภาพ)?อากาศ|พยากรณ์(?:อากาศ)?|ที่|ใน|ของ|วันนี้|ตอนนี้|ปัจจุบัน|เป็น(?:ยัง)?ไง(?:บ้าง)?|เป็นอย่างไร(?:บ้าง)?|ฝนจะตกไหม|ฝนตกไหม|จะตกไหม|ตกไหม|ไหม|มั้ย|ครับ|ค่ะ|นะ|หน่อย|current|weather|forecast|today|now|in|\?/gi;

export function extractWeatherLocation(message) {
  if (typeof message !== 'string') return 'Bangkok';
  const cleaned = message.replace(WEATHER_FILLER_REGEX, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : 'Bangkok';
}

export function extractFxParams(message) {
  if (typeof message !== 'string') return { base: 'USD', target: 'THB', amount: 1 };

  const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 1;

  let base = 'USD';
  if (/เยน|jpy/i.test(message)) base = 'JPY';
  else if (/ยูโร|eur/i.test(message)) base = 'EUR';
  else if (/ปอนด์|gbp/i.test(message)) base = 'GBP';
  else if (/หยวน|cny/i.test(message)) base = 'CNY';
  else if (/วอน|krw/i.test(message)) base = 'KRW';
  else if (/ดอลลาร์สิงคโปร์|sgd/i.test(message)) base = 'SGD';
  else if (/ดอลลาร์|เหรียญสหรัฐ|usd/i.test(message)) base = 'USD';
  else if (/บาท|thb/i.test(message) && !/กี่บาท|เป็นเงินไทย/i.test(message)) base = 'THB';

  let target = 'THB';
  const targetMatch = message.match(/to\s+([a-z]{3})/i);
  const targetQ = message.match(/(?:กี่|เท่ากับ|เป็น)\s*([a-z]{3})/i);
  if (targetMatch) {
    target = targetMatch[1].toUpperCase();
  } else if (targetQ) {
    target = targetQ[1].toUpperCase();
  } else if (/เป็น\s*(?:ดอลลาร์|usd)/i.test(message)) {
    target = 'USD';
  } else if (/เป็น\s*(?:เยน|jpy)/i.test(message)) {
    target = 'JPY';
  }

  if (base === target && base === 'THB') {
    base = 'USD';
  }

  return { base, target, amount };
}

export function routeIntent({ message, history = [], focusEntity = null }) {
  if (typeof message !== 'string' || !message.trim()) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'empty_input' };
  }

  const raw = message.trim();

  // 1. Model Self-Awareness & Active LLM Inquiry (Tier 1 Adaptive RAG)
  const isModelIdentityQuery = /^(?:แล้ว)?(?:คุณ|เธอ|ตัวเอง)?\s*(?:คือ\s*ใคร|ชื่อ\s*อะไร|เป็น\s*ใคร|model|โมเดล|llm|qwen|โหมด\s*ไหน|รุ่น\s*ไหน)/i.test(raw) ||
    /(?:ตอนนี้|ปัจจุบัน).*(?:คุณ|เธอ|ตัวเอง|บอท).*(?:คือ|ใช้|รัน).*(?:model|โมเดล|llm|ตัวไหน|อะไร|โหมดไหน)/i.test(raw) ||
    /^(?:แล้ว)?(?:คุณ|เธอ|ตัวเอง)?\s*(?:ใช่|ใช้)\s*(?:ของ\s*)?(?:model|โมเดล|llm|qwen|1\.5b|3b)/i.test(raw);
  if (isModelIdentityQuery) {
    return {
      intent: 'direct',
      toolCall: null,
      confidence: 'high',
      reason: 'model_identity'
    };
  }

  // 2. Conversational Feedback, Corrections & Pushback (Tier 1 Adaptive RAG)
  const isFeedbackOrCorrection = /(?:เขียน|สะกด|พิมพ์|ตอบ|บอก|ชื่อ).*(?:ผิด|มั่ว|เพี้ยน|ไม่ถูก)/i.test(raw) ||
    /^(?:ผิดแล้ว|ไม่ใช่(?:นะ|ครับ|ค่ะ)?|มั่วแล้ว|ตอบใหม่|เอาใหม่|พูดใหม่|อธิบายเพิ่ม|สรุปสั้นๆ|แปลเป็น|จริงหรอ|แน่ใจนะ)/i.test(raw);
  if (isFeedbackOrCorrection) {
    return {
      intent: 'finish',
      toolCall: null,
      confidence: 'high',
      reason: 'conversational_feedback'
    };
  }

  // 3. Pure Greetings and Polite Chit-chat
  const isGreeting = /^(?:สวัสดี(?:ครับ|ค่ะ)?|หวัดดี|ดีครับ|ดีค่ะ|ฮัลโหล|hello(?:\s+there)?|hi(?:\s+there)?|hey|good\s+(?:morning|evening|afternoon)|สบายดีไหม|เป็นไงบ้าง|เป็นอย่างไรบ้าง|ขอบคุณ(?:มาก)?(?:นะ)?(?:ครับ|ค่ะ)?|thanks(?:\s+a\s+lot)?|thank\s+you|บาย(?:ครับ|ค่ะ|นะ)?|ลาก่อน(?:ครับ|ค่ะ|นะ)?|bye|goodbye)\s*$/i.test(raw) ||
    /^(?:สวัสดี(?:ครับ|ค่ะ)?|หวัดดี|ดีครับ|ดีค่ะ|ฮัลโหล)\s*(?:แนะนำตัว|ช่วยแนะนำตัว|ทักทาย)/i.test(raw);
  if (isGreeting) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'greeting_chat' };
  }

  // 2. Emotional expressions and subjective opinions (direct conversational finish)
  const isEmotionalOrOpinion = /^(?:เหนื่อย|ท้อ|เหงา|เบื่อ|เครียด|หิว|ง่วง|ดีใจ|เศร้า)(?:จัง|มาก|จังเลย|ชะมัด|อ่ะ|เลย|นะ|\s|วันนี้)*$/i.test(raw) ||
    /(?:คุณคิดว่า|คิดว่า|มีความเห็นว่า|ชอบ).*(?:อะไรดีกว่า|ดีไหม|ดีปะ|ยังไงดี|ดีกว่ากัน|มากกว่ากัน|อะไรมากกว่า)/i.test(raw);
  if (isEmotionalOrOpinion) {
    return { intent: 'finish', toolCall: null, confidence: 'high', reason: 'emotional_opinion_chat' };
  }

  // 3. Capabilities & Unsupported Platforms
  if (isCapabilityInquiry(raw)) {
    return { intent: 'direct', toolCall: null, confidence: 'high', reason: 'capabilities' };
  }
  if (UNSUPPORTED_PLATFORM_REGEX.test(raw) && READ_INTENT_REGEX.test(raw)) {
    return { intent: 'direct', toolCall: null, confidence: 'high', reason: 'unsupported_platform' };
  }

  // 4. Jokes & Slang
  const isJoke = /^(?:เล่า(?:เรื่อง)?(?:มุก|โจ๊ก)?(?:ตลก|ขำขัน|ฮาๆ|ขำๆ|กวนๆ)|ขอ(?:มุก|โจ๊ก)?(?:ตลก|ฮาๆ|ขำๆ)|มุกตลก|joke)/i.test(raw);
  if (isJoke) {
    return { intent: 'joke', toolCall: null, confidence: 'high', reason: 'joke_request' };
  }

  const norm = normalizeQuery(raw, { focusEntity });
  if (norm.isSlang && norm.slangExplanation) {
    return { intent: 'slang', toolCall: null, confidence: 'high', reason: 'slang_definition', text: norm.slangExplanation };
  }

  // 5. Roleplay & Persona Adapter
  const roleplayInstruction = buildRoleplayPrompt(raw);
  if (roleplayInstruction) {
    return { intent: 'roleplay', toolCall: null, confidence: 'high', reason: 'roleplay_persona', prompt: roleplayInstruction };
  }

  // 6. Sports, matches & fixtures
  const isSportsQuery = /(?:ฟุตบอล|ฟุตซอล|พรีเมียร์ลีก|ไทยลีก|ยูฟ่า|แชมเปียนส์ลีก|บอลโลก|ผลบอล|ตารางแข่ง|ใครเตะ|แข่งกับใคร|ตารางบอล|บอลคืนนี้)/i.test(raw);
  if (isSportsQuery) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_news', params: extractNewsParams(raw) },
      confidence: 'high',
      reason: 'sports_news'
    };
  }

  // 7. Live prices, commodities & rates
  const isLivePriceQuery = /(?:ราคาทอง|ราคาน้ำมัน|ราคาหุ้น|บิตคอยน์|คริปโต|ทองคำแท่ง|ทองรูปพรรณ|น้ำมันวันนี้|ทองวันนี้)/i.test(raw) ||
    /(?:ราคา|เรท|บาทละ|ลิตรละ).*(?:ทอง|น้ำมัน|หุ้น|btc|crypto|bitcoin)/i.test(raw) ||
    /(?:ทอง|น้ำมัน|หุ้น|btc).*(?:ราคา|บาทละ|เท่าไหร่|กี่บาท)/i.test(raw);
  if (isLivePriceQuery) {
    return {
      intent: 'tool',
      toolCall: { name: 'search_web', params: { query: raw } },
      confidence: 'high',
      reason: 'live_price_lookup'
    };
  }

  // 8. Foreign Exchange (FX)
  const isFxQuery = /(?:อัตราแลกเปลี่ยน|ค่าเงิน|แลกเงิน|แปลงเงิน|exchange\s*rate|currency|\bto\s*[a-z]{3}\b)/i.test(raw) ||
    /(?:\d+\s*)?(?:usd|thb|jpy|eur|gbp|ดอลลาร์|เยน|ยูโร|ปอนด์)\s*(?:เท่ากับ|เป็นเงินไทย|เป็น)?\s*กี่\s*(?:[a-z]{3}|บาท|ดอลลาร์|เยน|ยูโร|วอน|หยวน)/i.test(raw);
  if (isFxQuery) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_fx', params: extractFxParams(raw) },
      confidence: 'high',
      reason: 'fx_lookup'
    };
  }

  // 9. Hardware & System Metrics
  const isSystemMetric = /(?:แรม|หน่วยความจำ|สเปก|สเปค|สถานะเครื่อง|ความจุ|ฮาร์ดแวร์|เปิดเครื่อง|เปิดทำงาน|cpu|ram|memory|uptime|system info|อุณหภูมิ\s*(?:ของ)?(?:เครื่อง|cpu|ซีพียู))/i.test(raw);
  if (isSystemMetric) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_system_info', params: {} },
      confidence: 'high',
      reason: 'system_metrics'
    };
  }

  // 10. Weather & Temperature Check
  const isHowToOrRemedy = /(?:ทำไง|ทำอย่างไร|วิธี|แก้|แก้ไข|รักษา|กิน|ทำไม)/i.test(raw);
  const isWeatherQuery = !isHowToOrRemedy && (
    /(?:สภาพ)?อากาศ|พยากรณ์อากาศ|ฝนจะตกไหม|ฝนตกไหม|จะตกไหม|ร้อนไหม|หนาวไหม|แดดออกไหม|weather|forecast/i.test(raw) ||
    (/(?:อุณหภูมิ|temperature)/i.test(raw) && !/cpu|ซีพียู|เครื่อง|ฮาร์ดแวร์|แรม|ram/i.test(raw))
  );
  if (isWeatherQuery) {
    const location = extractWeatherLocation(raw);
    return {
      intent: 'tool',
      toolCall: { name: 'get_weather', params: { location } },
      confidence: 'high',
      reason: 'weather_lookup'
    };
  }

  // 11. Time: City Timezone or Explicit Local Time
  const isCityTimeQuery = /(?:เวลา|กี่โมง|time)\s*(?:ใน|ที่|ณ|ของ)\s*/i.test(raw) ||
    /(?:ใน|ที่)\s*([a-zA-Zก-๙\s]+)\s*(?:กี่โมง|เวลาเท่าไหร่)/i.test(raw);
  const matchedCityTz = extractCityTimezone(raw);
  if (isCityTimeQuery && matchedCityTz) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_current_time', params: { timezone: matchedCityTz.timezone } },
      confidence: 'high',
      reason: 'city_time'
    };
  }

  const isHistoricalQuery = /(?:เกิด|สร้าง|ก่อตั้ง|ตาย|เสียชีวิต|ประสูติ|สิ้นพระชนม์|ยุบ|ค้นพบ)/i.test(raw);
  const hasExplicitTimeNoun = !isHistoricalQuery && /(?:กี่โมง|เวลาเท่าไหร่|เวลาเท่าใด|เวลาอะไร|เวลากี่โมง|ขอดูเวลา|บอกเวลา|เวลานี้|วันนี้วันที่|วันที่เท่าไหร่|วันอะไร|เดือนอะไร|ปีนี้ปีอะไร|ตอนนี้ปีอะไร|what time|current time|today's date)/i.test(raw);
  if (hasExplicitTimeNoun) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_current_time', params: {} },
      confidence: 'high',
      reason: 'explicit_time'
    };
  }

  // 12. Math & Arithmetic Calculation
  const isMathQuery = /(?:คำนวณ|คิดเลข|calculate|solve)/i.test(raw) ||
    /\d+\s*(?:บวก|ลบ|\+|\-|คูณ|\*|หาร|\/)\s*\d+/.test(raw) ||
    /\(?\d+\s*[\+\-\*\/]\s*\d+\)?/.test(raw);
  if (isMathQuery) {
    const expression = extractMathExpression(raw);
    if (expression) {
      return {
        intent: 'tool',
        toolCall: { name: 'calculate', params: { expression } },
        confidence: 'high',
        reason: 'arithmetic_calculation'
      };
    }
  }

  // 13. GitHub Search
  const isGithubQuery = /(?:github|repo\b|repository\b|คลังโค้ด)/i.test(raw);
  if (isGithubQuery) {
    const query = extractGithubQuery(raw);
    if (query) {
      return {
        intent: 'tool',
        toolCall: { name: 'search_github', params: { query } },
        confidence: 'high',
        reason: 'github_search'
      };
    }
  }

  // 14. News (General & Topic News)
  if (NEWS_REGEX.test(raw)) {
    return {
      intent: 'tool',
      toolCall: { name: 'get_news', params: extractNewsParams(raw) },
      confidence: 'high',
      reason: 'news_lookup'
    };
  }

  // 15. Person / Office-holder Questions (Wikipedia)
  const hasPersonOrOfficeRole = !isSportsQuery && !isModelIdentityQuery && /(?:ใครคือ|คือใคร|ใครเป็น|เป็นใคร|ชื่ออะไร|เกิด(?:ปี|เมื่อ|ที่)|เสียชีวิต|ตายเมื่อ|นายก|นายกรัฐมนตรี|ประธานาธิบดี|ปธน|ผู้ว่า|รัฐมนตรี|กษัตริย์|พระมหากษัตริย์|ร\.9|ร\.10|รัชกาลที่|who is|prime minister|president)/i.test(raw);
  if (hasPersonOrOfficeRole) {
    const topic = extractTopic(raw, focusEntity) || (raw.includes('นายก') ? 'นายกรัฐมนตรีไทย' : raw);
    return {
      intent: 'tool',
      toolCall: { name: 'search_wikipedia', params: { topic } },
      confidence: 'high',
      reason: 'person_entity_knowledge'
    };
  }

  // 16. Explicit Web Search Intent (Adaptive RAG)
  const isExplicitWebSearch = /(?:ค้นเว็บ|เสิร์ชเว็บ|หาในเน็ต|ค้นหาในเว็บ|search\s*web)/i.test(raw);
  if (isExplicitWebSearch) {
    const query = norm.searchCandidates[0] || raw;
    return {
      intent: 'tool',
      toolCall: { name: 'search_web', params: { query } },
      confidence: 'high',
      reason: 'explicit_web_search'
    };
  }

  // 17. Knowledge & Conceptual Questions (Wikipedia)
  const isAdvisoryOrCreative = /(?:แนะนำ|ช่วยคิด|ไอเดีย|สอน|วิธี|ทำยังไง|ทำอย่างไร|ตั้งชื่อ|แต่ง|เขียน|เปรียบเทียบ|โค้ด|syntax)/i.test(raw);
  const isKnowledgePattern = /(?:คืออะไร|คือใคร|เป็นใคร|ประวัติ|ประวัติศาสตร์|หมายถึงอะไร|อยู่ที่ไหน|ข้อมูลเกี่ยวกับ|วิกิ|wikipedia|what is|who is|explain|ช่วยอธิบายเรื่อง|อธิบายเรื่อง|อยากรู้เรื่อง|อยากทราบเรื่อง|เล่าเรื่อง|มีกี่(?:จังหวัด|เขต|สายพันธุ์|ประเทศ|แห่ง))/i.test(raw);

  if (!isFeedbackOrCorrection && !isAdvisoryOrCreative && (isKnowledgePattern || (norm.isKnowledgeIntent && !norm.isYesNoOrPractical) || (focusEntity && /(?:แล้ว)?มัน/i.test(raw)))) {
    const topic = norm.canonicalTopic || extractTopic(raw, focusEntity) || raw;
    if (topic && topic.length >= 2) {
      return {
        intent: 'tool',
        toolCall: { name: 'search_wikipedia', params: { topic } },
        confidence: 'high',
        reason: norm.isBareNoun ? 'bare_noun_knowledge' : 'knowledge_lookup'
      };
    }
  }

  // 18. Adaptive RAG Fallthrough: General QA, common sense, advice, coding, and chat go directly to LLM
  return {
    intent: 'finish',
    toolCall: null,
    confidence: 'high',
    reason: 'default_chat'
  };
}
