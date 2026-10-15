// News Tool: RSS headlines by category, or Google News search for any free-text topic.
// Keeps output tiny (4 short headlines) so the 1.5B model can read it, caches in RAM only
// (no disk writes, protects the MicroSD), and reports honestly when nothing is found.

import { parseFeed } from './feedParser.js';

const FETCH_TIMEOUT_MS = 3500;
const MAX_ITEMS = 4;
const MAX_TITLE_CHARS = 90;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
const USER_AGENT = 'LocalAIAgent/1.0 (+https://github.com/Yeennawa/Local-AI-Agent)';

const GNEWS = 'https://news.google.com/rss';
const gnewsTopic = (topic) => ({
  name: 'Google News',
  url: `${GNEWS}/headlines/section/topic/${topic}?hl=th&gl=TH&ceid=TH:th`
});

// Ordered by trust: the first feed that returns items wins, the rest are fallbacks.
const CATEGORY_FEEDS = {
  thai: [
    { name: 'BBC Thai', url: 'https://feeds.bbci.co.uk/thai/rss.xml' },
    { name: 'Thairath', url: 'https://www.thairath.co.th/rss/news' },
    gnewsTopic('NATION')
  ],
  world: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    gnewsTopic('WORLD')
  ],
  tech: [gnewsTopic('TECHNOLOGY'), { name: 'Hacker News', url: 'https://hnrss.org/frontpage?count=6' }],
  business: [gnewsTopic('BUSINESS')],
  sports: [gnewsTopic('SPORTS')],
  science: [gnewsTopic('SCIENCE')],
  health: [gnewsTopic('HEALTH')],
  entertainment: [gnewsTopic('ENTERTAINMENT')]
};

export const NEWS_CATEGORIES = Object.keys(CATEGORY_FEEDS);

function queryFeed(query) {
  const thai = /[\u0E00-\u0E7F]/.test(query);
  const locale = thai ? 'hl=th&gl=TH&ceid=TH:th' : 'hl=en-US&gl=US&ceid=US:en';
  return { name: 'Google News', url: `${GNEWS}/search?q=${encodeURIComponent(query)}&${locale}` };
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatItem(item) {
  const title = clip(item.title, MAX_TITLE_CHARS);
  return item.published ? `${title} (${item.published})` : title;
}

export function createNewsTool({ fetchFn = fetch, now = Date.now } = {}) {
  const cache = new Map();

  function readCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (now() - entry.at > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function writeCache(key, data) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { data, at: now() });
  }

  // Never rejects: a dead feed is just "no items", but a dead network is reported separately.
  async function loadFeed(feed) {
    try {
      const res = await fetchFn(feed.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!res.ok) return { feed, items: [] };
      return { feed, items: parseFeed(await res.text()) };
    } catch (error) {
      return { feed, items: [], networkError: error?.name === 'TypeError' };
    }
  }

  async function execute(params = {}) {
    const query = typeof params.query === 'string' ? params.query.trim() : '';
    const category = typeof params.category === 'string' ? params.category.trim().toLowerCase() : '';

    if (!query && !category) {
      return { error: 'Provide a category or a query' };
    }

    const feeds = query ? [queryFeed(query)] : (CATEGORY_FEEDS[category] || CATEGORY_FEEDS.thai);
    const label = query || category;
    const cacheKey = `${query ? 'q' : 'c'}:${label.toLowerCase()}`;

    const cached = readCache(cacheKey);
    if (cached) return cached;

    // Start every feed at once (bounded by the timeout), then take the first healthy one in
    // priority order so slow fallbacks never delay a good primary.
    const pending = feeds.map(loadFeed);
    const loaded = [];
    let winner = null;
    for (const request of pending) {
      const result = await request;
      loaded.push(result);
      if (result.items.length > 0) {
        winner = result;
        break;
      }
    }

    if (!winner) {
      const offline = loaded.every((r) => r.networkError);
      return {
        found: false,
        message: offline
          ? 'ขณะนี้ระบบออฟไลน์ ไม่สามารถเชื่อมต่อแหล่งข่าวได้'
          : `ไม่พบข่าวเกี่ยวกับ "${label}" ในแหล่งข่าวที่เชื่อมต่อไว้`
      };
    }

    const payload = {
      found: true,
      source: winner.feed.name,
      items: winner.items.slice(0, MAX_ITEMS).map(formatItem)
    };
    writeCache(cacheKey, payload);
    return payload;
  }

  return {
    name: 'get_news',
    description: `Get latest news headlines. Use category (${NEWS_CATEGORIES.join('|')}) or a free-text query for any topic.`,
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'News category: thai, world, tech, business, sports, science, health, entertainment' },
        query: { type: 'string', description: 'Any news topic to search for' }
      },
      required: []
    },
    dangerous: false,
    execute
  };
}

export const newsTool = createNewsTool();
