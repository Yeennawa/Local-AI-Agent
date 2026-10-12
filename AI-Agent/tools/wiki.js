const MAX_EXTRACT_CHARS = 450;
const FETCH_TIMEOUT_MS = 4500;
const USER_AGENT = 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent; student-project@local.ai)';

async function fetchWikiJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (res.ok) return await res.json();
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      return null;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchWikiExtract(lang, query) {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  const searchUrl = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&utf8=1`;

  const searchData = await fetchWikiJson(searchUrl);
  const firstHit = searchData?.query?.search?.[0];
  if (!firstHit) return null;

  const extractUrl = `${endpoint}?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${firstHit.pageid}&format=json&utf8=1`;
  const extractData = await fetchWikiJson(extractUrl);
  const page = extractData?.query?.pages?.[firstHit.pageid];
  const extract = page?.extract?.trim();

  if (!extract) return null;
  return {
    title: firstHit.title,
    extract
  };
}

export const wikiTool = {
  name: 'search_wikipedia',
  description: 'Search Wikipedia for a factual summary on a topic, concept, or person.',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Topic or keyword to search (e.g. "Raspberry Pi", "ปัญญาประดิษฐ์")'
      }
    },
    required: ['topic']
  },
  dangerous: false,
  async execute(params = {}) {
    const topic = params?.topic?.trim();
    if (!topic) {
      return { error: 'Topic parameter is required and cannot be empty' };
    }

    const hasThai = /[\u0E00-\u0E7F]/.test(topic);

    try {
      let result = null;
      if (hasThai) {
        result = await fetchWikiExtract('th', topic);
      }

      if (!result) {
        result = await fetchWikiExtract('en', topic);
      }

      if (!result) {
        return { message: `No Wikipedia article found for "${topic}"` };
      }

      const summary = result.extract.length > MAX_EXTRACT_CHARS
        ? `${result.extract.slice(0, MAX_EXTRACT_CHARS)}...`
        : result.extract;

      return {
        title: result.title,
        summary
      };
    } catch (error) {
      return { error: `Wikipedia lookup failed: ${error.message}` };
    }
  }
};