// Minimal RSS 2.0 / Atom parser. No dependencies: keeps RAM and install size small on the Pi.
// Returns plain items so callers never touch raw XML.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function cleanText(raw) {
  if (!raw) return '';
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const noTags = unwrapped.replace(/<[^>]*>/g, ' ');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

function firstTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1] : '';
}

function readLink(block) {
  const text = cleanText(firstTag(block, 'link'));
  if (text) return text;
  const href = block.match(/<link[^>]*\shref=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : '';
}

function toIsoDate(value) {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10);
}

export function parseFeed(xml) {
  if (typeof xml !== 'string' || !xml) return [];

  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const items = [];

  for (const block of blocks) {
    const title = cleanText(firstTag(block, 'title'));
    if (!title) continue;
    items.push({
      title,
      link: readLink(block),
      summary: cleanText(firstTag(block, 'description') || firstTag(block, 'summary')),
      published: toIsoDate(cleanText(firstTag(block, 'pubDate') || firstTag(block, 'updated') || firstTag(block, 'published')))
    });
  }

  return items;
}
