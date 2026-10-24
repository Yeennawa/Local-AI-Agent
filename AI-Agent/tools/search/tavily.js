// Tavily Search Provider & Live Server Diagnostics Engine (Deep Module)
// Supports dynamic .env hot-reloading (mtime tracking without server restart),
// explicit failure classification (401 auth, 429/432 quota, DNS/network, timeout),
// and safe credential-masked diagnostics for local and Cloudflare Tunnel deployments.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_FETCH_TIMEOUT_MS = 12000;

let manualOverride = undefined;
let dotenvCache = {
  filePath: null,
  mtimeMs: 0,
  key: null,
  source: 'none'
};

let lastTelemetry = {
  statusCode: null,
  httpStatus: null,
  latencyMs: null,
  checkedAt: null,
  detail: null
};

function cleanEnvValue(rawVal) {
  if (typeof rawVal !== 'string') return '';
  let val = rawVal.replace(/\r/g, '').trim();
  val = val.split(/\s+#/)[0].trim();
  val = val.replace(/^["']|["']$/g, '').trim();
  return val;
}

function resolveKeyWithSource() {
  if (manualOverride !== undefined) {
    return {
      key: manualOverride || null,
      source: manualOverride ? 'override' : 'none'
    };
  }

  if (typeof process.env.TAVILY_API_KEY === 'string') {
    const fromEnv = cleanEnvValue(process.env.TAVILY_API_KEY);
    if (fromEnv) {
      return { key: fromEnv, source: 'env_var' };
    }
  }

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const baseDirs = [
      path.resolve(currentDir, '../../..'),
      path.resolve(process.cwd()),
      path.resolve(process.cwd(), '..')
    ];

    for (const dir of baseDirs) {
      const candidates = [
        { file: path.join(dir, '.env'), source: 'dotenv_file' },
        { file: path.join(dir, '.env.txt'), source: 'dotenv_txt_file' }
      ];

      for (const { file, source } of candidates) {
        if (!fs.existsSync(file)) continue;
        const stat = fs.statSync(file);
        if (dotenvCache.filePath === file && dotenvCache.mtimeMs === stat.mtimeMs && dotenvCache.key) {
          return { key: dotenvCache.key, source: dotenvCache.source };
        }
        if (dotenvCache.filePath === file && dotenvCache.mtimeMs !== stat.mtimeMs) {
          dotenvCache = { filePath: null, mtimeMs: 0, key: null, source: 'none' };
        }

        const content = fs.readFileSync(file, 'utf8');
        for (const rawLine of content.split(/\r?\n/)) {
          const trimmed = rawLine.trim();
          const match = trimmed.match(/^(?:export\s+)?TAVILY_API_KEY\s*=\s*(.*)$/);
          if (match) {
            const val = cleanEnvValue(match[1]);
            if (val) {
              dotenvCache = { filePath: file, mtimeMs: stat.mtimeMs, key: val, source };
              return { key: val, source };
            }
          }
        }
      }
    }
  } catch {
    // Non-fatal if filesystem is inaccessible
  }

  return { key: null, source: 'none' };
}

export function getTavilyApiKey() {
  return resolveKeyWithSource().key;
}

export function isTavilyConfigured() {
  return Boolean(getTavilyApiKey());
}

export function resetCachedTavilyApiKey(override = undefined) {
  manualOverride = override;
  dotenvCache = { filePath: null, mtimeMs: 0, key: null, source: 'none' };
  lastTelemetry = {
    statusCode: null,
    httpStatus: null,
    latencyMs: null,
    checkedAt: null,
    detail: null
  };
}

function maskCredentialSafely(key) {
  if (!key || typeof key !== 'string') return null;
  if (key.length <= 6) return '****';
  return `****...${key.slice(-4)}`;
}

function describeStatusThai(statusCode, keySource) {
  switch (statusCode) {
    case 'verified_ok':
      return {
        title: 'เชื่อมต่อสำเร็จ (Tavily AI พร้อมใช้งาน)',
        advice: keySource === 'dotenv_txt_file'
          ? 'ใช้งานได้ แต่พบว่าไฟล์ชื่อ .env.txt แนะนำให้เปลี่ยนชื่อเป็น .env เพื่อความถูกต้อง'
          : 'เซิร์ฟเวอร์เชื่อมต่อกับ Tavily API ได้ปกติสมบูรณ์'
      };
    case 'configured_ready':
      return {
        title: 'พบ API Key แล้ว (รอการเรียกใช้งาน)',
        advice: 'สามารถกดปุ่ม "ทดสอบ Tavily API" เพื่อเช็กโควตาและการเชื่อมต่อจากเซิร์ฟเวอร์ได้ทันที'
      };
    case 'key_missing':
      return {
        title: 'ไม่พบ Tavily API Key บนเซิร์ฟเวอร์',
        advice: 'กรุณาสร้างไฟล์ .env ที่โฟลเดอร์หลักของเครื่องที่รัน Server แล้วใส่ TAVILY_API_KEY=... (ระบบรองรับการโหลดอัตโนมัติโดยไม่ต้องรีสตาร์ต)'
      };
    case 'key_invalid_format':
      return {
        title: 'รูปแบบ API Key ไม่สมบูรณ์',
        advice: 'ตรวจสอบค่า TAVILY_API_KEY ในไฟล์ .env ของเครื่อง Server ว่าคัดลอกมาครบถ้วนและไม่มีช่องว่างคั่นกลาง'
      };
    case 'auth_failed_401':
      return {
        title: 'API Key ไม่ถูกต้องหรือถูกปฏิเสธ (HTTP 401)',
        advice: 'Key ที่ตั้งไว้บนเครื่อง Server ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิก กรุณาตรวจสอบ Key ในหน้า Dashboard ของ Tavily ใหม่'
      };
    case 'quota_exceeded_429':
      return {
        title: 'โควตาการใช้งาน Tavily เต็ม (HTTP 429 / 432)',
        advice: 'บัญชี Tavily บนเครื่อง Server ใช้โควตาครบกำหนดแล้ว (Free Tier 1,000 ครั้ง/เดือน) ระบบจึงสลับไปใช้ DuckDuckGo แทนอัตโนมัติ'
      };
    case 'timeout':
      return {
        title: 'การเชื่อมต่อ Tavily หมดเวลา (Timeout)',
        advice: 'เครื่อง Server ใช้เวลาเชื่อมต่อไปยัง api.tavily.com นานเกินกำหนด กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตของบอร์ด'
      };
    case 'network_error':
      return {
        title: 'เครื่อง Server ไม่สามารถออกอินเทอร์เน็ตไปหา Tavily ได้',
        advice: 'เกิดปัญหา DNS หรือเครือข่ายฝั่งเครื่อง Server (เช่น Wi-Fi หลุด หรือ Firewall บล็อก api.tavily.com)'
      };
    case 'server_error_5xx':
      return {
        title: 'ระบบปลายทางของ Tavily ขัดข้องชั่วคราว (HTTP 5xx)',
        advice: 'เซิร์ฟเวอร์ของ Tavily มีปัญหาชั่วคราว ระบบได้สลับไปใช้ DuckDuckGo สำรองให้แล้ว'
      };
    default:
      return {
        title: `พบข้อผิดพลาดจาก Tavily (${statusCode || 'unknown'})`,
        advice: 'ระบบสลับไปใช้ตัวค้นหาสำรองอัตโนมัติ กรุณาตรวจสอบการตั้งค่าบนเครื่อง Server'
      };
  }
}

export async function searchTavily({ query, signal, maxResults = 3, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const { key: apiKey } = resolveKeyWithSource();
  if (!apiKey) {
    lastTelemetry = {
      statusCode: 'key_missing',
      httpStatus: null,
      latencyMs: 0,
      checkedAt: Date.now(),
      detail: 'TAVILY_API_KEY is not configured'
    };
    return { success: false, reason: 'key_missing', results: [] };
  }

  const abortSignal = signal || AbortSignal.timeout(timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: maxResults
      }),
      signal: abortSignal
    });

    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        const extracted = errBody?.detail?.error || errBody?.error || errBody?.message;
        if (typeof extracted === 'string' && extracted.trim()) {
          errDetail = extracted.trim();
        }
      } catch {
        // Ignore JSON parse error on error body
      }

      let reason = `http_${res.status}`;
      if (res.status === 401 || res.status === 403) {
        reason = 'auth_failed_401';
      } else if (res.status === 429 || res.status === 432 || res.status === 402) {
        reason = 'quota_exceeded_429';
      } else if (res.status >= 500) {
        reason = 'server_error_5xx';
      }

      lastTelemetry = {
        statusCode: reason,
        httpStatus: res.status,
        latencyMs,
        checkedAt: Date.now(),
        detail: errDetail
      };

      return { success: false, reason, httpStatus: res.status, detail: errDetail, results: [] };
    }

    const data = await res.json();
    lastTelemetry = {
      statusCode: 'verified_ok',
      httpStatus: 200,
      latencyMs,
      checkedAt: Date.now(),
      detail: 'OK'
    };

    if (!Array.isArray(data?.results)) {
      return { success: true, answer: data?.answer || null, results: [] };
    }

    const results = data.results.map((item) => ({
      title: item.title || 'Untitled',
      snippet: (item.content || '').replace(/\s+/g, ' ').trim(),
      url: item.url || ''
    })).filter((item) => item.snippet.length > 0);

    return { success: true, answer: data?.answer || null, results };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout|timed out/i.test(err?.message || '');
    const reason = isTimeout ? 'timeout' : 'network_error';

    lastTelemetry = {
      statusCode: reason,
      httpStatus: null,
      latencyMs,
      checkedAt: Date.now(),
      detail: err?.message || reason
    };

    return {
      success: false,
      reason,
      detail: err?.message || reason,
      results: []
    };
  }
}

