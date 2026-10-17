// Wikipedia Search Tool with Relevance Scoring, LRU Caching, and Sentence Clipping
// Prevents semantic drift and ensures clean encyclopedic context within token budget.

import { computeThaiBigramContainment, normalizeQuery, expandAbbreviations } from '../normalizer.js';

const MAX_EXTRACT_CHARS = 450;
const FETCH_TIMEOUT_MS = 4500;
const USER_AGENT = 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent; student-project@local.ai)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 100;

const wikiCache = new Map();

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

const THAI_ABBR_REGEX = /(?:พ\.ศ\.|ค\.ศ\.|ดร\.|พ\.ร\.บ\.|จ\.|อ\.|ต\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.)$/;

export function clipAtSentenceBoundary(text, maxChars = MAX_EXTRACT_CHARS) {
  if (!text || text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  let bestIdx = -1;
  const delimiters = ['. ', '.\n', '! ', '? ', '\n'];

  for (const sep of delimiters) {
    const idx = slice.lastIndexOf(sep);
    if (idx > bestIdx) {
      const candidate = slice.slice(0, idx + 1).trim();
      if (!THAI_ABBR_REGEX.test(candidate)) {
        bestIdx = idx;
      }
    }
  }

  if (bestIdx > maxChars * 0.6) {
    return slice.slice(0, bestIdx + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.7) {
    const candidate = slice.slice(0, lastSpace).trim();
    if (!THAI_ABBR_REGEX.test(candidate)) {
      return `${candidate}...`;
    }
  }

  return `${slice.trim()}...`;
}

export function computeRelevance(hitOrTitle, rawQuery) {
  const hit = typeof hitOrTitle === 'object' && hitOrTitle !== null
    ? hitOrTitle
    : { title: String(hitOrTitle || '') };

  const normTitle = (hit.title || '').toLowerCase().trim();
  const redirect = (hit.redirecttitle || '').toLowerCase().trim();
  const query = (rawQuery || '').toLowerCase().trim();
  const expandedQuery = expandAbbreviations(query).toLowerCase().trim();

  // 1. Direct redirect match: Wikipedia itself knows the redirect alias
  if (redirect) {
    if (redirect === query || query === redirect) return 1.0;
    if (redirect.includes(query) || query.includes(redirect)) return 0.95;
    if (redirect === expandedQuery || expandedQuery.includes(redirect)) return 0.95;
  }

  // 2. Exact or direct title match
  if (normTitle === query || normTitle === expandedQuery) return 1.0;
  if (normTitle.includes(query) || query.includes(normTitle)) return 0.85;
  if (expandedQuery && (normTitle.includes(expandedQuery) || expandedQuery.includes(normTitle))) return 0.85;

  // 3. Thai Bigram Containment for compound words with infixes (e.g. นายกไทย vs นายกรัฐมนตรีไทย)
  const isThai = /[\u0E00-\u0E7F]/.test(query);
  if (isThai) {
    const bigramScore = Math.max(
      computeThaiBigramContainment(query, normTitle),
      expandedQuery ? computeThaiBigramContainment(expandedQuery, normTitle) : 0
    );
    if (bigramScore >= 0.65) {
      return bigramScore;
    }
  }

  // 4. Token match fallback for whitespace-separated words
  const titleTokens = normTitle.split(/[\s\-()/,]+/).filter((t) => t.length > 1);
  const queryTokens = query.split(/[\s\-()/,]+/).filter((t) => t.length > 1);

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
  const searchUrl = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srprop=snippet|redirecttitle&format=json&srlimit=5&utf8=1`;

  const searchData = await fetchWikiJson(searchUrl);
  const hits = searchData?.query?.search;
  if (!Array.isArray(hits) || hits.length === 0) return null;

  // Find best scoring hit above relevance threshold
  let bestHit = null;
  let bestScore = -1;

  for (const hit of hits) {
    const score = computeRelevance(hit, query);
    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }

  // Reject irrelevant hits
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

    const { canonicalTopic, searchCandidates } = normalizeQuery(rawTopic);
    const searchTarget = canonicalTopic || rawTopic.trim();
    const cacheKey = searchTarget.toLowerCase();

    // Check in-memory cache first
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const candidates = searchCandidates.length > 0 ? searchCandidates : [searchTarget];

    try {
      let result = null;

      // Try candidates in order
      for (const candidate of candidates) {
        const hasThai = /[\u0E00-\u0E7F]/.test(candidate);

        if (hasThai) {
          result = await fetchWikiExtract('th', candidate);
        }

        if (!result) {
          result = await fetchWikiExtract('en', candidate);
        }

        if (result) break;
      }

      if (!result) {
        return {
          found: false,
          message: `ไม่พบข้อมูลที่เกี่ยวข้องใน Wikipedia สำหรับ "${rawTopic}"`
        };
      }

      const summary = clipAtSentenceBoundary(result.extract, MAX_EXTRACT_CHARS);
      const payload = {
        found: true,
        title: result.title,
        summary
      };

      setInCache(cacheKey, payload);
      return payload;
    } catch (error) {
      if (error.name === 'TypeError' && error.message?.includes('fetch failed')) {
        return {
          found: false,
          error: 'ขณะนี้ระบบออฟไลน์ ไม่สามารถเข้าถึง Wikipedia ได้'
        };
      }
      return {
        found: false,
        error: `Wikipedia lookup failed: ${error.message || 'Network error'}`
      };
    }
  }
};