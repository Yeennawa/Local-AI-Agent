import { queryOllama } from './ollamaClient.js';
import { toolRegistry } from './tools/registry.js';
import { extractJson, extractIncompleteText, normalizeFeeling, sanitizeHistory } from './parse.js';
import { routeIntent, extractTopic } from './router.js';
import { normalizeQuery } from './normalizer.js';
import { sessionMemory } from './memory.js';
import { buildDirectReply } from './replies.js';
import { getThaiJoke, explainSlangOrMeme } from './culture.js';

const MAX_LOOP_GUARD = 3;
// tool output goes back into a 1536 token window, so it can't be unbounded
const MAX_OBSERVATION_CHARS = 600;
const MAX_PLAIN_REPLY_CHARS = 600;

// The decision call only has to emit a tiny json object, so cap it hard.
const DECISION_TOKENS = 96;
const ANSWER_TOKENS = 256;

const DECISION_PROMPT = (tools) => `You run on a Raspberry Pi 5. Decide if the user's request needs a tool.
Tools:
${tools}
Rules:
- To call a tool: {"action":"call_tool","tool":"<tool_name>","params":{}}
- To answer directly without tools: {"action":"finish"}
- Never repeat a tool. Never invent a tool name.
Reply with JSON only.`;

const ANSWER_PROMPT = `You are Max, a short, precise, and friendly assistant on a Raspberry Pi.
Respond in Thai when the user asks in Thai.
State the answer directly and faithfully from the provided tool results or references. Never repeat the user's question as the answer.
If reference data is provided, base your answer strictly on the facts, names, and numbers in the reference. Never invent facts, news, dates, or abilities. If no information is found at all, state that politely.
Keep your response natural, helpful, and concise (within 2-3 sentences).`;

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function sanitizeAnswerText(text, userMessage = '', defaultSummary = '') {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();

  // 1. If model echoed the user's question or bare noun verbatim (e.g. asked "แมว" answered "แมว")
  if (userMessage && cleaned.toLowerCase() === userMessage.trim().toLowerCase()) {
    return defaultSummary || cleaned;
  }

  // 1b. Polarity & Warning Guard:
  // If the reference summary contains strong danger/toxicity/prohibition warnings,
  // ensure the answer does not contradict it or omit the critical warning.
  if (defaultSummary && /(?:อันตราย|เป็นพิษ|ห้าม(?:ให้|รับประทาน|กิน)|ไม่ควร(?:ให้|กิน)|ผิดกฎหมาย|ทำให้เสียชีวิต|ตายได้)/.test(defaultSummary)) {
    const mentionsWarning = /(?:อันตราย|พิษ|ห้าม|ไม่ควร|ไม่ได้|ตาย|เสียชีวิต|ผิดกฎหมาย)/.test(cleaned);
    const falselyPositive = /(?:กินได้|ปลอดภัย|ไม่มีปัญหา|ทานได้)/.test(cleaned) && !/(?:ห้าม|ไม่ควร|ไม่ได้)/.test(cleaned);
    if (!mentionsWarning || falselyPositive) {
      return defaultSummary;
    }
  }

  // 2. Remove consecutive duplicate sentences or clauses
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

  // 3. Trim dangling incomplete sentence if clipped at token boundary
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

  return cleaned;
}

function describeOutcome(execResult) {
  if (!execResult.success) {
    return `${execResult.tool}: failed: ${execResult.error}`;
  }

  const res = execResult.result;
  if (execResult.tool === 'tavily_search' && res?.found && res?.summary) {
    return `[ข้อมูลอ้างอิงจาก Tavily Search]: ${res.summary}`;
  }
  if (execResult.tool === 'duckduckgo_search' && res?.found && res?.summary) {
    return `[ข้อมูลอ้างอิงจาก DuckDuckGo]: ${res.summary}`;
  }
  if (execResult.tool === 'search_wikipedia' && res?.found && res?.summary) {
    return `[ข้อมูลอ้างอิงจาก Wikipedia เรื่อง "${res.title || ''}"]: ${res.summary}`;
  }
  if (execResult.tool === 'search_web' && res?.found && res?.summary) {
    return `[ข้อมูลอ้างอิงจากเว็บ]: ${res.summary}`;
  }
  if (execResult.tool === 'get_weather' && res?.temperatureC !== undefined) {
    return `[ข้อมูลสภาพอากาศ ${res.location || ''}]: อุณหภูมิ ${res.temperatureC}°C ความชื้น ${res.humidityPercent}% สภาพอากาศ ${res.condition || ''}`;
  }

  if (execResult.tool === 'get_fx' && res?.converted !== undefined) {
    return `[ข้อมูลอัตราแลกเปลี่ยน]: ${res.amount} ${res.base} = ${res.converted} ${res.target} (อัตรา 1 ${res.base} = ${res.rate} ${res.target})`;
  }
  if (execResult.tool === 'get_news' && Array.isArray(res?.items)) {
    const headlines = res.items.slice(0, 3).map((item, idx) => `${idx + 1}. ${typeof item === 'object' ? item.title : item}`).join('\n');
    return `[ข่าวจาก ${res.source || 'สื่อมวลชน'}]:\n${headlines}`;
  }

  const body = clip(JSON.stringify(res), MAX_OBSERVATION_CHARS);
  return `${execResult.tool}: ${body}`;
}

