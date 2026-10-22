import { queryOllama } from './ollamaClient.js';
import { toolRegistry, getToolLabel } from './tools/registry.js';
import { extractJson, extractIncompleteText, normalizeFeeling, sanitizeHistory } from './parse.js';
import { routeIntent, extractTopic } from './router.js';
import { sessionMemory } from './memory.js';
import { buildDirectReply } from './replies.js';
import { getThaiJoke, explainSlangOrMeme } from './culture.js';
import { resolveFollowupQuery } from './resolver.js';
import {
  composeStructuredAnswer,
  formatCleanContext,
  polishAnswerText,
  verifyAndGroundAnswer,
  SYSTEM_ASSISTANT_PROMPT
} from './answer.js';
import { getSafetyKnowledgeHint } from './safety.js';
import { applyToolModePolicy, normalizeToolMode } from './toolMode.js';
import {
  estimateTokens,
  estimateMessagesTokens,
  buildUsagePayload,
  DEFAULT_MAX_CONTEXT_TOKENS
} from './telemetry.js';

const MAX_PLAIN_REPLY_CHARS = 2400;
const ANSWER_TOKENS_LITE = 600;
const ANSWER_TOKENS_ADVANCED = 768;

function clip(text, max) {
  if (!text || text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  return lastBreak > max * 0.7 ? `${slice.slice(0, lastBreak).trim()}...` : `${slice.trim()}...`;
}

/**
 * Backward-compatible export for tests and external callers.
 * Delegates to polishAnswerText in answer.js.
 */
export function sanitizeAnswerText(text, userMessage = '', defaultSummary = '') {
  return polishAnswerText(text, userMessage, defaultSummary);
}

async function synthesizeAnswer({ model, chatFn, history, message, cleanContext, personaPrompt, onToken, onStatus }) {
  const activeLabel = /3b/i.test(model) ? 'Qwen2.5 3B (Advanced Mode)' : 'Qwen2.5 1.5B (Lite Mode)';
  let systemContent = `คุณคือ Max ผู้ช่วย AI บน Raspberry Pi (ขณะนี้ทำงานด้วยโมเดล ${activeLabel})\n${SYSTEM_ASSISTANT_PROMPT}`;
  if (personaPrompt) {
    systemContent = `${personaPrompt}\n\n${systemContent}`;
  }
  if (cleanContext) {
    systemContent = `${systemContent}\n\nข้อมูลอ้างอิง:\n${cleanContext}`;
  }

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: message }
  ];

  const estimatedPromptTokens = estimateMessagesTokens(messages);
  onStatus?.({
    status: 'synthesizing',
    estimatedPromptTokens,
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS
  });

  const numPredict = /3b/i.test(model) ? ANSWER_TOKENS_ADVANCED : ANSWER_TOKENS_LITE;

  const res = await queryOllama({
    model,
    chatFn,
    messages,
    temperature: cleanContext ? 0.1 : 0.3,
    numCtx: Number(process.env.OLLAMA_NUM_CTX) || 4096,
    numPredict,
    returnDetails: true,
    onToken
  });

  const rawText = typeof res === 'string' ? res : (res?.text || '');
  const meta = typeof res === 'object' ? res?.meta : null;
  const doneReason = typeof res === 'object' ? res?.doneReason : 'stop';

  return { text: rawText, meta, doneReason, estimatedPromptTokens };
}

