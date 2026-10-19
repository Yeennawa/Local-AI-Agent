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
  SYSTEM_ASSISTANT_PROMPT
} from './answer.js';

const MAX_PLAIN_REPLY_CHARS = 600;
const ANSWER_TOKENS = 256;

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/**
 * Backward-compatible export for tests and external callers.
 * Delegates to polishAnswerText in answer.js.
 */
export function sanitizeAnswerText(text, userMessage = '', defaultSummary = '') {
  return polishAnswerText(text, userMessage, defaultSummary);
}

async function synthesizeAnswer({ model, chatFn, history, message, cleanContext, personaPrompt, onToken }) {
  let systemContent = SYSTEM_ASSISTANT_PROMPT;
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

  return queryOllama({
    model,
    chatFn,
    messages,
    temperature: cleanContext ? 0.1 : 0.3,
    numPredict: ANSWER_TOKENS,
    returnDetails: true,
    onToken
  });
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
      return {
        text: metaAnswer,
        status: 'idle',
        feeling: 'happy',
        toolsUsed: [],
        error: null
      };
    }
  }

  // 2. Note Memory Ledger Recall (Instant recall of previously verified questions)
  const cachedNote = sessionMemory.noteLedger.recallNote(message, effectiveSessionId);
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
    return {
      text: cachedNote.answer,
      status: 'idle',
      feeling: 'happy',
      toolsUsed: cachedNote.sourceTool ? [{ tool: cachedNote.sourceTool, params: {}, result: { fromNote: true }, durationMs: 0 }] : [],
      error: null
    };
  }

  const toolsUsed = [];
  const model = options.model || process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const chatFn = options.chatFn;

  // Single source of truth for conversation history:
  // Prefer sessionMemory when sessionId exists; fallback to conversationHistory argument
  const rawHistory = effectiveSessionId
    ? sessionMemory.getAssembledContext(effectiveSessionId)
    : (Array.isArray(conversationHistory) && conversationHistory.length > 0 ? conversationHistory : []);
  const history = sanitizeHistory(rawHistory);

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
    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: text,
        toolUsed: toolsUsed[0]?.tool || null,
        focusEntity: focus || resolved.targetEntity || focusEntity
      });
    }
    onToken?.(text);
    return { text, status: 'idle', feeling, toolsUsed, error: null };
  };

  try {
    const useRouter = options.useRouter !== undefined ? options.useRouter : true;
    const route = useRouter
      ? routeIntent({ message: effectiveMessage, history, focusEntity: resolved.targetEntity || focusEntity })
      : { intent: 'finish', confidence: 'high' };

    let personaPrompt = null;
    let cleanContext = '';
    let referenceText = '';

    if (route) {
      if (route.intent === 'direct') {
        const text = buildDirectReply(route.reason, toolRegistry.getAllTools());
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
    onStatus?.({ status: 'synthesizing' });
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
    const finalText = polished ? clip(polished, MAX_PLAIN_REPLY_CHARS) : 'รับทราบครับ ดำเนินการเรียบร้อยแล้ว';
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

    return {
      text: finalText,
      status: 'idle',
      feeling: normalizeFeeling(parsed?.feeling, defaultFeeling),
      toolsUsed,
      error: null,
      meta: meta || undefined
    };
  } catch (error) {
    return {
      text: 'ขออภัยครับ ขณะนี้ระบบ AI ประมวลผลติดขัด กรุณาลองใหม่อีกครั้ง',
      status: 'error',
      feeling: 'confused',
      toolsUsed,
      error: error.message || 'Unknown agent error'
    };
  }
}
