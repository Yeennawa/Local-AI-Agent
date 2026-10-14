import ollama from 'ollama';

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '2m';

// Pi 5 has 4 cores. Leave one for node and the OS, and keep the KV cache small.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 1536;
const NUM_THREAD = Number(process.env.OLLAMA_NUM_THREAD) || 3;

// Streaming is on purpose: ollama-js can only abort streamed requests,
// and without an abort the Pi keeps generating after we already gave up.
const defaultChat = (req) => ollama.chat(req);

export async function queryOllama({
  messages,
  format = undefined,
  model = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stallTimeoutMs = undefined,
  maxTimeoutMs = 120000,
  temperature = 0.2,
  numPredict = 256,
  chatFn = defaultChat,
  keepAlive = DEFAULT_KEEP_ALIVE,
  returnDetails = false
}) {
  let stream;
  let stallTimer = null;
  let maxTimer = null;
  let rejectTimeout = null;

  const activeStallMs = Number(stallTimeoutMs || timeoutMs) || DEFAULT_TIMEOUT_MS;

  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stream?.abort?.();
      rejectTimeout?.(new Error(`Ollama request timed out after ${activeStallMs}ms`));
    }, activeStallMs);
  };

  const timeoutPromise = new Promise((_, reject) => {
    rejectTimeout = reject;
    resetStallTimer();
    if (maxTimeoutMs > 0) {
      maxTimer = setTimeout(() => {
        stream?.abort?.();
        reject(new Error(`Ollama request exceeded max duration ceiling (${maxTimeoutMs}ms)`));
      }, maxTimeoutMs);
    }
  });

  const collect = async () => {
    stream = await chatFn({
      model,
      messages,
      format,
      stream: true,
      options: {
        temperature,
        num_ctx: NUM_CTX,
        num_thread: NUM_THREAD,
        num_predict: numPredict
      },
      keep_alive: keepAlive
    });

    let text = '';
    let doneReason = 'stop';
    let meta = {
      totalDuration: 0,
      loadDuration: 0,
      promptEvalCount: 0,
      evalCount: 0
    };

    for await (const part of stream) {
      resetStallTimer();
      text += part?.message?.content || '';
      if (part?.done) {
        doneReason = part.done_reason || doneReason;
        meta = {
          totalDuration: part.total_duration ?? 0,
          loadDuration: part.load_duration ?? 0,
          promptEvalCount: part.prompt_eval_count ?? 0,
          evalCount: part.eval_count ?? 0
        };
      }
    }

    if (returnDetails) {
      return { text, doneReason, meta };
    }
    return text;
  };

  try {
    return await Promise.race([collect(), timeoutPromise]);
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    if (maxTimer) clearTimeout(maxTimer);
  }
}
