// Telemetry Engine (Deep Module)
// Computes real-time token estimation, tracks session-scoped context limits,
// and constructs standard usage telemetry payloads.
// Designed for Raspberry Pi 5 with zero MicroSD writes (in-memory only).

export const DEFAULT_MAX_CONTEXT_TOKENS = Number(process.env.OLLAMA_NUM_CTX) || 4096;

/**
 * Estimates token count for mixed Thai and English text.
 * Thai script typically tokenizes to ~1.5-2.5 tokens per 3-4 character word (~0.65 tokens per char).
 * Latin and whitespace typically tokenize to ~1 token per 3.8 characters.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || !text) return 0;

  let thaiChars = 0;
  let otherChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x0e00 && code <= 0x0e7f) {
      thaiChars++;
    } else {
      otherChars++;
    }
  }

  const thaiTokens = thaiChars * 0.65;
  const otherTokens = otherChars / 3.8;

  return Math.max(1, Math.ceil(thaiTokens + otherTokens));
}

/**
 * Estimates prompt token count for an array of ChatML/Chat messages.
 * Adds 4 tokens of formatting overhead per message.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  let total = 0;
  for (const m of messages) {
    if (!m) continue;
    const content = typeof m.content === 'string' ? m.content : '';
    total += estimateTokens(content) + 4;
  }

  return total + 2; // Priming tokens
}

/**
 * Builds standard usage telemetry payload.
 *
 * @param {Object} options
 * @returns {Object}
 */
export function buildUsagePayload({
  model = 'qwen2.5:1.5b',
  modelLabel = 'Qwen2.5 1.5B (Lite Mode)',
  mode = 'lite',
  promptTokens = 0,
  completionTokens = 0,
  durationMs = 0,
  isDeterministic = false,
  sessionStats = {},
  contextWindowStats = {}
} = {}) {
  const maxTokens = contextWindowStats.maxTokens || DEFAULT_MAX_CONTEXT_TOKENS;
  const promptTok = Number(promptTokens) || 0;
  const completionTok = Number(completionTokens) || 0;
  const totalTurnTok = promptTok + completionTok;

  const usedTokens = isDeterministic
    ? (Number(contextWindowStats.usedTokens) || totalTurnTok)
    : Math.max(totalTurnTok, Number(contextWindowStats.usedTokens) || totalTurnTok);

  const usagePercent = maxTokens > 0
    ? Math.min(100, Math.round(((usedTokens / maxTokens) * 100) * 10) / 10)
    : 0;

  const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
  const tokensPerSec = (!isDeterministic && durationSec > 0 && completionTok > 0)
    ? Math.round((completionTok / durationSec) * 10) / 10
    : 0;

  return {
    model,
    modelLabel,
    mode,
    contextWindow: {
      usedTokens,
      maxTokens,
      usagePercent,
      historyTurnsUsed: contextWindowStats.historyTurnsUsed ?? 0,
      maxHistoryTurns: contextWindowStats.maxHistoryTurns ?? 30,
      contextCharsUsed: contextWindowStats.contextCharsUsed ?? 0,
      maxContextChars: contextWindowStats.maxContextChars ?? 3200,
      focusEntity: contextWindowStats.focusEntity || null
    },
    lastTurn: {
      promptTokens: promptTok,
      completionTokens: completionTok,
      totalTokens: totalTurnTok,
      durationMs,
      tokensPerSec,
      isDeterministic: Boolean(isDeterministic)
    },
    sessionTotal: {
      promptTokens: Number(sessionStats.promptTokens) || promptTok,
      completionTokens: Number(sessionStats.completionTokens) || completionTok,
      totalTokens: Number(sessionStats.totalTokens) || totalTurnTok,
      llmCalls: Number(sessionStats.llmCalls) || (isDeterministic ? 0 : 1),
      deterministicTurns: Number(sessionStats.deterministicTurns) || (isDeterministic ? 1 : 0),
      totalTurns: Number(sessionStats.totalTurns) || 1
    }
  };
}