export async function getTavilyDiagnostics({ probe = false } = {}) {
  const { key, source } = resolveKeyWithSource();

  if (!key) {
    const info = describeStatusThai('key_missing', source);
    return {
      configured: false,
      usable: false,
      statusCode: 'key_missing',
      keySource: source,
      maskedKey: null,
      hasValidPrefix: false,
      keyLength: 0,
      statusTitleThai: info.title,
      troubleshootingThai: info.advice,
      lastLatencyMs: null,
      lastCheckAt: lastTelemetry.checkedAt
    };
  }

  const hasValidPrefix = key.startsWith('tvly-');
  const looksPlausibleLength = key.length >= 12;

  if (probe) {
    await searchTavily({ query: 'Raspberry Pi 5', maxResults: 1, timeoutMs: 10000 });
  }

  let effectiveStatus = lastTelemetry.statusCode;
  if (!effectiveStatus) {
    effectiveStatus = (hasValidPrefix && looksPlausibleLength) ? 'configured_ready' : 'key_invalid_format';
  }

  const usable = effectiveStatus === 'verified_ok' || effectiveStatus === 'configured_ready';
  const info = describeStatusThai(effectiveStatus, source);

  return {
    configured: true,
    usable,
    statusCode: effectiveStatus,
    httpStatus: lastTelemetry.httpStatus,
    keySource: source,
    maskedKey: maskCredentialSafely(key),
    hasValidPrefix,
    keyLength: key.length,
    statusTitleThai: info.title,
    troubleshootingThai: info.advice,
    lastLatencyMs: lastTelemetry.latencyMs,
    lastCheckAt: lastTelemetry.checkedAt
  };
}
