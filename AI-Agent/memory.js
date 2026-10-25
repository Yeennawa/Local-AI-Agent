// Session Memory & Note Memory Ledger (Deep Module)
// In-memory 10-turn conversation ledger with focus entity tracking,
// zero-token meta-recall, QA Note Memory Ledger (save_note / recall_notes),
// and budgeted context assembly.
// Designed for Raspberry Pi 5 to keep RAM overhead minimal (<100KB)
// without causing I/O wear on the MicroSD card (0 Disk Writes).

import { computeThaiBigramContainment, normalizeColloquialThai } from './normalizer.js';

const DEFAULT_MAX_TURNS = 30;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_NOTES = 200;

export class NoteMemoryLedger {
  constructor({ maxNotes = DEFAULT_MAX_NOTES, defaultTtlMs = DEFAULT_TTL_MS } = {}) {
    this.maxNotes = maxNotes;
    this.defaultTtlMs = defaultTtlMs;
    this.notes = new Map();
  }

  saveNote({
    sessionId = 'global',
    query,
    answer,
    topic = null,
    sourceTool = null,
    polarity = 'neutral',
    ttlMs = null
  }) {
    if (!query || !answer) return null;
    const cleanQuery = normalizeColloquialThai(query).trim();
    const canonicalKey = cleanQuery.toLowerCase().replace(/[\s.,?!ฯจ้ะครับค่ะนะ]+/g, '');

    if (!canonicalKey) return null;

    // LRU eviction if capacity reached
    if (this.notes.size >= this.maxNotes) {
      const oldestKey = this.notes.keys().next().value;
      this.notes.delete(oldestKey);
    }

    const duration = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    const note = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: sessionId || 'global',
      canonicalKey,
      rawQuery: query.trim(),
      answer: answer.trim(),
      topic: topic ? topic.trim() : null,
      sourceTool: sourceTool || null,
      polarity,
      createdAt: Date.now(),
      expiresAt: Date.now() + duration
    };

