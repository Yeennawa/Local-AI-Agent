// Wikipedia Search Tool with Relevance Scoring, LRU Caching, Deep Passage Retrieval, and Sentence Clipping
// Prevents semantic drift and ensures clean encyclopedic context within token budget.

import { computeThaiBigramContainment, normalizeQuery, expandAbbreviations } from '../normalizer.js';

const MAX_EXTRACT_CHARS = 1400;
const FETCH_TIMEOUT_MS = 6500;
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

export function cleanArticleClutter(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text
    .replace(/(?:,\s*)?(?:ออกเสียง|เสียงอ่าน|IPA|pronunciation)\s*:[^;)]+/gi, '')
    .replace(/\s*หรือ\s+[^(]+\((?:เสียงอ่าน|ออกเสียง)[^;)]*;\s*/g, ' (')
    .replace(/\[[ˈʔa-zA-Zʁɛbɪʃt\s/:,.-]+\]/g, '')
    .replace(/\(\s*;\s*/g, '(')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned;
}

export function buildFocusedExtract(rawText, focusKeywords = [], maxChars = MAX_EXTRACT_CHARS) {
  if (!rawText) return '';
  const cleaned = cleanArticleClutter(rawText);
  if (!cleaned) return '';

  const kws = Array.isArray(focusKeywords) ? focusKeywords.filter((k) => typeof k === 'string' && k.length > 0) : [];
  const matchesKeyword = (str, kw) => str.toLowerCase().includes(kw.toLowerCase());

  // 1. If no focus keywords, simply clip lead
  if (kws.length === 0) {
    return clipAtSentenceBoundary(cleaned, maxChars);
  }

  // 2. If the text within the initial slice already contains all/any focusKeyword, clip directly
  const initialSlice = cleaned.slice(0, maxChars);
  if (kws.some((kw) => matchesKeyword(initialSlice, kw))) {
    return clipAtSentenceBoundary(cleaned, maxChars);
  }

  // 3. Find the best matching position for focusKeywords in the entire article
  let bestIdx = -1;
  for (const kw of kws) {
    const idx = cleaned.toLowerCase().indexOf(kw.toLowerCase());
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }

  if (bestIdx !== -1) {
    // Find natural starting boundary before bestIdx (e.g. space or newline 40-70 chars before)
    let start = Math.max(0, bestIdx - 60);
    const prevNewline = cleaned.lastIndexOf('\n', bestIdx);
    const prevSpace = cleaned.lastIndexOf(' ', bestIdx);
    if (prevNewline >= bestIdx - 80) {
      start = prevNewline + 1;
    } else if (prevSpace >= bestIdx - 60) {
      start = prevSpace + 1;
    }

    // Take a passage from start up to ~600 characters
    const passageSlice = cleaned.slice(start, start + 600);
    const passage = clipAtSentenceBoundary(passageSlice, 580);

    // Lead prefix (first sentence or up to 250 chars)
    let leadPrefix = clipAtSentenceBoundary(cleaned, 250);
    if (!leadPrefix.endsWith('...')) leadPrefix += '...';

    const combined = `${leadPrefix}\n${passage}`;
    return clipAtSentenceBoundary(combined, maxChars);
  }

  return clipAtSentenceBoundary(cleaned, maxChars);
}

export function computeRelevance(hitOrTitle, rawQuery) {
  const hit = typeof hitOrTitle === 'object' && hitOrTitle !== null
    ? hitOrTitle
    : { title: String(hitOrTitle || '') };

  const normTitle = (hit.title || '').toLowerCase().trim();
  const redirect = (hit.redirecttitle || '').toLowerCase().trim();
  const snippet = (hit.snippet || '').replace(/<[^>]+>/g, '').toLowerCase().trim();
  const query = (rawQuery || '').toLowerCase().trim();
  const expandedQuery = expandAbbreviations(query).toLowerCase().trim();

  // Multi-token subject anchor check:
  // When a query has multiple space-separated words (e.g. "แมว ช็อกโกแลต"), the primary subject is the first word.
  // If the primary subject is completely absent from title and redirect, reject hit (< 0.35).
  const queryWords = query.split(/[\s\-()/,]+/).filter((w) => w.length > 1);
  if (queryWords.length > 1) {
    const primaryWord = queryWords[0];
    const hasPrimary = normTitle.includes(primaryWord) ||
      redirect.includes(primaryWord) ||
      (expandedQuery && (normTitle.includes(expandedQuery.split(/\s+/)[0]) || redirect.includes(expandedQuery.split(/\s+/)[0])));
    if (!hasPrimary) {
      return 0.1;
    }
  }

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

  // 4. Thai Bigram Containment for compound words with infixes (e.g. นายกไทย vs นายกรัฐมนตรีไทย)
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

  // 5. Token match fallback for whitespace-separated words
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

async function fetchWikiExtract(lang, query, focusKeywords = []) {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
  const searchUrl = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srprop=snippet|redirecttitle&format=json&srlimit=5&utf8=1`;

  const searchData = await fetchWikiJson(searchUrl);
  const hits = searchData?.query?.search;
  if (!Array.isArray(hits) || hits.length === 0) return null;

  // Rank hits by relevance
  const scoredHits = hits.map((hit) => ({
    hit,
    score: computeRelevance(hit, query)
  })).filter((h) => h.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  if (scoredHits.length === 0) {
    return null;
  }

  // Iterate over candidates in score order to skip disambiguation pages
  for (const { hit } of scoredHits) {
    const extractUrl = `${endpoint}?action=query&prop=extracts|pageprops&explaintext=1&pageids=${hit.pageid}&format=json&utf8=1`;
    const extractData = await fetchWikiJson(extractUrl);
    const page = extractData?.query?.pages?.[hit.pageid];
    const rawExtract = page?.extract?.trim();

    if (!rawExtract) continue;

    // Disambiguation check
    if (page?.pageprops && 'disambiguation' in page.pageprops) {
      continue;
    }
    const leadSample = rawExtract.slice(0, 150).toLowerCase();
    if (leadSample.includes('อาจหมายถึง') || leadSample.includes('may refer to') || leadSample.includes('can refer to')) {
      continue;
    }

    const cleanExtract = buildFocusedExtract(rawExtract, focusKeywords, MAX_EXTRACT_CHARS);
    if (!cleanExtract) continue;

    return {
      title: hit.title,
      extract: cleanExtract
    };
  }

  return null;
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

    const { canonicalTopic, focusKeywords, searchCandidates } = normalizeQuery(rawTopic);
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
        // 1. Thai Wikipedia first for all candidates (even English names like ChatGPT, Python)
        result = await fetchWikiExtract('th', candidate, focusKeywords);

        // 2. Fallback to English Wikipedia
        if (!result) {
          result = await fetchWikiExtract('en', candidate, focusKeywords);
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