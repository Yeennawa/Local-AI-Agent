// Tavily Search Provider for Local AI Agent
// Clean provider function returning normalized { success, results } without tool wrapper.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FETCH_TIMEOUT_MS = 3000;
let cachedApiKey = undefined;

export function getTavilyApiKey() {
  if (cachedApiKey !== undefined) return cachedApiKey;

  if (process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim()) {
    cachedApiKey = process.env.TAVILY_API_KEY.trim();
    return cachedApiKey;
  }

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(currentDir, '../../../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TAVILY_API_KEY=')) {
          const val = trimmed.replace('TAVILY_API_KEY=', '').trim();
          if (val) {
            cachedApiKey = val;
            return cachedApiKey;
          }
        }
      }
    }
  } catch {
    // Non-fatal if .env cannot be read
  }

  cachedApiKey = null;
  return cachedApiKey;
}

export function isTavilyConfigured() {
  return Boolean(getTavilyApiKey());
}

export function resetCachedTavilyApiKey() {
  cachedApiKey = undefined;
}

export async function searchTavily({ query, signal, maxResults = 3, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    return { success: false, reason: 'key_missing', results: [] };
  }

  const abortSignal = signal || AbortSignal.timeout(timeoutMs);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults
      }),
      signal: abortSignal
    });

    if (!res.ok) {
      return { success: false, reason: `http_${res.status}`, results: [] };
    }

    const data = await res.json();
    if (!Array.isArray(data?.results)) {
      return { success: true, results: [] };
    }

    const results = data.results.map((item) => ({
      title: item.title || 'Untitled',
      snippet: (item.content || '').replace(/\s+/g, ' ').trim(),
      url: item.url || ''
    })).filter((item) => item.snippet.length > 0);

    return { success: true, results };
  } catch (err) {
    return {
      success: false,
      reason: err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'network_error'),
      results: []
    };
  }
}
