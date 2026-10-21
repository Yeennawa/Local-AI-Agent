// Web Search Tool Facade with Zero-Key Fallback and Provider Prioritization
// Primary: Tavily (if configured) -> Fallback: DuckDuckGo -> Secondary Fallback: Wikipedia
// Designed for Raspberry Pi 5 with LRU Caching and 8000ms registry budget.

import { searchTavily, isTavilyConfigured } from './search/tavily.js';
import { searchDuckDuckGo, parseDuckDuckGoHtml, decodeHtmlEntities } from './search/duckduckgo.js';

export { parseDuckDuckGoHtml, decodeHtmlEntities };

const MAX_SEARCH_RESULTS = 3;
const MAX_SUMMARY_CHARS = 550;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 100;
const WIKI_FALLBACK_TIMEOUT_MS = 1800;

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

export function clearWebSearchCache() {
  searchCache.clear();
}

async function searchWikipediaFallback(query, timeoutMs = WIKI_FALLBACK_TIMEOUT_MS) {
  try {
    const endpoint = `https://th.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srprop=snippet&format=json&srlimit=3&utf8=1`;
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent)' },
      signal: AbortSignal.timeout(timeoutMs)
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
  timeoutMs: 8000,
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
    let provider = null;
    let notice = null;

    // 1. Primary Provider: Tavily AI Search (if configured with API key)
    const tavilyConfigured = isTavilyConfigured();
    if (tavilyConfigured) {
      const tavilyOutcome = await searchTavily({ query: cleanQuery, maxResults: MAX_SEARCH_RESULTS });
      if (tavilyOutcome.success && tavilyOutcome.results.length > 0) {
        results = tavilyOutcome.results;
        provider = 'tavily';
      }
    } else {
      // User has not configured Tavily API Key -> inform user via notice that DuckDuckGo is used
      notice = {
        code: 'tavily_key_missing',
        message: 'ไม่พบ Tavily API Key จึงใช้งาน DuckDuckGo แทน'
      };
    }

    // 2. Secondary Provider: DuckDuckGo HTML Lite (if Tavily was unconfigured or failed/empty)
    if (results.length === 0) {
      const ddgOutcome = await searchDuckDuckGo({ query: cleanQuery, maxResults: MAX_SEARCH_RESULTS });
      if (ddgOutcome.success && ddgOutcome.results.length > 0) {
        results = ddgOutcome.results;
        provider = 'duckduckgo';
      }
    }

    // 3. Fallback: Wikipedia snippet search
    if (results.length === 0) {
      const wikiResults = await searchWikipediaFallback(cleanQuery);
      if (wikiResults.length > 0) {
        results = wikiResults;
        provider = 'wikipedia';
      }
    }

    if (results.length === 0) {
      return {
        found: false,
        message: `ไม่พบข้อมูลบนเว็บสำหรับ "${cleanQuery}"`,
        provider: null,
        notice
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
      summary,
      provider,
      notice
    };

    setInCache(cacheKey, payload);
    return payload;
  }
};
