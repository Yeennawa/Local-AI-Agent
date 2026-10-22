import express from 'express';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { sessionMemory } from './memory.js';
import { RequestQueue, requestQueue } from './queue.js';
import { ModelManager, modelManager } from './modelManager.js';
import { TOOL_MODES, normalizeToolMode } from './toolMode.js';
import { isTavilyConfigured } from './tools/search/tavily.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cap JSON bodies at 32kb because sliding history (4 turns * 500 chars) plus the new prompt is tiny,
// and oversized payloads would waste RAM on the Raspberry Pi 5 before sanitizeHistory even runs.
const JSON_BODY_LIMIT = '32kb';

export function createApp(agentOptions = {}, queue = requestQueue, manager = modelManager) {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(path.join(__dirname, '../Frontend')));

  // Health check endpoint for hardware telemetry on Raspberry Pi 5
  app.get('/api/health', (_req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return res.json({
      status: 'healthy',
      platform: process.platform,
      uptime: Math.round(process.uptime()),
      memory: {
        totalMB: Math.round(totalMem / (1024 * 1024)),
        freeMB: Math.round(freeMem / (1024 * 1024)),
        usedMB: Math.round(usedMem / (1024 * 1024)),
        usagePercent: Math.round(((usedMem / totalMem) * 100) * 10) / 10
      },
      queue: {
        pending: queue.pendingCount,
        active: queue.activeCount,
        totalProcessed: queue.totalProcessed
      },
      sessions: {
        activeCount: sessionMemory.sessionCount
      },
      model: manager?.getStatusSync ? manager.getStatusSync() : null
    });
  });

  // Dynamic model switcher endpoints
  app.get('/api/model/status', async (_req, res) => {
    try {
      const status = manager?.getStatus ? await manager.getStatus() : { mode: 'lite', model: 'qwen2.5:1.5b', state: 'ready' };
      return res.json(status);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to fetch model status'
      });
    }
  });

  app.post('/api/model/switch', async (req, res) => {
    const { mode } = req.body || {};
    try {
      const result = await queue.enqueue(() => manager.switchMode(mode));
      if (!result?.success) {
        return res.status(result?.statusCode || 500).json(result);
      }
      return res.json(result);
    } catch (error) {
      const code = error?.status || 500;
      return res.status(code).json({
        success: false,
        error: error?.message || 'ไม่สามารถสลับโมเดลได้ในขณะนี้',
        status: manager?.getStatusSync ? manager.getStatusSync() : null
      });
    }
  });

  // Tool Modes and Provider status endpoint
  app.get('/api/tools/status', (_req, res) => {
    return res.json({
      modes: TOOL_MODES,
      tavilyConfigured: isTavilyConfigured()
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, conversationHistory, sessionId, toolMode } = req.body || {};
      const effectiveSessionId = sessionId || req.headers['x-session-id'] || null;
      const activeToolMode = normalizeToolMode(toolMode || req.headers['x-tool-mode'] || agentOptions.toolMode);

      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({
          text: 'ข้อความไม่ถูกต้อง กรุณาระบุข้อความที่ต้องการถามครับ',
          status: 'error',
          feeling: 'confused',
          toolsUsed: [],
          notice: null,
          error: 'Message must be a non-empty string'
        });
      }

      const history = Array.isArray(conversationHistory) ? conversationHistory : [];

      // Enforce strict FIFO serialization through RequestQueue to prevent Pi 5 OOM
      const result = await queue.enqueue(async () => {
        const activeModel = agentOptions.model || (manager?.getCurrentModel ? manager.getCurrentModel() : 'qwen2.5:1.5b');
        return runAgent({
          message: message.trim(),
          conversationHistory: history,
          sessionId: effectiveSessionId,
          options: {
            ...agentOptions,
            model: activeModel,
            toolMode: activeToolMode
          }
        });
      });

      if (effectiveSessionId) {
        result.sessionId = effectiveSessionId;
      }

      return res.json(result);
    } catch (error) {
      if (error?.status === 503) {
        return res.status(503).json({
          text: 'ขณะนี้มีผู้ใช้งานพร้อมกันจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้งครับ',
          status: 'error',
          feeling: 'confused',
          toolsUsed: [],
          notice: null,
          error: error.message || 'Server busy: Queue is full'
        });
      }

      console.error(error);

      return res.status(500).json({
        text: 'AI มีปัญหา',
        status: 'error',
        feeling: 'confused',
        toolsUsed: [],
        notice: null,
        error: error?.message || 'Internal server error'
      });
    }
  });

  // Server-Sent Events (SSE) streaming endpoint
  app.post('/api/chat/stream', async (req, res) => {
    const { message, conversationHistory, sessionId, toolMode } = req.body || {};
    const effectiveSessionId = sessionId || req.headers['x-session-id'] || null;
    const activeToolMode = normalizeToolMode(toolMode || req.headers['x-tool-mode'] || agentOptions.toolMode);

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        text: 'ข้อความไม่ถูกต้อง กรุณาระบุข้อความที่ต้องการถามครับ',
        status: 'error',
        feeling: 'confused',
        toolsUsed: [],
        notice: null,
        error: 'Message must be a non-empty string'
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSSE = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeatTimer = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    const history = Array.isArray(conversationHistory) ? conversationHistory : [];

    try {
      await queue.enqueue(async () => {
        const activeModel = agentOptions.model || (manager?.getCurrentModel ? manager.getCurrentModel() : 'qwen2.5:1.5b');
        const result = await runAgent({
          message: message.trim(),
          conversationHistory: history,
          sessionId: effectiveSessionId,
          options: {
            ...agentOptions,
            model: activeModel,
            toolMode: activeToolMode,
            onStatus: (st) => sendSSE('status', st),
            onToken: (tok) => sendSSE('token', { token: tok })
          }
        });

        if (effectiveSessionId) {
          result.sessionId = effectiveSessionId;
        }

        sendSSE('done', result);
        return result;
      });
    } catch (error) {
      if (error?.status === 503) {
        sendSSE('error', {
          text: 'ขณะนี้มีผู้ใช้งานพร้อมกันจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้งครับ',
          status: 'error',
          feeling: 'confused',
          toolsUsed: [],
          notice: null,
          error: error.message || 'Server busy: Queue is full'
        });
      } else {
        console.error(error);
        sendSSE('error', {
          text: 'AI มีปัญหา',
          status: 'error',
          feeling: 'confused',
          toolsUsed: [],
          notice: null,
          error: error?.message || 'Internal server error'
        });
      }
    } finally {
      clearInterval(heartbeatTimer);
      res.end();
    }
  });

  app.delete('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (sessionId) {
      sessionMemory.clearSession(sessionId);
    }
    return res.json({
      success: true,
      message: `Session ${sessionId} cleared`,
      usage: sessionMemory.getUsageSummary(sessionId)
    });
  });

  app.get('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const history = sessionMemory.getHistory(sessionId);
    const focusEntity = sessionMemory.getFocusEntity(sessionId);
    const usage = sessionMemory.getUsageSummary(sessionId);
    return res.json({ sessionId, history, focusEntity, usage });
  });

  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({
        text: 'ข้อความมีขนาดใหญ่เกินไป กรุณาส่งข้อความที่สั้นลงครับ',
        status: 'error',
        feeling: 'confused',
        toolsUsed: [],
        notice: null,
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
