// Conversational Query Resolver (Deep Module)
// Resolves follow-up queries, pronouns, and omitted subjects deterministically
// using session focusEntity and lastUserQuery.
// Designed for Raspberry Pi 5: 0 LLM calls, deterministic rewriting.

import { normalizeColloquialThai } from './normalizer.js';

const PRONOUN_REGEX = /(?:^|\s)(มัน|เขา|เธอ|เจ้านี่|ตัวนี้|อันนี้|อันนั้น|ที่นั่น)(?:\s|$)/;
const FOLLOWUP_FRAME_REGEX = /^แล้ว(?:ถ้าเป็น|ถ้า)?\s*(.+?)\s*(?:ล่ะ|ละ|ป่าว|มั้ย|ไหม)?$/;

/**
 * Strips Thai conversational particles from the end of a string.
 */
function cleanParticles(str) {
  return str.replace(/(?:\s+|[.,?!ฯ]|จ้ะ|ครับ|ค่ะ|นะ|จ้า|จ๋า|คับ)+$/g, '').trim();
}

/**
 * Resolves a follow-up user query into a standalone, complete query.
 *
 * @param {Object} params
 * @param {string} params.message - Current user query
 * @param {string|null} [params.focusEntity] - Active topic or entity from conversation
 * @param {string|null} [params.lastUserQuery] - Previous user query
 * @param {string|null} [params.lastTool] - Tool used in the previous turn
 * @returns {{ resolvedQuery: string, isFollowup: boolean, confidence: number, targetEntity: string|null }}
 */
