import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { sessionMemory } from './memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cap JSON bodies at 32kb because sliding history (4 turns * 500 chars) plus the new prompt is tiny,
// and oversized payloads would waste RAM on the Raspberry Pi 5 before sanitizeHistory even runs.
const JSON_BODY_LIMIT = '32kb';

export function createApp(agentOptions = {}) {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(path.join(__dirname, '../Frontend')));

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, conversationHistory, sessionId } = req.body || {};
      const effectiveSessionId = sessionId || req.headers['x-session-id'] || null;

      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({
          text: 'ข้อความไม่ถูกต้อง กรุณาระบุข้อความที่ต้องการถามครับ',
          status: 'error',
          feeling: 'confused',
          toolsUsed: [],
          error: 'Message must be a non-empty string'
        });
      }

      const history = Array.isArray(conversationHistory) ? conversationHistory : [];

      const result = await runAgent({
        message: message.trim(),
        conversationHistory: history,
        sessionId: effectiveSessionId,
        options: agentOptions
      });

      if (effectiveSessionId) {
        result.sessionId = effectiveSessionId;
      }

      return res.json(result);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        text: 'AI มีปัญหา',
        status: 'error',
        feeling: 'confused',
        toolsUsed: [],
        error: error?.message || 'Internal server error'
      });
    }
  });

  app.delete('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (sessionId) {
      sessionMemory.clearSession(sessionId);
    }
    return res.json({ success: true, message: `Session ${sessionId} cleared` });
  });

  app.get('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const history = sessionMemory.getHistory(sessionId);
    const focusEntity = sessionMemory.getFocusEntity(sessionId);
    return res.json({ sessionId, history, focusEntity });
  });

  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({
        text: 'ข้อความมีขนาดใหญ่เกินไป กรุณาส่งข้อความที่สั้นลงครับ',
        status: 'error',
        feeling: 'confused',
        toolsUsed: [],
        error: 'Request entity too large'
      });
    }
    return next(err);
  });

  return app;
}

// Only bind a port when invoked as the entry script so tests can exercise createApp() in-memory.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`Server running at port ${port}`);
  });
}
