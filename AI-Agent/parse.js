const FEELINGS = ['happy', 'neutral', 'surprised', 'confused', 'proud'];
const HISTORY_LIMIT = 4;
const HISTORY_CHARS = 500;

function tryParseObject(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// first balanced {...} block, skipping braces that sit inside strings
function firstObjectBlock(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function extractJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();

  const direct = tryParseObject(body);
  if (direct) return direct;

  const block = firstObjectBlock(body);
  return block ? tryParseObject(block) : null;
}

// Extracts readable text from truncated or unclosed JSON strings produced by token limits
export function extractIncompleteText(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';

  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)(?:```)?$/i);
  const target = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Pattern matching: {"text": "..." or {"text":"..." that was cut off mid-string
  const textKeyMatch = target.match(/["']?text["']?\s*:\s*["']((?:[^"\\]|\\.)*)$/);
  if (textKeyMatch) {
    try {
      return JSON.parse(`"${textKeyMatch[1]}"`);
    } catch {
      return textKeyMatch[1];
    }
  }

  // If plain text (not starting with { or [)
  if (!target.startsWith('{') && !target.startsWith('[')) {
    return target;
  }

  return target;
}

export function normalizeFeeling(value, fallback) {
  return FEELINGS.includes(value) ? value : fallback;
}

export function sanitizeHistory(history, limit = HISTORY_LIMIT, maxChars = HISTORY_CHARS) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (m) =>
        m &&
        (m.role === 'user' ||
          m.role === 'assistant' ||
          (m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('[สรุปหัวข้อ'))) &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}
