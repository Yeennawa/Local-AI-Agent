import { queryOllama } from './ollamaClient.js';
import { toolRegistry } from './tools/registry.js';
import { extractJson, extractIncompleteText, normalizeFeeling, sanitizeHistory } from './parse.js';
import { routeIntent } from './router.js';

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

const ANSWER_PROMPT = `You are Max, a short, helpful, and friendly assistant on a Raspberry Pi.
Respond in Thai when the user asks in Thai.
State the answer directly from the tool results. Never repeat the user's question as the answer.
Keep your response natural, helpful, and concise (within 2-3 sentences).`;

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function describeOutcome(execResult) {
  const body = execResult.success
    ? clip(JSON.stringify(execResult.result), MAX_OBSERVATION_CHARS)
    : `failed: ${execResult.error}`;
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

async function synthesizeAnswer({ model, chatFn, history, message, observations }) {
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
    temperature: 0.3,
    numPredict: ANSWER_TOKENS,
    returnDetails: true
  });
}

function resolveToolCall(decision) {
  if (!decision || typeof decision !== 'object') return null;
  if (decision.action === 'call_tool' && decision.tool) {
    return { name: decision.tool, params: decision.params || {} };
  }
  if (decision.tool && toolRegistry.hasTool(decision.tool)) {
    return { name: decision.tool, params: decision.params || {} };
  }
  if (decision.action && toolRegistry.hasTool(decision.action)) {
    return { name: decision.action, params: decision.params || {} };
  }
  return null;
}

export async function runAgent({ message, conversationHistory = [], options = {} }) {
  if (!message || typeof message !== 'string') {
    return {
      text: 'ข้อความไม่ถูกต้อง กรุณาระบุข้อความที่ต้องการถามครับ',
      status: 'error',
      feeling: 'confused',
      toolsUsed: [],
      error: 'Invalid message argument'
    };
  }

  const toolsUsed = [];
  const observations = [];
  const model = options.model || process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const chatFn = options.chatFn;
  const history = sanitizeHistory(conversationHistory);
  const useRouter = options.useRouter !== undefined ? options.useRouter : true;
  const focusEntity = options.focusEntity || null;
  const ctx = { model, chatFn, history, message, observations };

  try {
    const route = useRouter ? routeIntent({ message, history, focusEntity }) : null;

    if (route && route.confidence === 'high') {
      if (route.intent === 'tool' && route.toolCall) {
        const name = route.toolCall.name;
        if (toolRegistry.hasTool(name)) {
          const execResult = await toolRegistry.executeTool(name, route.toolCall.params);
          toolsUsed.push(execResult);
          observations.push(describeOutcome(execResult));
        } else {
          observations.push(`${name}: not available`);
        }
      }
      // If route.intent === 'finish', no tools are needed; proceed directly to synthesizeAnswer.
    } else {
      // Fallback: ReAct loop for ambiguous requests or when useRouter is disabled
      for (let step = 0; step < MAX_LOOP_GUARD; step++) {
        const decision = await decideNextStep(ctx);
        const toolCall = resolveToolCall(decision);
        if (!toolCall) break;

        const name = toolCall.name;
        if (toolsUsed.some((t) => t.tool === name)) break;

        if (!toolRegistry.hasTool(name)) {
          observations.push(`${name}: not available`);
          break;
        }

        const execResult = await toolRegistry.executeTool(name, toolCall.params);
        toolsUsed.push(execResult);
        observations.push(describeOutcome(execResult));

        // Nothing left to try, so another decision call would only burn tokens.
        const untried = toolRegistry.getAllTools().some((t) => !toolsUsed.some((u) => u.tool === t.name));
        if (!untried) break;
      }
    }

    const synthesized = await synthesizeAnswer(ctx);
    const raw = typeof synthesized === 'string' ? synthesized : (synthesized?.text || '');
    const meta = typeof synthesized === 'object' ? synthesized?.meta : null;

    const parsed = extractJson(raw);
    const candidateText = (typeof parsed?.text === 'string' && parsed.text.trim())
      ? parsed.text.trim()
      : extractIncompleteText(raw).trim();

    const finalText = candidateText ? clip(candidateText, MAX_PLAIN_REPLY_CHARS) : 'รับทราบครับ ดำเนินการเรียบร้อยแล้ว';
    const defaultFeeling = toolsUsed.some((t) => t.success) ? 'happy' : 'neutral';

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
