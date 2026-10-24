// Answer Composer (Deep Module)
// Composes natural Thai answers from tool execution results.
// Uses deterministic templates for structured tools (0 LLM tokens),
// and clean extractive context for unstructured tools (search_web, wikipedia)
// to eliminate source label echoing ("[แหล่งข้อมูล 1: ...]") and English structural awkwardness.

import { isFalselyPositiveAnswer } from './safety.js';

export const SYSTEM_ASSISTANT_PROMPT = `คุณคือ Max ผู้ช่วย AI ที่ฉลาด รอบคอบ และเป็นกันเอง ทำงานบน Raspberry Pi
แนวทางการตอบ:
- ตอบเป็นภาษาไทยธรรมชาติที่เข้าใจง่าย อธิบายให้ครบถ้วนสมบูรณ์และจบประโยคอย่างชัดเจน
- ตอบตรงประเด็นจากข้อมูลที่ให้ ห้ามแต่งเรื่อง ห้ามคาดเดาข้อมูลสดหรือวันที่เอง
- ห้ามใส่คำว่า "แหล่งข้อมูล", "แหล่งที่มา", หรือ "[แหล่งที่ ...]"
- หากไม่มีข้อมูล ให้ตอบอย่างสุภาพว่าไม่พบข้อมูล`;

/**
 * Strips robotic source headers, [แหล่งที่ 1: title], URLs, and bracket markers from text.
 */
export function cleanExtractiveText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\[\s*แหล่งที่\s*\d+[^\]]*\]/gi, '')
    .replace(/\[\s*แหล่งข้อมูล\s*\d+[^\]]*\]/gi, '')
    .replace(/แหล่งข้อมูล\s*(?:ที่)?\s*\d+[:\s]*/gi, '')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/^\s*[-*•]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Deterministically composes answers for structured data tools without calling the LLM.
 * Saves 100% of tokens and eliminates hallucination.
 *
 * @param {string} toolName
 * @param {any} result
 * @returns {string|null} Answer text or null if not a structured tool
 */