async function decideNextStep({ model, chatFn, history, message, observations }) {
  const messages = [
    { role: 'system', content: DECISION_PROMPT(toolRegistry.getToolsPromptDefinition()) },
    ...history,
    { role: 'user', content: message }
  ];

  if (observations.length) {
    messages.push({
      role: 'user',
      content: `Tool results so far:\n${observations.join('\n')}\nEnough to answer? If yes, finish.`
    });
  }

  const raw = await queryOllama({
    model,
    chatFn,
    messages,
    format: 'json',
    temperature: 0.1,
    numPredict: DECISION_TOKENS
  });
  return extractJson(raw);
}

async function synthesizeAnswer({ model, chatFn, history, message, observations, onToken }) {
  const systemContent = observations.length
    ? `${ANSWER_PROMPT}\n\nTool results:\n${observations.join('\n')}`
    : ANSWER_PROMPT;

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: message }
  ];

  return queryOllama({
    model,
    chatFn,
    messages,
    temperature: observations.length ? 0.1 : 0.3,
    numPredict: ANSWER_TOKENS,
    returnDetails: true,
    onToken
  });
}

function resolveToolCall(decision, message = '') {
  if (!decision || typeof decision !== 'object') return null;
  let name = null;
  let params = {};

  if (decision.action === 'call_tool' && decision.tool) {
    name = decision.tool;
    params = decision.params || {};
  } else if (decision.tool && toolRegistry.hasTool(decision.tool)) {
    name = decision.tool;
    params = decision.params || {};
  } else if (decision.action && toolRegistry.hasTool(decision.action)) {
    name = decision.action;
    params = decision.params || {};
  }

  if (!name) return null;

  // Guard against hallucinated tools in general knowledge queries
  if (name === 'get_current_time' && !/(?:เวลา|โมง|วันที่|กี่โมง|time|date)/i.test(message)) {
    return null;
  }
  if (name === 'get_system_info' && !/(?:cpu|ram|memory|แรม|ฮาร์ดแวร์|สถานะเครื่อง|system)/i.test(message)) {
    return null;
  }
  if (name === 'calculate' && !/\d/.test(message)) {
    return null;
  }

  return { name, params };
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

  // 1. Zero-Token Lexical Meta-Recall (Meta conversation check e.g. "คำถามแรกคืออะไร")
  if (effectiveSessionId) {
    const metaAnswer = sessionMemory.answerMetaRecall(effectiveSessionId, message);
    if (metaAnswer) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: metaAnswer,
        toolUsed: null,
        isMeta: true
      });
      if (onToken) {
        onToken(metaAnswer);
      }
      return {
        text: metaAnswer,
        status: 'idle',
        feeling: 'happy',
        toolsUsed: [],
        error: null
      };
    }
  }

  // 1b. Note Memory Ledger Recall (Instant recall of previously verified questions)
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
    if (onToken) onToken(cachedNote.answer);
    return {
      text: cachedNote.answer,
      status: 'idle',
      feeling: 'happy',
      toolsUsed: cachedNote.sourceTool ? [{ tool: cachedNote.sourceTool, params: {}, result: { fromNote: true }, durationMs: 0 }] : [],
      error: null
    };
  }


  const toolsUsed = [];
  const observations = [];
  const model = options.model || process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const chatFn = options.chatFn;

  // If conversationHistory was not provided by caller but sessionId exists, assemble from sessionMemory
  const rawHistory = (Array.isArray(conversationHistory) && conversationHistory.length > 0)
    ? conversationHistory
    : (effectiveSessionId ? sessionMemory.getAssembledContext(effectiveSessionId) : []);

  const history = sanitizeHistory(rawHistory);
  const useRouter = options.useRouter !== undefined ? options.useRouter : true;
  const focusEntity = options.focusEntity || (effectiveSessionId ? sessionMemory.getFocusEntity(effectiveSessionId) : null);
  const ctx = { model, chatFn, history, message, observations, onToken };

  // Deterministic answers: record the turn, stream the text, never call the model.
  const replyWithoutModel = (text, { feeling = 'neutral', focusEntity: focus } = {}) => {
    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: text,
        toolUsed: toolsUsed[0]?.tool || null,
        focusEntity: focus
      });
    }
    onToken?.(text);
    return { text, status: 'idle', feeling, toolsUsed, error: null };
  };

  try {
    const route = useRouter ? routeIntent({ message, history, focusEntity }) : null;

    if (route && route.confidence === 'high') {
      if (route.intent === 'direct') {
        const text = buildDirectReply(route.reason, toolRegistry.getAllTools());
        if (text) return replyWithoutModel(text, { feeling: 'happy' });
      }
      if (route.intent === 'joke') {
        const joke = getThaiJoke(effectiveSessionId || 'default');
        return replyWithoutModel(joke, { feeling: 'happy' });
      }
      if (route.intent === 'slang') {
        const expl = route.text || explainSlangOrMeme(message);
        if (expl) return replyWithoutModel(expl, { feeling: 'happy' });
      }
      if (route.intent === 'tool' && route.toolCall) {
        const name = route.toolCall.name;
        if (toolRegistry.hasTool(name)) {
          onStatus?.({ status: 'using_tool', tool: name, params: route.toolCall.params });
          const execResult = await toolRegistry.executeTool(name, route.toolCall.params);
          toolsUsed.push(execResult);
          observations.push(describeOutcome(execResult));

          // A tool that found nothing already holds the honest answer; do not let the model improvise.
          if (execResult.success && execResult.result?.found === false && execResult.result.message) {
            return replyWithoutModel(execResult.result.message);
          }
        } else {
          observations.push(`${name}: not available`);
        }
      }
      // If route.intent === 'finish', no tools are needed; proceed directly to synthesizeAnswer.
    } else {
      // Fallback: ReAct loop for ambiguous requests or when useRouter is disabled
      for (let step = 0; step < MAX_LOOP_GUARD; step++) {
        const decision = await decideNextStep(ctx);
        const toolCall = resolveToolCall(decision, message);
        if (!toolCall) break;

        const name = toolCall.name;
        if (toolsUsed.some((t) => t.tool === name)) break;

        if (!toolRegistry.hasTool(name)) {
          observations.push(`${name}: not available`);
          break;
        }

        onStatus?.({ status: 'using_tool', tool: name, params: toolCall.params });
        const execResult = await toolRegistry.executeTool(name, toolCall.params);
        toolsUsed.push(execResult);
        observations.push(describeOutcome(execResult));

        // Nothing left to try, so another decision call would only burn tokens.
        const untried = toolRegistry.getAllTools().some((t) => !toolsUsed.some((u) => u.tool === t.name));
        if (!untried) break;
      }

      // Fallback: If no tools were invoked and no tool attempts were made, but query has clear knowledge intent,
      // attempt a single fallback retrieval with search_web (Tavily -> DDG -> Wiki) before giving up to synthesis.
      if (observations.length === 0 && toolsUsed.length === 0 && toolRegistry.hasTool('search_web')) {
        const norm = normalizeQuery(message, { focusEntity });
        if (norm.isKnowledgeIntent && (norm.canonicalTopic || message)) {
          const targetQuery = norm.canonicalTopic || message;
          onStatus?.({ status: 'using_tool', tool: 'search_web', params: { query: targetQuery } });
          const execResult = await toolRegistry.executeTool('search_web', { query: targetQuery });
          toolsUsed.push(execResult);
          observations.push(describeOutcome(execResult));
          if (execResult.success && execResult.result?.found === false && execResult.result.message) {
            return replyWithoutModel(execResult.result.message);
          }
        }
      }
    }

    onStatus?.({ status: 'synthesizing' });
    const synthesized = await synthesizeAnswer(ctx);
    const raw = typeof synthesized === 'string' ? synthesized : (synthesized?.text || '');
    const meta = typeof synthesized === 'object' ? synthesized?.meta : null;

    const parsed = extractJson(raw);
    const candidateText = (typeof parsed?.text === 'string' && parsed.text.trim())
      ? parsed.text.trim()
      : extractIncompleteText(raw).trim();

    const referenceSummary = toolsUsed.find((t) => t.tool === 'tavily_search' || t.tool === 'duckduckgo_search' || t.tool === 'search_web' || t.tool === 'search_wikipedia')?.result?.summary || '';
    const cleanedText = sanitizeAnswerText(candidateText, message, referenceSummary);
    const finalText = cleanedText ? clip(cleanedText, MAX_PLAIN_REPLY_CHARS) : 'รับทราบครับ ดำเนินการเรียบร้อยแล้ว';
    const defaultFeeling = toolsUsed.some((t) => t.success) ? 'happy' : 'neutral';

    const topicEntity = toolsUsed[0]?.params?.topic ||
      toolsUsed[0]?.params?.query ||
      toolsUsed[0]?.result?.title ||
      extractTopic(message, focusEntity) ||
      null;

    // Record turn in session memory if sessionId was provided
    if (effectiveSessionId) {
      sessionMemory.recordTurn(effectiveSessionId, {
        userQuery: message,
        assistantText: finalText,
        toolUsed: toolsUsed[0]?.tool || null,
        focusEntity: topicEntity
      });
    }

    // Save verified answer to Note Memory Ledger
    const verifiedTool = toolsUsed.find((t) => t.success && (t.tool === 'tavily_search' || t.tool === 'duckduckgo_search' || t.tool === 'search_web' || t.tool === 'search_wikipedia' || t.tool === 'calculate'));
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
