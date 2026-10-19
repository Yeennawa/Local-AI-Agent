// Answer Composer (Deep Module)
// Composes natural Thai answers from tool execution results.
// Uses deterministic templates for structured tools (0 LLM tokens),
// and clean extractive context for unstructured tools (search_web, wikipedia)
// to eliminate source label echoing ("[แหล่งข้อมูล 1: ...]") and English structural awkwardness.

import { isFalselyPositiveAnswer } from './safety.js';

export const SYSTEM_ASSISTANT_PROMPT = `คุณคือ Max ผู้ช่วย AI สั้น กระชับ และเป็นกันเอง ทำงานบน Raspberry Pi
แนวทางการตอบ:
- ตอบเป็นภาษาไทยธรรมชาติ ความยาว 1-3 ประโยค
- ตอบตรงประเด็นจากข้อมูลที่ให้ ห้ามแต่งเรื่อง ห้ามคาดเดาข้อมูลสดหรือวันที่เอง
- ห้ามใส่คำว่า "แหล่งข้อมูล", "แหล่งที่มา", หรือใส่เลขข้อ 1. 2. 3.
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
      const ram = result.ramPercent ?? result.memoryUsage ?? 0;
      const temp = result.tempC !== undefined ? `, อุณหภูมิ ${result.tempC}°C` : '';
      return `สถานะระบบ: CPU ใช้งาน ${cpu}%, แรมใช้งาน ${ram}%${temp} ครับ`;
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
    const cleanSummary = cleanExtractiveText(result.summary);
    return `ข้อมูลที่พบ:\n${cleanSummary}`;
  }

  return '';
}

/**
 * Sanitizes and polishes model generated answers.
 * Removes echoed queries, leaked source markers, and enforces polarity safety.
 */
export function polishAnswerText(text, userMessage = '', referenceText = '') {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();

  // 1. Remove leaked source markers e.g. "แหล่งข้อมูล 1", "[แหล่งที่ 1]", "1. "
  cleaned = cleaned
    .replace(/\[\s*แหล่ง(?:ข้อมูล|ที่)\s*(?:ที่)?\s*\d+[^\]]*\]:?/gi, '')
    .replace(/(?:^|\n|\s)แหล่ง(?:ข้อมูล|ที่)\s*(?:ที่)?\s*\d+[:\s]*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 2. Question verbatim echo guard
  if (userMessage && cleaned.toLowerCase() === userMessage.trim().toLowerCase()) {
    return cleanExtractiveText(referenceText) || cleaned;
  }

  // 3. Polarity & Warning Guard (safety.js)
  if (referenceText && isFalselyPositiveAnswer(cleaned, referenceText)) {
    return cleanExtractiveText(referenceText);
  }

  // 4. Consecutive repeated sentence deduplication
  const rawParts = cleaned.split(/(?<=[.!?\n])\s+|\s+/);
  const deduped = [];
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i].trim();
    if (!part) continue;
    if (i === 0 || part !== rawParts[i - 1].trim()) {
      deduped.push(part);
    }
  }
  cleaned = deduped.join(' ');

  // 5. Trim dangling incomplete sentence if clipped at token boundary
  if (cleaned.length > 50 && !/[.!?।ฯ\n]$/.test(cleaned)) {
    const lastPunct = Math.max(
      cleaned.lastIndexOf('. '),
      cleaned.lastIndexOf('.\n'),
      cleaned.lastIndexOf('! '),
      cleaned.lastIndexOf('? '),
      cleaned.lastIndexOf('\n')
    );
    if (lastPunct > 0 && lastPunct >= cleaned.length * 0.5) {
      cleaned = cleaned.slice(0, lastPunct + 1).trim();
    }
  }

  return cleaned.trim();
}
