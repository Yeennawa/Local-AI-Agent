// Foreign Exchange (FX) Currency Tool
// Fast, keyless currency exchange rate queries via open.er-api.com
// Features 1-hour in-memory caching to minimize network usage on Raspberry Pi 5.

const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 20;
const USER_AGENT = 'LocalAIAgent/1.0 (+https://github.com/Yeennawa/Local-AI-Agent)';

const CURRENCY_ALIASES = {
  'ดอลลาร์': 'USD',
  'ดอลลาร์สหรัฐ': 'USD',
  'เหรียญสหรัฐ': 'USD',
  'บาท': 'THB',
  'บาทไทย': 'THB',
  'เยน': 'JPY',
  'เงินเยน': 'JPY',
  'ยูโร': 'EUR',
  'ปอนด์': 'GBP',
  'ปอนด์สเตอริง': 'GBP',
  'หยวน': 'CNY',
  'เงินหยวน': 'CNY',
  'วอน': 'KRW',
  'เงินวอน': 'KRW',
  'ดอลลาร์สิงคโปร์': 'SGD',
  'ดอลลาร์ฮ่องกง': 'HKD',
  'ดอลลาร์ออสเตรเลีย': 'AUD',
  'ฟรังก์สวิส': 'CHF'
};

export function normalizeCurrencyCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const alias = CURRENCY_ALIASES[trimmed] || CURRENCY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed.toUpperCase();
}

export function createFxTool({ fetchFn = fetch, now = Date.now } = {}) {
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
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(key, { data, at: now() });
  }

  async function execute(params = {}) {
    const baseCode = normalizeCurrencyCode(params.base || 'USD');
    const targetCode = normalizeCurrencyCode(params.target || 'THB');
    const amount = Number(params.amount) > 0 ? Number(params.amount) : 1;

    const cacheKey = baseCode;
    let ratesData = readCache(cacheKey);

    if (!ratesData) {
      try {
        const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCode)}`;
        const res = await fetchFn(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });

        if (!res.ok) {
          return {
            found: false,
            message: `ไม่สามารถดึงอัตราแลกเปลี่ยนสำหรับสกุลเงิน "${baseCode}" ได้ในขณะนี้`
          };
        }

        const json = await res.json();
        if (json.result !== 'success' || !json.rates) {
          return {
            found: false,
            message: `ไม่พบข้อมูลอัตราแลกเปลี่ยนของสกุลเงิน "${baseCode}"`
          };
        }

        ratesData = json;
        writeCache(cacheKey, ratesData);
      } catch (error) {
        const isNetwork = error?.name === 'TypeError' || error?.message?.includes('fetch failed');
        return {
          found: false,
          message: isNetwork
            ? 'ขณะนี้ระบบออฟไลน์ ไม่สามารถเชื่อมต่อบริการอัตราแลกเปลี่ยนได้'
            : `เกิดข้อผิดพลาดในการตรวจสอบอัตราแลกเปลี่ยน: ${error?.message || 'ข้อผิดพลาดเครือข่าย'}`
        };
      }
    }

    const rate = ratesData.rates[targetCode];
    if (typeof rate !== 'number') {
      return {
        found: false,
        message: `ไม่พบอัตราแลกเปลี่ยนเทียบกับสกุลเงิน "${targetCode}"`
      };
    }

    const converted = Math.round(amount * rate * 100) / 100;
    const updateDate = ratesData.time_last_update_utc
      ? new Date(ratesData.time_last_update_utc).toISOString().slice(0, 10)
      : '';

    return {
      found: true,
      base: baseCode,
      target: targetCode,
      rate,
      amount,
      converted,
      date: updateDate
    };
  }

  return {
    name: 'get_fx',
    description: 'Get foreign exchange rates and currency conversion (e.g. USD to THB, JPY, EUR).',
    parameters: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Base currency code or Thai name (default: USD)' },
        target: { type: 'string', description: 'Target currency code or Thai name (default: THB)' },
        amount: { type: 'number', description: 'Amount to convert (default: 1)' }
      },
      required: []
    },
    dangerous: false,
    execute
  };
}

export const fxTool = createFxTool();