export function resolveFollowupQuery({ message, focusEntity = null, lastUserQuery = null, lastTool = null } = {}) {
  if (!message || typeof message !== 'string') {
    return { resolvedQuery: '', isFollowup: false, confidence: 1.0, targetEntity: null };
  }

  const trimmed = message.trim();
  const normalized = normalizeColloquialThai(trimmed);

  // If no prior context exists, nothing to resolve
  if (!focusEntity && !lastUserQuery) {
    return { resolvedQuery: trimmed, isFollowup: false, confidence: 1.0, targetEntity: null };
  }

  const effectiveFocus = (typeof focusEntity === 'string' && focusEntity.trim()) ? focusEntity.trim() : null;
  const cleanLastQuery = (typeof lastUserQuery === 'string' && lastUserQuery.trim()) ? lastUserQuery.trim() : null;

  // 1. Follow-up pattern: "แล้วสภาพอากาศที่นั่นล่ะ" / "แล้วอากาศล่ะ"
  if (/^แล้ว\s*(?:สภาพอากาศ|อากาศ)(?:ที่นั่น|ที่นี่)?\s*(?:ล่ะ|ละ|เป็นไง|เป็นอย่างไร)?$/i.test(trimmed)) {
    if (effectiveFocus) {
      return {
        resolvedQuery: `สภาพอากาศ ${effectiveFocus}`,
        isFollowup: true,
        confidence: 0.95,
        targetEntity: effectiveFocus
      };
    }
  }

  // 2. Follow-up pattern: Currency "แล้ว 100 ยูโรล่ะ" / "แล้ว 50 usd ล่ะ"
  const fxMatch = trimmed.match(/^แล้ว\s*(\d+(?:\.\d+)?\s*(?:ยูโร|ดอลลาร์|เยน|ปอนด์|บาท|usd|eur|jpy|thb|gbp))\s*(?:ล่ะ|ละ)?$/i);
  if (fxMatch) {
    const amountCurrency = fxMatch[1].trim();
    // Inherit target currency from last query (defaulting to บาท)
    let targetCurrency = 'บาท';
    if (cleanLastQuery && /เป็น\s*(กี่\s*(?:บาท|ยูโร|ดอลลาร์|เยน))/.test(cleanLastQuery)) {
      const targetMatch = cleanLastQuery.match(/เป็น\s*(?:กี่\s*)?([^\s?]+)/);
      if (targetMatch) targetCurrency = targetMatch[1].replace(/กี่/, '');
    }
    return {
      resolvedQuery: `${amountCurrency} เป็นกี่${targetCurrency}`,
      isFollowup: true,
      confidence: 0.95,
      targetEntity: amountCurrency
    };
  }

  // 3. Follow-up pattern: Commodity prices "แล้วราคาน้ำมันล่ะ" / "แล้วทองล่ะ"
  const commodityMatch = trimmed.match(/^แล้ว\s*(?:ราคา)?(น้ำมัน|ทอง|ทองคำ|บิตคอยน์|bitcoin|btc|หุ้น)\s*(?:ล่ะ|ละ)?$/i);
  if (commodityMatch) {
    const item = commodityMatch[1].trim();
    return {
      resolvedQuery: `ราคา${item}วันนี้เท่าไหร่`,
      isFollowup: true,
      confidence: 0.95,
      targetEntity: item
    };
  }

  // 4. Follow-up pattern: Programming / coding "แล้วถ้าเป็น while loop ล่ะ" / "แล้ว while loop ล่ะ"
  const codeMatch = trimmed.match(/^แล้ว(?:ถ้าเป็น)?\s*(while\s*loop|for\s*loop|function|class|array|list|async|dict|loop)\s*(?:ล่ะ|ละ)?$/i);
  if (codeMatch) {
    const construct = codeMatch[1].trim();
    const lang = effectiveFocus || (cleanLastQuery && /(?:ใน|ภาษา)\s*([a-zA-Z0-9+#]+)/i.exec(cleanLastQuery)?.[1]) || 'python';
    return {
      resolvedQuery: `เขียน ${construct} ใน ${lang} ยังไง`,
      isFollowup: true,
      confidence: 0.95,
      targetEntity: lang
    };
  }

  // 5. Follow-up pattern: Entity substitution "แล้วหมาล่ะ" / "แล้วแมวล่ะ"
  // When last query asked something about subject A, e.g. "แมวกินช็อกโกแลตได้ไหม",
  // and user says "แล้วหมาล่ะ", substitute old subject with new subject.
  const entitySubMatch = trimmed.match(/^แล้ว\s*([^ล่ะละ?]+?)\s*(?:ล่ะ|ละ|ป่าว|มั้ย|ไหม)?$/);
  if (entitySubMatch) {
    const newSubject = cleanParticles(entitySubMatch[1]);
    // Ignore if newSubject is too long or contains verbs
    if (newSubject && newSubject.length <= 25 && !/(?:ทำไม|อย่างไร|กี่|เมื่อไหร่|ที่ไหน)/.test(newSubject)) {
      if (cleanLastQuery) {
        // Find subject in last query to replace
        let replaced = null;
        if (effectiveFocus) {
          // If effectiveFocus is "แมว ช็อกโกแลต", the first token "แมว" is often the subject
          const focusTokens = effectiveFocus.split(/\s+/);
          for (const token of focusTokens) {
            if (cleanLastQuery.includes(token)) {
              replaced = cleanLastQuery.replace(token, newSubject);
              break;
            }
          }
        }
        if (!replaced) {
          // If last query started with a subject e.g. "แมวกิน..."
          const matchPrefix = cleanLastQuery.match(/^([^\sกินใช้มีคือ]{2,15})(.*)$/);
          if (matchPrefix && matchPrefix[1]) {
            replaced = `${newSubject}${matchPrefix[2]}`;
          }
        }

        if (replaced && replaced !== cleanLastQuery) {
          return {
            resolvedQuery: cleanParticles(replaced),
            isFollowup: true,
            confidence: 0.90,
            targetEntity: newSubject
          };
        }
      }
    }
  }

  // 6. Pronoun resolution: "แล้วมันราคาเท่าไหร่", "มันราคาเท่าไหร่", "เขาเกิดปีอะไร"
  const thaiPronounRegex = /(?:^|\s|แล้ว\s*)(มัน|เขา|เธอ|เจ้านี่|ตัวนี้|อันนี้|อันนั้น|ที่นั่น)/;
  if (thaiPronounRegex.test(trimmed)) {
    if (effectiveFocus) {
      let replaced = trimmed.replace(thaiPronounRegex, () => {
        return `${effectiveFocus} `;
      }).trim();
      replaced = replaced.replace(/\s+/g, ' ');
      return {
        resolvedQuery: cleanParticles(replaced),
        isFollowup: true,
        confidence: 0.88,
        targetEntity: effectiveFocus
      };
    }
  }

  // 7. Omitted subject follow-up with predicate:
  // e.g. "แล้วถ้าเผลอกินเข้าไปต้องทำยังไง" or "แล้วถ้าไม่หายล่ะ" or "แล้วไปช่วงเดือนไหนดีสุด"
  if (/^แล้ว(?:ถ้า)?/.test(trimmed)) {
    if (effectiveFocus) {
      // Check specific predicate types
      if (/เผลอกิน|กินเข้าไป/.test(trimmed)) {
        return {
          resolvedQuery: `ถ้าเผลอกิน ${effectiveFocus} เข้าไปต้องทำยังไง`,
          isFollowup: true,
          confidence: 0.85,
          targetEntity: effectiveFocus
        };
      }
      if (/ไม่หาย/.test(trimmed)) {
        return {
          resolvedQuery: `${effectiveFocus} ถ้าไม่หายทำยังไง`,
          isFollowup: true,
          confidence: 0.85,
          targetEntity: effectiveFocus
        };
      }
      if (/ไปช่วงเดือนไหน|เที่ยวช่วงไหน|ไปตอนไหน/.test(trimmed)) {
        return {
          resolvedQuery: `เที่ยว ${effectiveFocus} ไปช่วงเดือนไหนดีสุด`,
          isFollowup: true,
          confidence: 0.85,
          targetEntity: effectiveFocus
        };
      }

      // Generic prepend of effective focus if not already in query
      if (!trimmed.includes(effectiveFocus)) {
        const withoutLaew = trimmed.replace(/^แล้ว\s*/, '');
        return {
          resolvedQuery: `${effectiveFocus} ${withoutLaew}`,
          isFollowup: true,
          confidence: 0.80,
          targetEntity: effectiveFocus
        };
      }
    }
  }

  return {
    resolvedQuery: trimmed,
    isFollowup: false,
    confidence: 1.0,
    targetEntity: null
  };
}
