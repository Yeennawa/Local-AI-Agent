// Wikipedia Search Tool with Relevance Scoring, LRU Caching, and Sentence Clipping
// Prevents semantic drift and ensures clean encyclopedic context within token budget.

const MAX_EXTRACT_CHARS = 450;
const FETCH_TIMEOUT_MS = 4500;
const USER_AGENT = 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent; student-project@local.ai)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 100;

const wikiCache = new Map();

const TRANSLITERATION_ALIASES = {
  'ราสเบอร์รีพาย': 'Raspberry Pi',
  'ราสเบอร์รี่พาย': 'Raspberry Pi',
  'รัสเบอรี่พาย': 'Raspberry Pi',
  'ไพทอน': 'Python (programming language)',
  'ไพธอน': 'Python (programming language)',
  'จาวาสคริปต์': 'JavaScript',
  'จาวาสคริป': 'JavaScript',
  'ลินุกซ์': 'Linux',
  'ด็อกเกอร์': 'Docker'
};

function getFromCache(key) {
  const entry = wikiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    wikiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key, data) {
  if (wikiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = wikiCache.keys().next().value;
    wikiCache.delete(oldestKey);
  }
  wikiCache.set(key, { data, timestamp: Date.now() });
}

function clipAtSentenceBoundary(text, maxChars) {
  if (!text || text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  // Find last sentence boundary in the slice
  const lastPeriod = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('.\n'),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );

  if (lastPeriod > maxChars * 0.6) {
    return slice.slice(0, lastPeriod + 1).trim();
  }

  // Fallback to last whitespace
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.7) {
    return `${slice.slice(0, lastSpace).trim()}...`;
  }

  return `${slice.trim()}...`;
}

function computeRelevance(hitTitle, query) {
  const normTitle = hitTitle.toLowerCase().trim();
  const normQuery = query.toLowerCase().trim();

  if (normTitle === normQuery) return 1.0;
  if (normTitle.includes(normQuery) || normQuery.includes(normTitle)) return 0.8;

  // Split into tokens
  const titleTokens = normTitle.split(/[\s\-()/,]+/).filter((t) => t.length > 1);
  const queryTokens = normQuery.split(/[\s\-()/,]+/).filter((t) => t.length > 1);

  if (queryTokens.length === 0 || titleTokens.length === 0) return 0.0;

  let matches = 0;
  for (const q of queryTokens) {
    if (titleTokens.some((t) => t.includes(q) || q.includes(t))) {
      matches++;
    }
  }

  return matches / Math.max(queryTokens.length, titleTokens.length);
}

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
    } catch (err) {
      if (err.name === 'TypeError' && err.message?.includes('fetch failed')) {
        // Fast offline / DNS failure
        throw err;
      }
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
  const searchUrl = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`;

  const searchData = await fetchWikiJson(searchUrl);
  const hits = searchData?.query?.search;
  if (!Array.isArray(hits) || hits.length === 0) return null;

  // Find best scoring hit above relevance threshold
  let bestHit = null;
  let bestScore = -1;

  for (const hit of hits) {
    const score = computeRelevance(hit.title, query);
    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }

  // Reject irrelevant hits (prevents semantic drift e.g. "ราสเบอร์รีพาย" -> "เรือพาย")
  if (!bestHit || bestScore < 0.35) {
    return null;
  }

  const extractUrl = `${endpoint}?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${bestHit.pageid}&format=json&utf8=1`;
  const extractData = await fetchWikiJson(extractUrl);
  const page = extractData?.query?.pages?.[bestHit.pageid];
  const extract = page?.extract?.trim();

  if (!extract) return null;
  return {
    title: bestHit.title,
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
    const rawTopic = params?.topic;
    if (!rawTopic || typeof rawTopic !== 'string' || !rawTopic.trim()) {
      return { error: 'Topic parameter is required and cannot be empty' };
    }

    const topic = rawTopic.trim();
    const cacheKey = topic.toLowerCase();

    // Check in-memory cache first (0ms latency, zero network)
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Resolve known transliteration aliases
    let normalizedTopic = topic;
    for (const [alias, standard] of Object.entries(TRANSLITERATION_ALIASES)) {
      if (topic === alias || topic.includes(alias)) {
        normalizedTopic = standard;
        break;
      }
    }

    const hasThai = /[\u0E00-\u0E7F]/.test(normalizedTopic);

    try {
      let result = null;

      // 1. Search Thai Wikipedia if topic contains Thai characters
      if (hasThai) {
        result = await fetchWikiExtract('th', normalizedTopic);
      }

      // 2. Fallback to English Wikipedia if no relevant Thai article found
      if (!result) {
        const enQuery = normalizedTopic !== topic ? normalizedTopic : topic;
        result = await fetchWikiExtract('en', enQuery);
      }

      if (!result) {
        return { message: `ไม่พบข้อมูลที่เกี่ยวข้องใน Wikipedia สำหรับ "${topic}"` };
      }

      const summary = clipAtSentenceBoundary(result.extract, MAX_EXTRACT_CHARS);
      const payload = {
        title: result.title,
        summary
      };

      setInCache(cacheKey, payload);
      return payload;
    } catch (error) {
      if (error.name === 'TypeError' && error.message?.includes('fetch failed')) {
        return { error: 'ขณะนี้ระบบออฟไลน์ ไม่สามารถเข้าถึง Wikipedia ได้' };
      }
      return { error: `Wikipedia lookup failed: ${error.message || 'Network error'}` };
    }
  }
};