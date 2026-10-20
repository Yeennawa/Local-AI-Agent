// DuckDuckGo Search Tool with HTML scraping and zero external npm dependencies
// Designed for Raspberry Pi 5 with LRU Caching and strict context budgeting.

const MAX_SEARCH_RESULTS = 3;
const MAX_SUMMARY_CHARS = 550;
const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 60 * 60 * 1000;
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

  const blockRegex = /<h2[^>]*class=["'][^"']*result__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>[\s\S]*?(?:<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>|<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>)/gi;

  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < MAX_SEARCH_RESULTS) {
    const rawTitleBlock = match[1] || '';
    const rawSnippetBlock = match[2] || match[3] || '';

    const titleMatch = rawTitleBlock.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeHtmlEntities((titleMatch ? titleMatch[1] : rawTitleBlock).replace(/<[^>]+>/g, '')).trim();
    const snippet = decodeHtmlEntities(rawSnippetBlock.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

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

export const duckDuckGoTool = {
  name: 'duckduckgo_search',
  description: 'Search the live web using DuckDuckGo for practical questions, how-tos, and web references without API keys.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or question to search on DuckDuckGo.'
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

      if (!res.ok) {
        return {
          found: false,
          error: `DuckDuckGo responded with HTTP ${res.status}`
        };
      }

      const html = await res.text();
      const results = parseDuckDuckGoHtml(html);

      if (results.length === 0) {
        return {
          found: false,
          message: `ไม่พบข้อมูลบน DuckDuckGo สำหรับ "${cleanQuery}"`
        };
      }

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
    } catch (err) {
      return {
        found: false,
        error: `DuckDuckGo lookup failed: ${err.message || 'Network timeout'}`
      };
    }
  }
};
