// Deep Module: Two-Pass Self-Reflection & Verification Engine (reflection.js)
// Inspects initial draft synthesis for CJK leakage, factual contradiction,
// premature brevity, and truncation defects, executing Pass 2 LLM refinement if needed.
// Designed for Raspberry Pi 5 with zero extra external calls when draft is clean.

import { inspectCJKLeakage, cleanCJKLeakage, buildLanguageDirectives } from './languageGuard.js';
import { isFalselyPositiveAnswer } from './safety.js';
import { polishAnswerText } from './answer.js';
import { queryOllama } from './ollamaClient.js';

export function inspectDraftQuality({
  draft = '',
  userQuery = '',
  referenceText = '',
  dominantLanguage = 'th'
} = {}) {
  const text = typeof draft === 'string' ? draft.trim() : '';
  const defects = [];
  const critiquePoints = [];

  // 1. CJK Character Leakage Guard
  const cjkCheck = inspectCJKLeakage(text, { dominantLanguage });
  if (cjkCheck.hasLeak) {
    defects.push('cjk_leakage');
    critiquePoints.push(`พบตัวอักษรจีนปะปนในคำตอบ (${cjkCheck.cjkChars.join(', ')}) ห้ามใช้อักษรจีนในคำตอบนี้เด็ดขาด`);
  }

  // 2. Factual / Polarity Safety Contradiction
  if (referenceText && isFalselyPositiveAnswer(text, referenceText)) {
    defects.push('polarity_contradiction');
    critiquePoints.push('คำตอบขัดแย้งกับคำเตือนความปลอดภัยในข้อมูลอ้างอิง (เช่น ห้ามกิน หรือ มีพิษ)');
  }

  // 3. Question Echo Guard
  if (userQuery && text.toLowerCase() === userQuery.trim().toLowerCase()) {
    defects.push('echoed_query');
    critiquePoints.push('คำตอบพูดซ้ำคำถามของผู้ใช้โดยไม่ได้ให้ข้อมูลคำตอบจริง');
  }

  // 4. Extreme Brevity on Substantive Knowledge Queries
  const isSubstantiveInquiry = /(?:อธิบาย|ประวัติ|คืออะไร|ทำงานอย่างไร|รายละเอียด|ข้อมูลเกี่ยวกับ|explain|how|why)/i.test(userQuery);
  if (isSubstantiveInquiry && referenceText.length > 120 && text.length < 15) {
    defects.push('insufficient_depth');
    critiquePoints.push('คำตอบสั้นเกินไป ไม่ครอบคลุมประเด็นสำคัญที่มีอยู่ในข้อมูลอ้างอิง');
  }

  // 5. Unbalanced Punctuation / Abrupt Truncation
  const openParen = (text.match(/\(/g) || []).length;
  const closeParen = (text.match(/\)/g) || []).length;
  if (openParen > closeParen) {
    defects.push('unclosed_parenthesis');
    critiquePoints.push('มีวงเล็บเปิดค้างไว้แต่ไม่ได้ปิดประโยคให้สมบูรณ์');
  }

  const needsRefinement = defects.length > 0;
  const critique = critiquePoints.join('\n');

  return {
    needsRefinement,
    defects,
    critique
  };
}

export async function selfReflectAndRefine({
  draft = '',
  userQuery = '',
  referenceText = '',
  dominantLanguage = 'th',
  chatFn = undefined,
  model = 'qwen2.5:1.5b',
  onToken = undefined,
  forceRefinement = false
} = {}) {
  const quality = inspectDraftQuality({ draft, userQuery, referenceText, dominantLanguage });

  if (!quality.needsRefinement && !forceRefinement) {
    const cleanedDraft = cleanCJKLeakage(draft, { dominantLanguage });
    return {
      finalText: polishAnswerText(cleanedDraft, userQuery, referenceText, { doneReason: 'stop' }),
      wasRefined: false,
      defects: [],
      critique: null
    };
  }

  // If no chatFn provided, perform deterministic cleanup
  if (typeof chatFn !== 'function') {
    let fallbackText = cleanCJKLeakage(draft, { dominantLanguage });
    if (quality.defects.includes('polarity_contradiction')) {
      fallbackText = 'จากข้อมูลอ้างอิงระบุว่าสิ่งนี้อาจเป็นอันตราย มีพิษ หรือมีข้อห้ามตามกฎหมาย จึงไม่ควรรับประทานหรือกระทำครับ';
    }
    return {
      finalText: polishAnswerText(fallbackText, userQuery, referenceText, { doneReason: 'stop' }),
      wasRefined: false,
      defects: quality.defects,
      critique: quality.critique
    };
  }

  try {
    const directives = buildLanguageDirectives({ dominantLanguage });
    const systemPrompt = [
      'คุณคือระบบทบทวนและขัดเกลาคำตอบ (Answer Verification & Refinement Engine) ทำงานบน Raspberry Pi 5',
      'ภารกิจ: นำคำตอบฉบับร่างมาปรับปรุงให้ถูกต้อง สมบูรณ์ ตามจุดบกพร่องที่ตรวจพบ โดยยังคงเนื้อหาสำคัญและกระชับ',
      directives
    ].join('\n');

    const critiqueMessage = quality.critique || 'ปรับปรุงภาษาให้สละสลวย ถูกต้อง และกระชับชัดเจน';
    const userPrompt = [
      `คำถามของผู้ใช้: "${userQuery}"`,
      referenceText ? `ข้อมูลอ้างอิง:\n${referenceText}` : '',
      `คำตอบฉบับร่างเดิม:\n${draft}`,
      `จุดบกพร่องที่ต้องแก้ไข:\n${critiqueMessage}`,
      'จงเขียนคำตอบฉบับปรับปรุงใหม่โดยตรง (ไม่พิมพ์คำเกริ่น ไม่พิมพ์จุดบกพร่องซ้ำ ไม่ใช้อักษรจีน):'
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const result = await queryOllama({
      messages,
      model,
      temperature: 0.15,
      numPredict: 768,
      chatFn,
      timeoutMs: 40000,
      stallTimeoutMs: 15000,
      returnDetails: true,
      onToken
    });

    const refinedRaw = typeof result === 'object' && result?.text ? result.text : (typeof result === 'string' ? result : draft);
    const cleanedCJK = cleanCJKLeakage(refinedRaw, { dominantLanguage });
    const finalText = polishAnswerText(cleanedCJK, userQuery, referenceText, { doneReason: result?.doneReason || 'stop' });

    return {
      finalText: finalText || cleanCJKLeakage(draft, { dominantLanguage }),
      wasRefined: true,
      defects: quality.defects,
      critique: quality.critique
    };
  } catch (err) {
    // If Pass 2 refinement fails or times out, safely fall back to cleaned draft
    const fallbackCleaned = cleanCJKLeakage(draft, { dominantLanguage });
    return {
      finalText: polishAnswerText(fallbackCleaned, userQuery, referenceText, { doneReason: 'stop' }),
      wasRefined: false,
      defects: quality.defects,
      critique: quality.critique,
      refinementError: err?.message || 'refinement_failed'
    };
  }
}