export function composeStructuredAnswer(toolName, result) {
  if (!result || typeof result !== 'object') return null;

  switch (toolName) {
    case 'get_weather': {
      if (result.temperatureC !== undefined) {
        const loc = result.location ? `ที่ ${result.location}` : '';
        const cond = result.condition ? ` สภาพอากาศ ${result.condition}` : '';
        return `สภาพอากาศ${loc} อุณหภูมิ ${result.temperatureC}°C ความชื้น ${result.humidityPercent}%${cond} ครับ`;
      }
      return null;
    }

    case 'get_fx': {
      if (result.converted !== undefined) {
        return `${result.amount} ${result.base} เท่ากับประมาณ ${result.converted} ${result.target} (อัตราแลกเปลี่ยน 1 ${result.base} = ${result.rate} ${result.target}) ครับ`;
      }
      return null;
    }

    case 'get_current_time': {
      if (result.time || result.formatted || result.iso) {
        const timeStr = result.time || result.formatted || result.iso;
        const tzStr = result.timezone ? ` (เขตเวลา ${result.timezone})` : '';
        return `เวลาปัจจุบันคือ ${timeStr}${tzStr} ครับ`;
      }
      return null;
    }

    case 'get_system_info': {
      const cpu = result.cpuPercent ?? result.cpuUsage ?? 0;
      const ram = result.ramPercent ?? result.memoryUsagePercent ?? result.memoryUsage ?? 0;
      const used = result.usedMemoryMB ? ` (${result.usedMemoryMB} / ${result.totalMemoryMB} MB)` : '';
      const temp = result.tempC !== null && result.tempC !== undefined ? `, อุณหภูมิ ${result.tempC}°C` : '';
      return `สถานะระบบ: CPU ใช้งาน ${cpu}%, แรมใช้งาน ${ram}%${used}${temp} ครับ`;
    }

    case 'calculate': {
      if (result.result !== undefined || result.value !== undefined) {
        const val = result.result ?? result.value;
        const expr = result.expression ? `${result.expression} = ` : '';
        return `ผลลัพธ์คือ ${expr}${val} ครับ`;
      }
      return null;
    }

    case 'get_news': {
      if (Array.isArray(result.items) && result.items.length > 0) {
        const top = result.items.slice(0, 3).map((item) => {
          const title = typeof item === 'object' ? item.title : item;
          return `- ${title}`;
        }).join('\n');
        const src = result.source ? ` (${result.source})` : '';
        return `พาดหัวข่าวล่าสุด${src}:\n${top}`;
      }
      return null;
    }

    case 'search_github': {
      if (Array.isArray(result.repos) && result.repos.length > 0) {
        const top = result.repos.slice(0, 3).map((r) => {
          const desc = r.description ? ` - ${r.description}` : '';
          return `- ${r.name || r.full_name}${desc}`;
        }).join('\n');
        return `พบคลังข้อมูลบน GitHub ดังนี้ครับ:\n${top}`;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Prepares clean factual context for unstructured retrieval tools (wiki, web).
 * Strips bracketed source labels and headers to prevent model echoing.
 */
export function formatCleanContext(toolName, result) {
  if (!result || typeof result !== 'object') return '';

  if (toolName === 'search_wikipedia' && result.found && result.summary) {
    const cleanSummary = cleanExtractiveText(result.summary);
    return `หัวข้อ: ${result.title || ''}\nเนื้อหา: ${cleanSummary}`;
  }

  if (toolName === 'search_web' && result.found && result.summary) {
    let cleanSummary = cleanExtractiveText(result.summary);
    cleanSummary = cleanSummary
      .replace(/\d{1,2}\s+(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+\d{4}/g, '')
      .replace(/(?:Bright TV|ไทยรัฐ|เดลินิวส์|มติชน|sanook|kapook)\s*(?:News|ออนไลน์)?/gi, '')
      .replace(/\.{3,}/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return `ข้อมูลที่พบ:\n${cleanSummary}`;
  }

  return '';
}

/**
 * Sanitizes and polishes model generated answers.
 * Removes echoed queries, leaked source markers, and enforces polarity safety.
 */
export function polishAnswerText(text, userMessage = '', referenceText = '', { doneReason = 'stop' } = {}) {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();

  // 1. Remove leaked source markers e.g. "แหล่งข้อมูล 1", "[แหล่งที่ 1]", "1. "
  cleaned = cleaned
    .replace(/\[\s*แหล่ง(?:ข้อมูล|ที่)\s*(?:ที่)?\s*\d+[^\]]*\]:?/gi, '')
    .replace(/(?:^|\n|\s)แหล่ง(?:ข้อมูล|ที่)\s*(?:ที่)?\s*\d+[:\s]*/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 2. Question verbatim echo guard
  if (userMessage && cleaned.toLowerCase() === userMessage.trim().toLowerCase()) {
    return cleanExtractiveText(referenceText) || cleaned;
  }

  // 3. Polarity & Warning Guard (safety.js)
  if (referenceText && isFalselyPositiveAnswer(cleaned, referenceText)) {
    if (/\[แหล่ง/i.test(referenceText) || /Bright TV|News|https?:/i.test(referenceText)) {
      return 'จากข้อมูลอ้างอิงระบุว่าสิ่งนี้อาจเป็นอันตราย มีพิษ หรือมีข้อห้ามตามกฎหมาย จึงไม่ควรรับประทานหรือกระทำครับ';
    }
    return cleanExtractiveText(referenceText);
  }

  // 4. Consecutive repeated sentence and paragraph deduplication
  const paragraphs = cleaned.split(/\n+/);
  const processedParagraphs = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    let dedupedPara = trimmedPara;
    const clauseMatch = dedupedPara.match(/(.{8,}?)\s+\1(?:\s+|$)/);
    if (clauseMatch && clauseMatch[1]) {
      dedupedPara = dedupedPara.replace(clauseMatch[0], clauseMatch[1] + (clauseMatch[0].endsWith(' ') ? ' ' : ''));
    }

    if (processedParagraphs.length === 0 || dedupedPara !== processedParagraphs[processedParagraphs.length - 1]) {
      processedParagraphs.push(dedupedPara);
    }
  }

  cleaned = processedParagraphs.join('\n\n').trim();

  // 5. Trim dangling incomplete sentence if clipped mid-word/mid-sentence after punctuation
  const THAI_SENTENCE_ENDINGS = /(?:ครับ|ค่ะ|จ้า|นะ|ครับผม|นะคะ|เลยครับ|เช่นกันครับ|นั่นเอง|เป็นต้น|อย่างยิ่ง|โดยสิ้นเชิง|[.!?।ฯ\n]|[a-zA-Z0-9)\]])$/;
  const THAI_ABBR_REGEX = /(?:พ\.ศ\.|ค\.ศ\.|ดร\.|พ\.ร\.บ\.|จ\.|อ\.|ต\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.)$/;
  const INCOMPLETE_TAIL_REGEX = /(?:[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]|เรื่|ด้า|อย่|ซึ่|เพื่|แล้|เป็|มี|และ|หรือ|ว่า|ที่|แต่|คือ|เช่น|กับ|โดย|ใน)$/;

  const isDangling = doneReason === 'length' || INCOMPLETE_TAIL_REGEX.test(cleaned) || (cleaned.length > 50 && !THAI_SENTENCE_ENDINGS.test(cleaned));

  if (isDangling) {
    const lastPunct = Math.max(
      cleaned.lastIndexOf('. '),
      cleaned.lastIndexOf('.\n'),
      cleaned.lastIndexOf('! '),
      cleaned.lastIndexOf('? ')
    );
    if (lastPunct > 0 && lastPunct >= cleaned.length * 0.4) {
      const candidate = cleaned.slice(0, lastPunct + 1).trim();
      if (!THAI_ABBR_REGEX.test(candidate)) {
        cleaned = candidate;
      }
    }
  }

  return cleaned;
}


/**
 * Extractive Span Grounding:
 * Locks and verifies official proper nouns (e.g. office-holder names)
 * directly against authoritative reference text (Wikipedia) to prevent
 * small models (1.5B) from corrupting complex Thai surnames during generation.
 */
export function verifyAndGroundAnswer(answerText, userMessage = '', referenceText = '') {
  if (typeof answerText !== 'string' || !answerText.trim() || !referenceText) {
    return answerText;
  }

  let grounded = answerText;

  // 1. Office-holder extraction: e.g. "ผู้ดำรงตำแหน่งคนปัจจุบันคือ อนุทิน ชาญวีรกูล"
  const officeMatch = referenceText.match(/ผู้ดำรงตำแหน่งคนปัจจุบันคือ\s+([ก-๙a-zA-Z]+(?:\s+[ก-๙a-zA-Z]+)?)/);
  if (officeMatch && officeMatch[1]) {
    const officialName = officeMatch[1].trim();
    const parts = officialName.split(/\s+/);
    const firstName = parts[0];
    if (firstName && grounded.includes(firstName)) {
      const corruptedRegex = new RegExp(`(?:นาย)?${firstName}\\s+[ก-๙a-zA-Z]+`, 'g');
      grounded = grounded.replace(corruptedRegex, (match) => {
        const hasTitle = match.startsWith('นาย');
        return hasTitle ? `นาย${officialName}` : officialName;
      });
    }
  }

  return grounded;
}