export async function runAgent({ message, conversationHistory = [], sessionId = null, options = {} }) {
  if (!message || typeof message !== 'string') {
    return {
      text: 'ข้อความไม่ถูกต้อง กรุณาระบุข้อความที่ต้องการถามครับ',
      status: 'error',
      feeling: 'confused',
      toolsUsed: [],
      error: 'Invalid message argument'
    };
  }

  const effectiveSessionId = sessionId || options.sessionId || null;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
  const onToken = typeof options.onToken === 'function' ? options.onToken : null;
  const toolMode = normalizeToolMode(options.toolMode);
  const model = options.model || process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const activeModelLabel = /3b/i.test(model) ? 'Qwen2.5 3B' : 'Qwen2.5 1.5B';
  const activeMode = /3b/i.test(model) ? 'advanced' : 'lite';
  const startTime = Date.now();

  const createUsage = ({ promptTokens = 0, completionTokens = 0, isDeterministic = false, durationMsOverride = null } = {}) => {
    const durationMs = durationMsOverride ?? (Date.now() - startTime);
    let sessionStats;
    let contextWindowStats;

    if (effectiveSessionId) {
      sessionStats = sessionMemory.recordUsage(effectiveSessionId, { promptTokens, completionTokens, isDeterministic });
      const summary = sessionMemory.getUsageSummary(effectiveSessionId, { maxTokens: DEFAULT_MAX_CONTEXT_TOKENS });
      contextWindowStats = summary.contextWindowStats;
    } else {
      sessionStats = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        llmCalls: isDeterministic ? 0 : 1,
        deterministicTurns: isDeterministic ? 1 : 0,
        totalTurns: 1
      };
      contextWindowStats = {
        maxTokens: DEFAULT_MAX_CONTEXT_TOKENS,
        historyTurnsUsed: 0,
        maxHistoryTurns: 10,
        contextCharsUsed: 0,
        maxContextChars: 2400,
        focusEntity: null
      };
    }

    return buildUsagePayload({
      model,
      modelLabel: activeModelLabel,
      mode: activeMode,
      promptTokens,
      completionTokens,
      durationMs,
      isDeterministic,
      sessionStats,
      contextWindowStats
    });
  };

  // 1. Zero-Token Lexical Meta-Recall (e.g. "คำถามแรกคืออะไร")
  if (effectiveSessionId) {
    const metaAnswer = sessionMemory.answerMetaRecall(effectiveSessionId, message);
    if (metaAnswer) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: metaAnswer,
        toolUsed: null,
        isMeta: true
      });
      onToken?.(metaAnswer);
      const usage = createUsage({ promptTokens: 0, completionTokens: 0, isDeterministic: true });
      return {
        text: metaAnswer,
        status: 'idle',
        feeling: 'happy',
        toolsUsed: [],
        notice: null,
        error: null,
        model,
        modelLabel: activeModelLabel,
        mode: activeMode,
        usage
      };
    }
  }

  // 2. Note Memory Ledger Recall (Instant recall of previously verified questions)
  // Skip recall for queries checking active model identity to avoid stale cached identity across mode switches
  const isIdentityCheck = /(?:โมเดล|model|qwen|1\.5b|3b|lite|advanced)/i.test(message);
  const cachedNote = !isIdentityCheck ? sessionMemory.noteLedger.recallNote(message, effectiveSessionId) : null;
  if (cachedNote && cachedNote.answer) {
    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: cachedNote.answer,
        toolUsed: cachedNote.sourceTool || null,
        focusEntity: cachedNote.topic || null
      });
    }
    onToken?.(cachedNote.answer);
    const usage = createUsage({ promptTokens: 0, completionTokens: 0, isDeterministic: true });
    return {
      text: cachedNote.answer,
      status: 'idle',
      feeling: 'happy',
      toolsUsed: cachedNote.sourceTool ? [{ tool: cachedNote.sourceTool, params: {}, result: { fromNote: true }, durationMs: 0 }] : [],
      notice: null,
      error: null,
      model,
      modelLabel: activeModelLabel,
      mode: activeMode,
      usage
    };
  }

  const toolsUsed = [];
  const chatFn = options.chatFn;

  // Single source of truth for conversation history:
  // Prefer sessionMemory when sessionId exists; fallback to conversationHistory argument
  const rawHistory = effectiveSessionId
    ? sessionMemory.getAssembledContext(effectiveSessionId)
    : (Array.isArray(conversationHistory) && conversationHistory.length > 0 ? conversationHistory : []);
  const history = sanitizeHistory(rawHistory, 10, 1200);

  const prevTurns = effectiveSessionId ? sessionMemory.getHistory(effectiveSessionId) : [];
  const lastTurn = prevTurns.filter((t) => !t.isMeta).at(-1);
  const focusEntity = options.focusEntity || (effectiveSessionId ? sessionMemory.getFocusEntity(effectiveSessionId) : null);

  // 3. Conversational Query Resolver
  const resolved = resolveFollowupQuery({
    message,
    focusEntity,
    lastUserQuery: lastTurn?.userQuery || null,
    lastTool: lastTurn?.toolUsed || null
  });
  const effectiveMessage = resolved.resolvedQuery || message;

  // Deterministic answers: record turn, stream text, zero model tokens
  const replyWithoutModel = (text, { feeling = 'neutral', focusEntity: focus } = {}) => {
    const activeNotice = toolsUsed.find((t) => t.result?.notice)?.result?.notice || null;
    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: text,
        toolUsed: toolsUsed[0]?.tool || null,
        focusEntity: focus || resolved.targetEntity || focusEntity
      });
    }
    onToken?.(text);
    const usage = createUsage({ promptTokens: 0, completionTokens: 0, isDeterministic: true });
    return {
      text,
      status: 'idle',
      feeling,
      toolsUsed,
      notice: activeNotice,
      error: null,
      model,
      modelLabel: activeModelLabel,
      mode: activeMode,
      usage
    };
  };

  try {
    const useRouter = options.useRouter !== undefined ? options.useRouter : true;
    const rawRoute = useRouter
      ? routeIntent({ message: effectiveMessage, history, focusEntity: resolved.targetEntity || focusEntity })
      : { intent: 'finish', confidence: 'high' };
    const route = applyToolModePolicy(rawRoute, { toolMode, message: effectiveMessage });

    let personaPrompt = null;
    let cleanContext = '';
    let referenceText = '';

    if (route) {
      if (route.intent === 'direct') {
        const text = buildDirectReply(route.reason, toolRegistry.getAllTools(), model, effectiveMessage);
        if (text) return replyWithoutModel(text, { feeling: 'happy' });
      }
      if (route.intent === 'joke') {
        const joke = getThaiJoke(effectiveSessionId || 'default');
        return replyWithoutModel(joke, { feeling: 'happy' });
      }
      if (route.intent === 'slang') {
        const expl = route.text || explainSlangOrMeme(effectiveMessage);
        if (expl) return replyWithoutModel(expl, { feeling: 'happy' });
      }
      if (route.intent === 'roleplay') {
        personaPrompt = route.prompt;
      }
      if (route.intent === 'tool' && route.toolCall) {
        const name = route.toolCall.name;
        if (toolRegistry.hasTool(name)) {
          const toolLabel = getToolLabel(name);
          onStatus?.({ status: 'using_tool', tool: name, params: route.toolCall.params, label: toolLabel });
          const execResult = await toolRegistry.executeTool(name, route.toolCall.params);
          toolsUsed.push(execResult);

          if (execResult.success && execResult.result?.notice) {
            onStatus?.({
              status: 'notice',
              code: execResult.result.notice.code,
              message: execResult.result.notice.message
            });
          }

          if (execResult.success && execResult.result?.found === false && execResult.result.message) {
            return replyWithoutModel(execResult.result.message);
          }

          // Structured tools answer deterministically without LLM (0 tokens)
          const structuredText = composeStructuredAnswer(name, execResult.result);
          if (structuredText) {
            return replyWithoutModel(structuredText, {
              feeling: 'happy',
              focusEntity: route.toolCall.params?.topic || route.toolCall.params?.query || null
            });
          }

          // Unstructured tools (search_wikipedia, search_web) prepare clean extractive context
          cleanContext = formatCleanContext(name, execResult.result);
          referenceText = execResult.result?.summary || '';
        }
      }
    }

    // 4. LLM Synthesis
    const safetyHint = getSafetyKnowledgeHint(effectiveMessage);
    if (safetyHint) {
      cleanContext = cleanContext ? `${cleanContext}\n\n${safetyHint}` : safetyHint;
    }

    const synthesized = await synthesizeAnswer({
      model,
      chatFn,
      history,
      message: effectiveMessage,
      cleanContext,
      personaPrompt,
      onToken
    });

    const raw = typeof synthesized === 'string' ? synthesized : (synthesized?.text || '');
    const meta = typeof synthesized === 'object' ? synthesized?.meta : null;

    const parsed = extractJson(raw);
    const candidateText = (typeof parsed?.text === 'string' && parsed.text.trim())
      ? parsed.text.trim()
      : extractIncompleteText(raw).trim();

    const polished = polishAnswerText(candidateText, effectiveMessage, referenceText);
    const grounded = verifyAndGroundAnswer(polished, effectiveMessage, referenceText);
    const finalText = grounded ? clip(grounded, MAX_PLAIN_REPLY_CHARS) : 'รับทราบครับ ดำเนินการเรียบร้อยแล้ว';
    const defaultFeeling = toolsUsed.some((t) => t.success) ? 'happy' : 'neutral';

    const topicEntity = toolsUsed[0]?.params?.topic ||
      toolsUsed[0]?.params?.query ||
      toolsUsed[0]?.result?.title ||
      resolved.targetEntity ||
      extractTopic(effectiveMessage, focusEntity) ||
      null;

    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: finalText,
        toolUsed: toolsUsed[0]?.tool || null,
        focusEntity: topicEntity
      });
    }

    // Save verified answer to Note Memory Ledger
    const verifiedTool = toolsUsed.find((t) => t.success && (t.tool === 'search_web' || t.tool === 'search_wikipedia' || t.tool === 'calculate'));
    if (verifiedTool && finalText && !finalText.includes('ขออภัย') && !finalText.includes('ไม่พบข้อมูล')) {
      sessionMemory.noteLedger.saveNote({
        sessionId: effectiveSessionId || 'global',
        query: message,
        answer: finalText,
        topic: topicEntity,
        sourceTool: verifiedTool.tool,
        polarity: /ห้าม|อันตราย|เป็นพิษ|ไม่ได้|ผิดกฎหมาย/.test(finalText) ? 'negative_warning' : 'neutral'
      });
    }

    const activeNotice = toolsUsed.find((t) => t.result?.notice)?.result?.notice || null;
    const durationMs = Date.now() - startTime;
    const promptTokens = (typeof meta?.prompt_eval_count === 'number' && meta.prompt_eval_count > 0)
      ? meta.prompt_eval_count
      : (synthesized?.estimatedPromptTokens || estimateTokens(effectiveMessage));
    const completionTokens = (typeof meta?.eval_count === 'number' && meta.eval_count > 0)
      ? meta.eval_count
      : estimateTokens(finalText);
    const usage = createUsage({
      promptTokens,
      completionTokens,
      isDeterministic: false,
      durationMsOverride: durationMs
    });

    return {
      text: finalText,
      status: 'idle',
      feeling: normalizeFeeling(parsed?.feeling, defaultFeeling),
      toolsUsed,
      notice: activeNotice,
      error: null,
      model,
      modelLabel: activeModelLabel,
      mode: activeMode,
      meta: meta || undefined,
      usage
    };
  } catch (error) {
    const usage = createUsage({ promptTokens: 0, completionTokens: 0, isDeterministic: true });
    return {
      text: 'ขออภัยครับ ขณะนี้ระบบ AI ประมวลผลติดขัด กรุณาลองใหม่อีกครั้ง',
      status: 'error',
      feeling: 'confused',
      toolsUsed,
      notice: null,
      error: error.message || 'Unknown agent error',
      model,
      modelLabel: activeModelLabel,
      mode: activeMode,
      usage
    };
  }
}
