// Tavily Search Tool for real-time AI-optimized web retrieval
// Designed for Raspberry Pi 5 with zero external npm dependencies, LRU Caching, and strict token budgeting.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_SEARCH_RESULTS = 3;
const MAX_SUMMARY_CHARS = 550;
const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const searchCache = new Map();

function getTavilyApiKey() {
  if (process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim()) {
    return process.env.TAVILY_API_KEY.trim();
  }
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(currentDir, '../../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TAVILY_API_KEY=')) {
          const val = trimmed.replace('TAVILY_API_KEY=', '').trim();
          if (val) return val;
        }
      }
    }
  } catch {
    // Non-fatal: if env read fails, return null
  }
  return null;
}

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

export const tavilyTool = {
  name: 'tavily_search',
  description: 'Search the live web using Tavily for up-to-date facts, current events, official figures, and general knowledge.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Specific topic or question to search on the web.'
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

    const apiKey = getTavilyApiKey();
    if (!apiKey) {
      return {
        found: false,
        error: 'Tavily API key is not configured in .env'
      };
    }

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: cleanQuery,
          search_depth: 'basic',
          max_results: MAX_SEARCH_RESULTS
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });

      if (!res.ok) {
        return {
          found: false,
          error: `Tavily API responded with status ${res.status}`
        };
      }

      const data = await res.json();
      if (!Array.isArray(data?.results) || data.results.length === 0) {
        return {
          found: false,
          message: `ไม่พบข้อมูลบน Tavily สำหรับ "${cleanQuery}"`
        };
      }

      const results = data.results.map((item) => ({
        title: item.title || 'Untitled',
        snippet: (item.content || '').replace(/\s+/g, ' ').trim(),
        url: item.url || ''
      })).filter((item) => item.snippet.length > 0);

      if (results.length === 0) {
        return {
          found: false,
          message: `ไม่พบข้อมูลบน Tavily สำหรับ "${cleanQuery}"`
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
        error: `Tavily lookup failed: ${err.message || 'Network timeout'}`
      };
    }
  }
};
