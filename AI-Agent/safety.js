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
