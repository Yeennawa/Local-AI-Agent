import ollama from 'ollama';

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_KEEP_ALIVE = '2m';

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
  temperature = 0.2,
  numPredict = 256,
  chatFn = defaultChat
}) {
  let stream;
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      stream?.abort?.();
      reject(new Error(`Ollama request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
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
      keep_alive: DEFAULT_KEEP_ALIVE
    });

    let text = '';
    for await (const part of stream) {
      text += part?.message?.content || '';
    }
    return text;
  };

  try {
    return await Promise.race([collect(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
