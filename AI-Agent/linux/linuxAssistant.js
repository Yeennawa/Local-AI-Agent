// Deep Module: Linux Assistant
// Curated catalog-first Linux command generator & safety engine.
// Zero hallucinated flags, zero unvetted shell execution.

import { matchLinuxCatalog } from './catalog.js';
import { validateLinuxCommand } from './commandGuard.js';
import { queryOllama } from '../ollamaClient.js';

const RISK_BADGES = {
  read: '**[ความปลอดภัย: อ่านอย่างเดียว (ปลอดภัยสำหรับบอร์ด Pi)]**',
  modify: '**[ความปลอดภัย: ปรับเปลี่ยนสถานะระบบ (แนะนำนำไปรันด้วยตนเอง)]**',
  destructive: '**[ความปลอดภัย: อันตรายสูง (ระบบไม่อนุญาตให้รัน)]**'
};

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0, isDeterministic: true };

const buildReply = ({
  ok = false,
  fromCatalog = false,
  recipeId = undefined,
  command = '',
  titleThai = '',
  explainThai = '',
  flags = [],
  risk = 'read',
  canExecute = false,
  text = '',
  feeling = 'neutral',
  usage = ZERO_USAGE
}) => ({
  ok,
  fromCatalog,
  ...(recipeId ? { recipeId } : {}),
  command,
  titleThai,
  explainThai,
  flags,
  risk,
  canExecute,
  text,
  feeling,
  usage
});

/**
 * Formats structured Linux command details into clean GitHub-style Markdown.
 *
 * @param {Object} item
 * @returns {string}
 */
export function formatLinuxMarkdown(item) {
  const parts = [];
  if (item.titleThai) parts.push(`### ${item.titleThai}`);
  parts.push(RISK_BADGES[item.risk] || RISK_BADGES.destructive);
  if (item.explainThai) parts.push(item.explainThai);
  parts.push('```bash\n' + item.command + '\n```');

  if (Array.isArray(item.flags) && item.flags.length > 0) {
    const rows = item.flags.map((f) => `| \`${f.flag}\` | ${f.meaningThai} |`);
    parts.push(['#### รายละเอียด Flag และตัวแปรคำสั่ง', '| Flag / Parameter | คำอธิบายความหมาย |', '| :--- | :--- |', ...rows].join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * Handles a Linux Assistant query using Catalog-First strategy with Fallback to guarded LLM.
 *
 * @param {string} query
 * @param {Object} options
 * @param {Function} [options.chatFn]
 * @param {string} [options.model]
 * @returns {Promise<Object>}
 */
export async function handleLinuxAssistantQuery(query, { chatFn, model } = {}) {
  // 1. Try curated catalog first (0 tokens, deterministic, 100% accurate)
  const catalogMatch = matchLinuxCatalog(query);
  if (catalogMatch) {
    return buildReply({
      ok: true,
      fromCatalog: true,
      recipeId: catalogMatch.id,
      command: catalogMatch.command,
      titleThai: catalogMatch.titleThai,
      explainThai: catalogMatch.explainThai,
      flags: catalogMatch.flags,
      risk: catalogMatch.risk,
      canExecute: catalogMatch.canExecute,
      text: formatLinuxMarkdown(catalogMatch),
      feeling: 'neutral',
      usage: ZERO_USAGE
    });
  }

  // 2. Fallback to guarded LLM with structured JSON schema
  const systemPrompt = [
    'You are an expert Linux Systems Engineer on a Raspberry Pi 5 running Debian/Raspberry Pi OS.',
    'The user is asking for a Linux command.',
    'Output a STRICT JSON object with the following fields only:',
    '- command: (string) The exact safe Linux command line.',
    '- titleThai: (string) A concise title in Thai explaining what the command does.',
    '- explainThai: (string) A clear Thai explanation of the command operation.',
    '- flags: (array of { flag: string, meaningThai: string }) Breakdown of each flag used.',
    'CRITICAL RULES:',
    '- Never suggest destructive commands like rm -rf, dd, mkfs, reboot, or shutdown.',
    '- Prefer standard POSIX/Debian core utilities (df, free, ps, ip, ss, find, grep).',
    '- Strictly zero emojis.'
  ].join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: String(query || '').trim() }
  ];

  try {
    let rawContent = '{}';
    let usage = null;

    if (typeof chatFn === 'function') {
      const reply = await chatFn({
        messages,
        format: 'json',
        options: { temperature: 0.1, num_predict: 512 }
      });
      rawContent = typeof reply === 'string' ? reply : (reply?.message?.content || reply?.text || '{}');
      usage = reply?.usage || null;
    } else {
      const details = await queryOllama({
        messages,
        format: 'json',
        model: model || undefined,
        temperature: 0.1,
        numPredict: 512,
        returnDetails: true
      });
      rawContent = details?.text || '{}';
      if (details?.meta) {
        const promptTokens = details.meta.promptEvalCount || 0;
        const completionTokens = details.meta.evalCount || 0;
        usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, isDeterministic: false };
      }
    }

    const cleanJson = String(rawContent).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      return buildReply({
        ok: false,
        titleThai: 'การประมวลผลคำสั่งขัดข้อง',
        explainThai: 'โมเดลไม่สามารถสร้างโครงสร้างคำสั่งที่สมบูรณ์ได้',
        risk: 'destructive',
        text: 'ขออภัย ไม่สามารถประมวลผลโครงสร้างคำสั่งได้อย่างถูกต้อง กรุณาลองถามด้วยถ้อยคำที่เฉพาะเจาะจงขึ้น',
        feeling: 'confused'
      });
    }

    const command = typeof parsed.command === 'string' ? parsed.command.trim() : '';
    const guard = validateLinuxCommand(command);

    if (!guard.ok || guard.risk === 'destructive') {
      return buildReply({
        ok: false,
        command,
        titleThai: 'คำสั่งถูกปฏิเสธด้วยเหตุผลด้านความปลอดภัย',
        explainThai: guard.reasons.join(' '),
        risk: 'destructive',
        text: `ระบบความปลอดภัย Command Guard ตรวจพบว่าคำสั่งมีความเสี่ยง: ${guard.reasons.join(', ')}\n\nคำสั่ง: \`${command}\``,
        feeling: 'confused'
      });
    }

    const resultItem = {
      command,
      titleThai: parsed.titleThai || 'คำสั่ง Linux',
      explainThai: parsed.explainThai || '',
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      risk: guard.risk,
      canExecute: guard.canExecute
    };

    return buildReply({
      ok: true,
      ...resultItem,
      text: formatLinuxMarkdown(resultItem),
      feeling: 'neutral',
      usage
    });
  } catch {
    return buildReply({
      ok: false,
      titleThai: 'ระบบผู้ช่วย Linux ขัดข้องชั่วคราว',
      explainThai: 'ไม่สามารถเชื่อมต่อกับโมเดลภาษาเพื่อสร้างคำสั่งได้ในขณะนี้',
      risk: 'read',
      text: 'ไม่พบคำสั่งในคลังมาตรฐาน และไม่สามารถเชื่อมต่อกับโมเดลได้ในขณะนี้ กรุณาลองระบุคำสั่งพื้นฐาน เช่น พื้นที่ดิสก์, ตรวจสอบ RAM, หรือดูโพรเซส',
      feeling: 'confused'
    });
  }
}
