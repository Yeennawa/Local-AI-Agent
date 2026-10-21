// DuckDuckGo Search Provider for Local AI Agent
// Clean provider function returning normalized { success, results } without tool wrapper.

const DEFAULT_FETCH_TIMEOUT_MS = 3000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

export function parseDuckDuckGoHtml(html, maxResults = 3) {
  if (typeof html !== 'string') return [];
  const results = [];

  const blockRegex = /<h2[^>]*class=["'][^"']*result__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>[\s\S]*?(?:<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>|<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>)/gi;

  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
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

export async function searchDuckDuckGo({ query, signal, maxResults = 3, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const abortSignal = signal || AbortSignal.timeout(timeoutMs);

  try {
    const ddgUrl = 'https://html.duckduckgo.com/html/';
    const body = new URLSearchParams({ q: query }).toString();

    const res = await fetch(ddgUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body,
      signal: abortSignal
    });

    if (!res.ok) {
      return { success: false, reason: `http_${res.status}`, results: [] };
    }

    const html = await res.text();
    const results = parseDuckDuckGoHtml(html, maxResults);
    return { success: true, results };
  } catch (err) {
    return {
      success: false,
      reason: err?.name === 'TimeoutError' ? 'timeout' : (err?.message || 'network_error'),
      results: []
    };
  }
}