    this.notes.set(note.id, note);
    return note;
  }

  recallNote(query, sessionId = null, { toolMode = 'auto' } = {}) {
    if (!query || typeof query !== 'string') return null;
    const now = Date.now();
    const cleanQuery = normalizeColloquialThai(query).trim();
    const searchKey = cleanQuery.toLowerCase().replace(/[\s.,?!ฯจ้ะครับค่ะนะ]+/g, '');

    if (!searchKey) return null;

    const HAS_MODIFIER_REGEX = /(?:นิดเดียว|ทำไม|เพราะอะไร|อย่างไร|ยังไง|ข้อดี|ข้อเสีย|ถ้า|เมื่อไหร่|กี่กรัม|เท่าไหร่|ต่างกัน|อันตรายแค่ไหน)/;
    const queryHasModifier = HAS_MODIFIER_REGEX.test(query);

    const stripQuestionModal = (str) => str
      .replace(/(?:กินได้ไหม|กินได้หรือเปล่า|กินได้ป่าว|กินได้มั้ย|ได้ไหม|ได้มั้ย|ได้หรือเปล่า|ได้ป่าว|ได้ป่ะ|คืออะไร|คือใคร|มีอะไร|อยู่ที่ไหน|ไหม|มั้ย|หรือเปล่า|ป่าว|ครับ|ค่ะ|นะ|จ๊ะ|จ้า)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const queryCore = stripQuestionModal(cleanQuery).toLowerCase();

    let bestMatch = null;
    let highestSim = 0;

    for (const [id, note] of this.notes.entries()) {
      // Clean up expired notes
      if (now > note.expiresAt) {
        this.notes.delete(id);
        continue;
      }

      // Mode-aware guard: if user is in search mode and note was from Wikipedia, do not recall stale Wiki answer
      if (toolMode === 'search' && note.sourceTool === 'search_wikipedia') {
        continue;
      }

      // Check session compatibility: match if same sessionId, or note is global, or sessionId omitted
      if (sessionId && note.sessionId !== 'global' && note.sessionId !== sessionId) {
        continue;
      }

      // Tier 1: Exact canonical key match
      if (note.canonicalKey === searchKey) {
        return note;
      }

      // If user query has a modifier (e.g. "นิดเดียว", "ทำไม", "ข้อเสีย") but note did not have it,
      // do not return the old answer via fuzzy match (forces fresh synthesis for sub-questions)
      const noteHasModifier = HAS_MODIFIER_REGEX.test(note.rawQuery);
      if (queryHasModifier && !noteHasModifier) {
        continue;
      }

      // Subject contradiction guard: if note has topic and searchKey mentions another major subject
      if (note.topic) {
        const topicLower = note.topic.toLowerCase();
        // If note is about cat and query is about dog
        if (topicLower.includes('แมว') && searchKey.includes('หมา')) continue;
        if (topicLower.includes('หมา') && searchKey.includes('แมว')) continue;
        if (!searchKey.includes(topicLower) && !note.canonicalKey.includes(searchKey)) {
          // If query doesn't share topic, skip fuzzy match
          continue;
        }
      }

      // Tier 2: Check core content words containment
      const noteCore = stripQuestionModal(note.rawQuery).toLowerCase();
      const noteTokens = noteCore.split(/\s+/).filter((t) => t.length >= 2);
      const queryTokens = queryCore.split(/\s+/).filter((t) => t.length >= 2);

      // If both contain core topic keywords (e.g. "ช็อกโกแลต" and "แมว" and "กิน")
      if (noteTokens.length > 0 && queryTokens.length > 0) {
        const matches = noteTokens.filter((nt) => queryCore.includes(nt)).length;
        const overlap = matches / noteTokens.length;
        if (overlap >= 0.75) {
          return note;
        }
      }

      // Also check Thai bigram similarity on searchKey and note.canonicalKey
      const sim = Math.max(
        computeThaiBigramContainment(searchKey, note.canonicalKey),
        computeThaiBigramContainment(note.canonicalKey, searchKey)
      );
      if (sim >= 0.70 && sim > highestSim) {
        highestSim = sim;
        bestMatch = note;
      }
    }

    return bestMatch;
  }


  getRelevantNotesForTopic(topic, sessionId = null, maxNotes = 2) {
    if (!topic || typeof topic !== 'string') return [];
    const now = Date.now();
    const target = topic.trim().toLowerCase();
    const results = [];

    for (const [id, note] of this.notes.entries()) {
      if (now > note.expiresAt) {
        this.notes.delete(id);
        continue;
      }

      if (sessionId && note.sessionId !== 'global' && note.sessionId !== sessionId) {
        continue;
      }

      if (note.topic && (note.topic.toLowerCase().includes(target) || target.includes(note.topic.toLowerCase()))) {
        results.push(note);
        if (results.length >= maxNotes) break;
      }
    }

    return results;
  }

  clearNotes(sessionId = null) {
    if (!sessionId) {
      this.notes.clear();
      return;
    }
    for (const [id, note] of this.notes.entries()) {
      if (note.sessionId === sessionId) {
        this.notes.delete(id);
      }
    }
  }

  get noteCount() {
    return this.notes.size;
  }
}

export class SessionMemory {
  constructor({ maxTurns = DEFAULT_MAX_TURNS, ttlMs = DEFAULT_TTL_MS, maxNotes = DEFAULT_MAX_NOTES } = {}) {
    this.maxTurns = maxTurns;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this.noteLedger = new NoteMemoryLedger({ maxNotes, defaultTtlMs: ttlMs });
  }

