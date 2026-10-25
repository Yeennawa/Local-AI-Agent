// Web Search Tool Facade with Zero-Key Fallback and Provider Prioritization
// Primary: Tavily (if configured) -> Fallback: DuckDuckGo -> Secondary Fallback: Wikipedia
// Designed for Raspberry Pi 5 with LRU Caching and 8000ms registry budget.

import { searchTavily, isTavilyConfigured } from './search/tavily.js';
import { searchDuckDuckGo, parseDuckDuckGoHtml, decodeHtmlEntities } from './search/duckduckgo.js';

export { parseDuckDuckGoHtml, decodeHtmlEntities };

const MAX_SEARCH_RESULTS = 5;
const MAX_SUMMARY_CHARS = 2600;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 100;
const WIKI_FALLBACK_TIMEOUT_MS = 2500;

export const PROVIDER_LABELS = {
  tavily: 'Tavily AI',
  duckduckgo: 'DuckDuckGo',
  wikipedia: 'Wikipedia Fallback'
};

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
  timeoutMs: 18000,
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
    let directAnswer = null;
    let tavilyFailureReason = null;

    // 1. Primary Provider: Tavily AI Search (if configured with API key)
    const tavilyConfigured = isTavilyConfigured();
    if (tavilyConfigured) {
      const tavilyOutcome = await searchTavily({ query: cleanQuery, maxResults: MAX_SEARCH_RESULTS });
      if (tavilyOutcome.success && tavilyOutcome.results.length > 0) {
        results = tavilyOutcome.results;
        provider = 'tavily';
        if (tavilyOutcome.answer) {
          directAnswer = tavilyOutcome.answer;
        }
      } else if (!tavilyOutcome.success) {
        tavilyFailureReason = tavilyOutcome.reason || 'unknown';
        if (tavilyFailureReason === 'auth_failed_401') {
          notice = {
            code: 'tavily_auth_failed',
            message: 'Tavily API Key ไม่ถูกต้องหรือถูกปฏิเสธ (HTTP 401) ระบบจึงสลับไปใช้ DuckDuckGo แทน'
          };
        } else if (tavilyFailureReason === 'quota_exceeded_429') {
          notice = {
            code: 'tavily_quota_exceeded',
            message: 'โควตาการใช้งาน Tavily API เต็มหรือถูกจำกัดความถี่ (HTTP 429/432) ระบบจึงสลับไปใช้ DuckDuckGo แทน'
          };
        } else if (tavilyFailureReason === 'timeout' || tavilyFailureReason === 'network_error') {
          notice = {
            code: `tavily_${tavilyFailureReason}`,
            message: `เชื่อมต่อเซิร์ฟเวอร์ Tavily ไม่สำเร็จ (${tavilyFailureReason}) ระบบจึงสลับไปใช้ DuckDuckGo แทน`
          };
        }
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
      if (tavilyFailureReason && !notice) {
        notice = {
          code: `tavily_${tavilyFailureReason}`,
          message: `ค้นหาผ่าน Tavily ไม่สำเร็จ (${tavilyFailureReason}) และไม่พบข้อมูลจากแหล่งสำรอง`
        };
      }
      const diagSuffix = tavilyFailureReason
        ? ` (สาเหตุฝั่ง Tavily: ${tavilyFailureReason})`
        : !tavilyConfigured
          ? ' (ยังไม่ได้ตั้งค่า Tavily API Key บนเซิร์ฟเวอร์)'
          : '';
      return {
        found: false,
        message: `ไม่พบข้อมูลบนเว็บสำหรับ "${cleanQuery}"${diagSuffix}`,
        provider: null,
        providerLabel: null,
        notice
      };
    }

    // Compose concise summary from top snippets
    const snippetLines = results.map((r, i) => `[แหล่งที่ ${i + 1}: ${r.title}] ${r.snippet}`);
    if (directAnswer) {
      snippetLines.unshift(`[คำตอบสังเคราะห์จาก Tavily AI]: ${directAnswer}`);
    }
    let summary = snippetLines.join('\n');
    if (summary.length > MAX_SUMMARY_CHARS) {
      const slice = summary.slice(0, MAX_SUMMARY_CHARS);
      const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      summary = lastBreak > MAX_SUMMARY_CHARS * 0.7 ? `${slice.slice(0, lastBreak).trim()}...` : `${slice.trim()}...`;
    }

    const payload = {
      found: true,
      query: cleanQuery,
      results,
      summary,
      provider,
      providerLabel: PROVIDER_LABELS[provider] || provider || 'Web Search',
      directAnswer,
      notice
    };

    setInCache(cacheKey, payload);
    return payload;
  }
};
