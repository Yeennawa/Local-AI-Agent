// Open-Meteo Weather Tool
// Free, keyless global weather and geocoding API.
// Features in-memory LRU caching with 15-minute TTL to preserve Pi network and CPU.

const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const USER_AGENT = 'LocalAIAgent/1.0 (+https://github.com/Yeennawa/Local-AI-Agent)';

const WMO_CODES = {
  0: 'ท้องฟ้าแจ่มใส',
  1: 'ท้องฟ้าโปร่งเกือบทั้งหมด',
  2: 'มีเมฆบางส่วน',
  3: 'มีเมฆมาก/ครึ้มฟ้าครึ้มฝน',
  45: 'มีหมอกหนา',
  48: 'มีหมอกลงจัดและน้ำค้างแข็ง',
  51: 'มีฝนละอองเล็กน้อย',
  53: 'มีฝนละอองปานกลาง',
  55: 'มีฝนละอองหนาแน่น',
  61: 'มีฝนตกเล็กน้อย',
  63: 'มีฝนตกปานกลาง',
  65: 'มีฝนตกหนัก',
  71: 'มีหิมะตกเล็กน้อย',
  73: 'มีหิมะตกปานกลาง',
  75: 'มีหิมะตกหนัก',
  80: 'มีฝนฟ้าคะนองโปรยปราย',
  81: 'มีฝนตกชุกเป็นระลอก',
  82: 'มีฝนตกกระหน่ำรุนแรง',
  95: 'มีพายุฝนฟ้าคะนอง',
  96: 'มีพายุฝนฟ้าคะนองและลูกเห็บตกเล็กน้อย',
  99: 'มีพายุฝนฟ้าคะนองและลูกเห็บตกหนัก'
};

export function getWeatherConditionText(code) {
  return WMO_CODES[code] || 'สภาพอากาศทั่วไป';
}

export function createWeatherTool({ fetchFn = fetch, now = Date.now } = {}) {
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

  async function fetchJson(url) {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function execute(params = {}) {
    const rawLocation = typeof params.location === 'string' ? params.location.trim() : '';
    const locationQuery = rawLocation || 'Bangkok';
    const cacheKey = locationQuery.toLowerCase();

    const cached = readCache(cacheKey);
    if (cached) return cached;

    try {
      // 1. Geocoding lookup
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=th&format=json`;
      const geoData = await fetchJson(geocodeUrl);
      const hit = geoData?.results?.[0];

      if (!hit) {
        return {
          found: false,
          message: `ไม่พบข้อมูลพิกัดสถานที่สำหรับ "${locationQuery}" กรุณาระบุชื่อเมืองหรือจังหวัดให้ชัดเจนขึ้นครับ`
        };
      }

      const { name, latitude, longitude, country } = hit;
      const resolvedLocation = country ? `${name}, ${country}` : name;

      // 2. Weather forecast lookup
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const weatherData = await fetchJson(forecastUrl);

      if (!weatherData?.current) {
        return {
          found: false,
          message: `ไม่สามารถดึงข้อมูลพยากรณ์อากาศของ "${resolvedLocation}" ได้ในขณะนี้`
        };
      }

      const current = weatherData.current;
      const daily = weatherData.daily;
      const condition = getWeatherConditionText(current.weather_code);

      const payload = {
        found: true,
        location: resolvedLocation,
        temperatureC: current.temperature_2m,
        humidityPercent: current.relative_humidity_2m,
        condition,
        maxTempC: daily?.temperature_2m_max?.[0] ?? current.temperature_2m,
        minTempC: daily?.temperature_2m_min?.[0] ?? current.temperature_2m
      };

      writeCache(cacheKey, payload);
      return payload;
    } catch (error) {
      const isNetwork = error?.name === 'TypeError' || error?.message?.includes('fetch failed');
      return {
        found: false,
        message: isNetwork
          ? 'ขณะนี้ระบบออฟไลน์ ไม่สามารถเชื่อมต่อบริการสภาพอากาศได้'
          : `เกิดข้อผิดพลาดในการตรวจสอบสภาพอากาศ: ${error?.message || 'ข้อผิดพลาดเครือข่าย'}`
      };
    }
  }

  return {
    name: 'get_weather',
    description: 'Get current weather and daily forecast for any city or province (e.g. Bangkok, เชียงใหม่, Tokyo).',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City, province, or district name (default: Bangkok)'
        }
      },
      required: []
    },
    dangerous: false,
    execute
  };
}

export const weatherTool = createWeatherTool();
