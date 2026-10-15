// Session Memory (Deep Module)
// In-memory 10-turn conversation ledger with focus entity tracking,
// zero-token meta-recall, and budgeted context assembly.
// Designed for Raspberry Pi 5 to keep RAM overhead minimal (~3KB/session)
// without causing I/O wear on the MicroSD card.

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionMemory {
  constructor({ maxTurns = DEFAULT_MAX_TURNS, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.maxTurns = maxTurns;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  _getOrCreateSession(sessionId) {
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        totalTurns: 0,
        turns: [],
        focusEntity: null,
        firstQuery: null,
        lastActive: Date.now()
      };
      this.sessions.set(sessionId, session);
    }
    session.lastActive = Date.now();
    return session;
  }

  recordTurn(sessionId, { userQuery, assistantText = '', toolUsed = null, focusEntity = null, isMeta = false }) {
    if (!sessionId || !userQuery) return null;
    const session = this._getOrCreateSession(sessionId);

    session.totalTurns += 1;
    if (!session.firstQuery && !isMeta) {
      session.firstQuery = userQuery.trim();
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

    // 1. First question recall
    const isFirstQuestion = /(?:คำถามแรก|คำถามที่\s*1\b|ข้อแรก|ถามอะไร(?:ไป)?(?:เป็น)?(?:ข้อ|คำถาม)?แรก|what was (?:my |the )?first question)/i.test(text);
    if (isFirstQuestion) {
      if (!session || !session.firstQuery) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      return `คำถามแรกที่คุณถามคือ: "${session.firstQuery}" ครับ`;
    }

    // 2. Previous question recall
    const isPreviousQuestion = /(?:คำถามก่อนหน้านี้|คำถามที่แล้ว|ข้อที่แล้ว|เมื่อกี้ถามอะไร|คำถามล่าสุดคือ|what was (?:my |the )?last question|previous question)/i.test(text);
    if (isPreviousQuestion) {
      if (!session || session.turns.length === 0) {
        return 'ยังไม่มีประวัติคำถามก่อนหน้านี้ครับ';
      }
      const substantiveTurns = session.turns.filter((t) => !t.isMeta);
      const lastTurn = substantiveTurns.length > 0
        ? substantiveTurns[substantiveTurns.length - 1]
        : session.turns[session.turns.length - 1];
      return `คำถามล่าสุดก่อนหน้านี้คือ: "${lastTurn.userQuery}" ครับ`;
    }

    // 3. Question count
    const isQuestionCount = /(?:ถามไปกี่ข้อ|ถามไปกี่คำถาม|กี่คำถามแล้ว|คุยกี่รอบ|how many questions)/i.test(text);
    if (isQuestionCount) {
      const substantiveCount = session ? session.turns.filter((t) => !t.isMeta).length : 0;
      return `คุณถามไปทั้งหมด ${substantiveCount} คำถามแล้วครับ`;
    }

    return null;
  }

  getAssembledContext(sessionId, { maxChars = 800, maxDialogueTurns = 2 } = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length === 0) return [];

    const turns = session.turns;
    const messages = [];

    // If turns exceed maxDialogueTurns, condense older turns into a compact summary message
    if (turns.length > maxDialogueTurns) {
      const olderTurns = turns.slice(0, turns.length - maxDialogueTurns);
      const summaryItems = olderTurns.map((t) => {
        const toolInfo = t.toolUsed ? ` (${t.toolUsed})` : '';
        const answerSnippet = t.assistantText.length > 50 ? `${t.assistantText.slice(0, 50)}...` : t.assistantText;
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

    // Enforce maxChars constraint
    let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > maxChars && messages.length > 1) {
      // Drop from the front (oldest context first)
      const removed = messages.shift();
      totalChars -= removed.content.length;
    }

    return messages;
  }

  clearSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  get sessionCount() {
    return this.sessions.size;
  }
}

export const sessionMemory = new SessionMemory();
