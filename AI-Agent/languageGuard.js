// Deep Module: Universal Multilingual Guard & Zero-CJK-Leakage Engine
// Governs dominant language detection, CJK logit-drift inspection,
// post-generation deterministic scrubbing, and language-specific system directives.

const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/g;
const CJK_CHAR_REGEX = /[\u4E00-\u9FFF]/g;
const JAPANESE_KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/g;
const KOREAN_HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF]/g;
const LATIN_CHAR_REGEX = /[a-zA-Z]/g;

export function detectDominantLanguage(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { language: 'th', confidence: 1.0 };
  }

  const thaiMatches = text.match(THAI_CHAR_REGEX) || [];
  const cjkMatches = text.match(CJK_CHAR_REGEX) || [];
  const kanaMatches = text.match(JAPANESE_KANA_REGEX) || [];
  const hangulMatches = text.match(KOREAN_HANGUL_REGEX) || [];
  const latinMatches = text.match(LATIN_CHAR_REGEX) || [];

  const thaiCount = thaiMatches.length;
  const cjkCount = cjkMatches.length;
  const kanaCount = kanaMatches.length;
  const hangulCount = hangulMatches.length;
  const latinCount = latinMatches.length;

  const totalLetters = thaiCount + cjkCount + kanaCount + hangulCount + latinCount;
  if (totalLetters === 0) {
    return { language: 'th', confidence: 0.5 };
  }

  // Japanese check: contains Hiragana or Katakana (which distinguishes it from pure Chinese Han)
  if (kanaCount > 0) {
    return { language: 'ja', confidence: Number(((kanaCount + cjkCount) / totalLetters).toFixed(2)) };
  }

  // Korean check: contains Hangul
  if (hangulCount > 0) {
    return { language: 'ko', confidence: Number((hangulCount / totalLetters).toFixed(2)) };
  }

  // Thai check: even if mixed with English technical terms (e.g., Linux, RAM, Raspberry Pi)
  if (thaiCount > 0) {
    const thaiRatio = thaiCount / totalLetters;
    if (thaiCount >= 3 || thaiRatio >= 0.20 || thaiCount >= latinCount * 0.25) {
      return { language: 'th', confidence: Number(Math.max(thaiRatio, 0.85).toFixed(2)) };
    }
  }

  // Chinese check: CJK characters dominate and no Kana
  if (cjkCount > 0 && cjkCount > latinCount) {
    return { language: 'zh', confidence: Number((cjkCount / totalLetters).toFixed(2)) };
  }

  // English / Latin default
  if (latinCount > 0) {
    return { language: 'en', confidence: Number((latinCount / totalLetters).toFixed(2)) };
  }

  return { language: 'th', confidence: 0.5 };
}

export function inspectCJKLeakage(text, { dominantLanguage = 'th' } = {}) {
  if (typeof text !== 'string' || dominantLanguage === 'zh') {
    return { hasLeak: false, cjkCount: 0, cjkChars: [] };
  }

  const cjkMatches = text.match(CJK_CHAR_REGEX) || [];
  return {
    hasLeak: cjkMatches.length > 0,
    cjkCount: cjkMatches.length,
    cjkChars: cjkMatches
  };
}

export function cleanCJKLeakage(text, { dominantLanguage = 'th' } = {}) {
  if (typeof text !== 'string' || dominantLanguage === 'zh') {
    return text;
  }

  // Scrub stray CJK characters and stray Chinese punctuation marks
  const cleaned = text
    .replace(/[\u4E00-\u9FFF]/g, '')
    .replace(/[，。！？【】《》（）]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ \n/g, '\n')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

export function buildLanguageDirectives({ dominantLanguage = 'th', contextLanguage = null } = {}) {
  const targetLang = contextLanguage || dominantLanguage;

  if (targetLang === 'th') {
    return [
      'ภาษาเป้าหมาย: ตอบกลับเป็นภาษาไทยอย่างเป็นธรรมชาติและสละสลวย',
      'กฎเหล็กห้ามอักษรจีน: ห้ามมีตัวอักษรจีน (CJK \\u4E00-\\u9FFF) ปะปนในคำตอบโดยเด็ดขาด',
      'ศัพท์เทคนิค: สามารถใช้คำศัพท์เทคนิคภาษาอังกฤษทั่วไป (เช่น Linux, RAM, CPU, Cache, Kernel, API) ได้ตามปกติ'
    ].join('\n');
  }

  if (targetLang === 'en') {
    return [
      'Target Language: Respond in clear, natural English.',
      'Strict Constraint: Do not output any Chinese characters (CJK \\u4E00-\\u9FFF).',
      'Terminology: Use standard technical nomenclature.'
    ].join('\n');
  }

  if (targetLang === 'ja') {
    return 'Target Language: Respond naturally in Japanese.';
  }

  if (targetLang === 'ko') {
    return 'Target Language: Respond naturally in Korean.';
  }

  if (targetLang === 'zh') {
    return 'Target Language: Respond naturally in Chinese.';
  }

  return 'ภาษาเป้าหมาย: ตอบกลับเป็นภาษาไทยอย่างเป็นธรรมชาติ ห้ามใช้อักษรจีนโดยเด็ดขาด';
}
