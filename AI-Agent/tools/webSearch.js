// Web Search Tool with Zero API Keys, DuckDuckGo HTML/Lite Scraper,
// Wikipedia Snippet Fallback, In-Memory LRU Caching, and Sentence Clipping.
// Designed for Raspberry Pi 5 without external npm dependencies.

const MAX_SEARCH_RESULTS = 3;
const MAX_SUMMARY_CHARS = 550;
const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 100;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const searchCache = new Map();

function getFromCache(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key, data) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(key, { data, timestamp: Date.now() });
}

export function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

export function parseDuckDuckGoHtml(html) {
  if (typeof html !== 'string') return [];
  const results = [];

  // Match result blocks
  // DuckDuckGo HTML structure typically has:
  // <a class="result__a" ...>Title</a> ... <a class="result__snippet" ...>Snippet</a>
  const blockRegex = /<h2[^>]*class=["'][^"']*result__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>[\s\S]*?(?:<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>|<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>)/gi;

  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < MAX_SEARCH_RESULTS) {
    const rawTitleBlock = match[1] || '';
    const rawSnippetBlock = match[2] || match[3] || '';

    // Extract title text from inside <a> tag
    const titleMatch = rawTitleBlock.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeHtmlEntities((titleMatch ? titleMatch[1] : rawTitleBlock).replace(/<[^>]+>/g, '')).trim();

    // Extract snippet text
    const snippet = decodeHtmlEntities(rawSnippetBlock.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

    // Extract outbound url if available
    const urlMatch = rawTitleBlock.match(/href=["']([^"']+)["']/i);
    let url = '';
    if (urlMatch) {
      const rawUrl = urlMatch[1];
      const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
      url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl;
    }

    if (title && snippet) {
      results.push({ title, snippet, url });
    }
  }

  return results;
}

async function searchWikipediaFallback(query) {
  try {
    const endpoint = `https://th.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srprop=snippet&format=json&srlimit=3&utf8=1`;
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits = data?.query?.search;
    if (!Array.isArray(hits)) return [];

    return hits.map((hit) => ({
      title: hit.title,
      snippet: decodeHtmlEntities(hit.snippet.replace(/<[^>]+>/g, '')).trim(),
      url: `https://th.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`
    }));
  } catch {
    return [];
  }
}

export const webSearchTool = {
  name: 'search_web',
  description: 'Search the web for real-time information, everyday practical questions, how-tos, slang, and cultural queries.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or question (e.g. "แมวกินได้ไหม", "วิธีแก้สะอึก", "ติดแกลม แปลว่า")'
      }
    },
    required: ['query']
  },
  dangerous: false,
  async execute(params = {}) {
    const rawQuery = params?.query;
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return { found: false, error: 'Query parameter is required and cannot be empty' };
    }

    const cleanQuery = rawQuery.trim();
    const cacheKey = cleanQuery.toLowerCase();

    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    let results = [];

    // 1. DuckDuckGo HTML Lite search
    try {
      const ddgUrl = 'https://html.duckduckgo.com/html/';
      const body = new URLSearchParams({ q: cleanQuery }).toString();

      const res = await fetch(ddgUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT
        },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });

      if (res.ok) {
        const html = await res.text();
        results = parseDuckDuckGoHtml(html);
      }
    } catch {
      // Ignore and proceed to fallback
    }

    // 2. Fallback to Wikipedia snippet search if DDG failed or was empty
    if (results.length === 0) {
      results = await searchWikipediaFallback(cleanQuery);
    }

    if (results.length === 0) {
      return {
        found: false,
        message: `ไม่พบข้อมูลบนเว็บสำหรับ "${cleanQuery}"`
      };
    }

    // Compose concise summary from top snippets
    const snippetLines = results.map((r, i) => `[แหล่งที่ ${i + 1}: ${r.title}] ${r.snippet}`);
    let summary = snippetLines.join('\n');
    if (summary.length > MAX_SUMMARY_CHARS) {
      summary = `${summary.slice(0, MAX_SUMMARY_CHARS)}...`;
    }

    const payload = {
      found: true,
      query: cleanQuery,
      results,
      summary
    };

    setInCache(cacheKey, payload);
    return payload;
  }
};