  _getOrCreateSession(sessionId) {
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        totalTurns: 0,
        turns: [],
        verbatimQuestions: [],
        focusEntity: null,
        firstQuery: null,
        lastActive: Date.now(),
        lastTurnTelemetry: null,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          llmCalls: 0,
          deterministicTurns: 0,
          totalTurns: 0
        }
      };
      this.sessions.set(sessionId, session);
    }
    session.lastActive = Date.now();
    return session;
  }

  recordUsage(sessionId, { promptTokens = 0, completionTokens = 0, isDeterministic = false } = {}) {
    if (!sessionId) return null;
    const session = this._getOrCreateSession(sessionId);
    const p = Number(promptTokens) || 0;
    const c = Number(completionTokens) || 0;

    session.usage.promptTokens += p;
    session.usage.completionTokens += c;
    session.usage.totalTokens += p + c;
    session.usage.totalTurns += 1;
    if (isDeterministic) {
      session.usage.deterministicTurns += 1;
    } else {
      session.usage.llmCalls += 1;
    }

    return { ...session.usage };
  }

  getUsageSummary(sessionId, { maxContextChars = 3200, maxTokens = 4096 } = {}) {
    const session = this.sessions.get(sessionId);
    const sessionTotal = session?.usage
      ? { ...session.usage }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0, llmCalls: 0, deterministicTurns: 0, totalTurns: 0 };

    const turns = session?.turns || [];
    const assembled = this.getAssembledContext(sessionId, { maxChars: maxContextChars });
    let contextCharsUsed = assembled.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (contextCharsUsed > maxContextChars) {
      contextCharsUsed = maxContextChars;
    }

    const usedTokens = session?.lastTurnTelemetry?.usedTokens ?? (contextCharsUsed > 0 ? Math.ceil(contextCharsUsed / 3.5) : 0);

    const contextWindowStats = {
      maxTokens,
      usedTokens,
      historyTurnsUsed: turns.length,
      maxHistoryTurns: this.maxTurns,
      contextCharsUsed,
      maxContextChars,
      focusEntity: session?.focusEntity || null
    };

    return { sessionTotal, contextWindowStats };
  }

  recordTurn(sessionId, { userQuery, assistantText = '', toolUsed = null, focusEntity = null, isMeta = false }) {
    if (!sessionId || !userQuery) return null;
    const session = this._getOrCreateSession(sessionId);

    session.totalTurns += 1;
    if (!session.firstQuery && !isMeta) {
      session.firstQuery = userQuery.trim();
    }

    if (!isMeta) {
      session.verbatimQuestions.push({
        turnNumber: session.totalTurns,
        query: userQuery.trim(),
        timestamp: Date.now()
      });
      if (session.verbatimQuestions.length > this.maxTurns) {
        session.verbatimQuestions.shift();
      }
    }

    if (focusEntity && typeof focusEntity === 'string' && focusEntity.trim()) {
      session.focusEntity = focusEntity.trim();
    }

    const turn = {
      turnNumber: session.totalTurns,
      userQuery: userQuery.trim(),
      assistantText: typeof assistantText === 'string' ? assistantText.trim() : '',
      toolUsed: toolUsed || null,
      focusEntity: session.focusEntity,
      isMeta: Boolean(isMeta),
      timestamp: Date.now()
    };

    session.turns.push(turn);

    if (session.turns.length > this.maxTurns) {
      session.turns.shift();
    }

    return turn;
  }

  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return [...session.turns];
  }

  getFocusEntity(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.focusEntity : null;
  }

  answerMetaRecall(sessionId, query) {
    if (!sessionId || typeof query !== 'string') return null;
    const session = this.sessions.get(sessionId);
    const text = query.trim();
    const questions = session?.verbatimQuestions || [];

    // 1. Full list of all questions in session
    const isFullList = /(?:ลิสต์|สรุป|ขอดู|แสดง|มี)?\s*(?:รายการ)?(?:คำถามทั้งหมด|คำถามที่เคยถามทั้งหมด|ทุกคำถามที่ถามไป|ลิสต์คำถามทั้งหมด)/i.test(text);
    if (isFullList) {
      if (questions.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      const listStr = questions.map((q, idx) => `${idx + 1}. "${q.query}"`).join('\n');
      return `รายการคำถามทั้งหมดที่คุณถามไปในเซสชันนี้ (ทั้งหมด ${questions.length} คำถาม):\n${listStr}`;
    }

    // 2. Specific ordinal question number (e.g., "คำถามที่ 2", "คำถามข้อที่ 5", "ข้อ 3")
    const ordinalMatch = text.match(/(?:คำถาม|ข้อ)(?:ที่|หมายเลข|ข้อที่)?\s*(\d+)/i);
    if (ordinalMatch) {
      const targetNum = parseInt(ordinalMatch[1], 10);
      if (questions.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      if (targetNum >= 1 && targetNum <= questions.length) {
        return `คำถามที่ ${targetNum} ที่คุณถามคือ: "${questions[targetNum - 1].query}" ครับ`;
      }
      return `ในเซสชันนี้คุณถามไป ${questions.length} คำถาม ยังไม่มีคำถามที่ ${targetNum} ครับ`;
    }

    // 3. Slices / Ranges: N questions from start (e.g. "3 คำถามแรก", "5 ข้อแรก")
    const sliceFirstMatch = text.match(/(\d+)\s*(?:คำถาม|ข้อ)(?:แรก|แรกๆ)/i);
    if (sliceFirstMatch) {
      const count = parseInt(sliceFirstMatch[1], 10);
      if (questions.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      const slice = questions.slice(0, count);
      const listStr = slice.map((q, idx) => `${idx + 1}. "${q.query}"`).join('\n');
      return `รายการ ${slice.length} คำถามแรกที่คุณถามคือ:\n${listStr}`;
    }

    // 4. Slices / Ranges: N questions from end (e.g. "3 คำถามล่าสุด")
    const sliceLastMatch = text.match(/(\d+)\s*(?:คำถาม|ข้อ)(?:ล่าสุด|หลังสุด)/i);
    if (sliceLastMatch) {
      const count = parseInt(sliceLastMatch[1], 10);
      if (questions.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      const slice = questions.slice(-count);
      const listStr = slice.map((q, idx) => `${idx + 1}. "${q.query}"`).join('\n');
      return `รายการ ${slice.length} คำถามล่าสุดที่คุณถามคือ:\n${listStr}`;
    }

    // 5. First question recall
    const isFirstQuestion = /(?:คำถามแรก|คำถามที่\s*1\b|ข้อแรก|ถามอะไร(?:ไป)?(?:เป็น)?(?:ข้อ|คำถาม)?แรก|what was (?:my |the )?first question)/i.test(text);
    if (isFirstQuestion) {
      if (questions.length === 0 && (!session || !session.firstQuery)) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      const firstQ = questions[0]?.query || session?.firstQuery;
      return `คำถามแรกที่คุณถามคือ: "${firstQ}" ครับ`;
    }

    // 6. Second to last question recall ("คำถามรองสุดท้าย", "ข้อรองสุดท้าย")
    const isPenultimate = /(?:คำถามรองสุดท้าย|ข้อรองสุดท้าย|second to last question)/i.test(text);
    if (isPenultimate) {
      if (questions.length < 2) {
        return 'ยังไม่มีคำถามรองสุดท้ายในเซสชันนี้ครับ';
      }
      return `คำถามรองสุดท้ายที่คุณถามคือ: "${questions[questions.length - 2].query}" ครับ`;
    }

    // 7. Previous question recall
    const isPreviousQuestion = /(?:คำถามก่อนหน้านี้|คำถามที่แล้ว|ข้อที่แล้ว|เมื่อกี้ถามอะไร|คำถามล่าสุดคือ|คำถามล่าสุด|what was (?:my |the )?last question|previous question)/i.test(text);
    if (isPreviousQuestion) {
      if (questions.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      return `คำถามล่าสุดก่อนหน้านี้คือ: "${questions[questions.length - 1].query}" ครับ`;
    }

    // 8. Question count
    const isQuestionCount = /(?:ถามไปกี่ข้อ|ถามไปกี่คำถาม|กี่คำถามแล้ว|คุยกี่รอบ|how many questions)/i.test(text);
    if (isQuestionCount) {
      const substantiveCount = questions.length || (session ? session.turns.filter((t) => !t.isMeta).length : 0);
      return `คุณถามไปทั้งหมด ${substantiveCount} คำถามแล้วครับ`;
    }

    return null;
  }

  getAssembledContext(sessionId, { maxChars = 3200, maxDialogueTurns = 4 } = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length === 0) return [];

    const turns = session.turns;
    const messages = [];

    // If turns exceed maxDialogueTurns, condense older turns into a compact summary message
    if (turns.length > maxDialogueTurns) {
      const olderTurns = turns.slice(0, turns.length - maxDialogueTurns);
      const summaryItems = olderTurns.map((t) => {
        const toolInfo = t.toolUsed ? ` (${t.toolUsed})` : '';
        const answerSnippet = t.assistantText.length > 160 ? `${t.assistantText.slice(0, 160)}...` : t.assistantText;
        return `• ถาม: "${t.userQuery}" -> ตอบย่อ: "${answerSnippet}"${toolInfo}`;
      });
      const summaryContent = `[สรุปหัวข้อที่เคยคุยก่อนหน้านี้]:\n${summaryItems.join('\n')}`;
      messages.push({ role: 'system', content: summaryContent });
    }

    // Include the most recent turns as dialogue
    const recentTurns = turns.slice(-maxDialogueTurns);
    for (const t of recentTurns) {
      messages.push({ role: 'user', content: t.userQuery });
      if (t.assistantText) {
        messages.push({ role: 'assistant', content: t.assistantText });
      }
    }

    // Enforce maxChars constraint with strict hard clamp
    let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > maxChars && messages.length > 1) {
      const removed = messages.shift();
      totalChars -= removed.content.length;
    }
    if (messages.length === 1 && messages[0].content.length > maxChars) {
      messages[0].content = messages[0].content.slice(0, maxChars);
    }

    return messages;
  }

  clearSession(sessionId) {
    if (sessionId) {
      this.noteLedger.clearNotes(sessionId);
    }
    return this.sessions.delete(sessionId);
  }

  get sessionCount() {
    return this.sessions.size;
  }
}

export const sessionMemory = new SessionMemory();
