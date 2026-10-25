import express from 'express';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import { sessionMemory } from './memory.js';
import { RequestQueue, requestQueue, formatClientDeviceLabel } from './queue.js';
import { ModelManager, modelManager } from './modelManager.js';
import { TOOL_MODES, normalizeToolMode } from './toolMode.js';
import { isTavilyConfigured, getTavilyDiagnostics } from './tools/search/tavily.js';
import { getOSSnapshot } from './osMonitor.js';
import { buildUsagePayload } from './telemetry.js';
import { validateLinuxCommand, executeLinuxCommand } from './linux/commandGuard.js';

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
    const { mode, rejectIfBusy } = req.body || {};
    const managerState = manager?.getState ? manager.getState() : 'ready';
    const isBusy = queue.activeCount > 0 || queue.pendingCount > 0 || managerState === 'switching' || managerState === 'loading';

    if (rejectIfBusy === true && isBusy) {
      return res.status(409).json({
        success: false,
        code: 'MODEL_BUSY_GENERATING',
        error: 'ขณะนี้ AI กำลังประมวลผลคำถามอยู่ กรุณารอให้ตอบคำถามเสร็จสิ้นก่อนจึงจะสลับโหมดโมเดลได้ครับ',
        status: manager?.getStatusSync ? manager.getStatusSync() : null
      });
    }

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
  app.get('/api/tools/status', async (_req, res) => {
    const tavilyDiagnostics = await getTavilyDiagnostics({ probe: false });
    return res.json({
      modes: TOOL_MODES,
      tavilyConfigured: isTavilyConfigured(),
      tavilyDiagnostics
    });
  });

  app.get('/api/tools/diagnostics', async (req, res) => {
    const shouldProbe = req.query?.probe === '1' || req.query?.probe === 'true';
    const diagnostics = await getTavilyDiagnostics({ probe: shouldProbe });
    return res.json(diagnostics);
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
      const clientLabel = formatClientDeviceLabel(req.headers['user-agent'], effectiveSessionId);
      const modelMode = manager?.getMode ? manager.getMode() : 'lite';

      // Enforce strict FIFO serialization through RequestQueue to prevent Pi 5 OOM
      const result = await queue.enqueue(
        async () => {
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
        },
        {
          sessionId: effectiveSessionId,
          clientLabel,
          taskType: 'chat',
          modelMode
        }
      );

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

    req.socket?.setTimeout?.(0);
    res.socket?.setTimeout?.(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSSE = (event, data) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const heartbeatTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 10000);

    const history = Array.isArray(conversationHistory) ? conversationHistory : [];
    const clientLabel = formatClientDeviceLabel(req.headers['user-agent'], effectiveSessionId);
    const modelMode = manager?.getMode ? manager.getMode() : 'lite';
    const reqAbortController = new AbortController();

    req.on('aborted', () => reqAbortController.abort());
    res.on('close', () => {
      if (!res.writableEnded) {
        reqAbortController.abort();
      }
    });

    try {
      await queue.enqueue(
        async () => {
          const activeModel = agentOptions.model || (manager?.getCurrentModel ? manager.getCurrentModel() : 'qwen2.5:1.5b');
          const result = await runAgent({
            message: message.trim(),
            conversationHistory: history,
            sessionId: effectiveSessionId,
            options: {
              ...agentOptions,
              model: activeModel,
              toolMode: activeToolMode,
              onStatus: (st) => {
                if (st?.status === 'generating' && typeof queue.reportActiveProgress === 'function') {
                  queue.reportActiveProgress({
                    tokens: st.tokens,
                    numPredict: modelMode === 'advanced' ? 768 : 600,
                    tps: st.tps
                  });
                }
                sendSSE('status', st);
              },
              onToken: (tok) => sendSSE('token', { token: tok })
            }
          });

          if (effectiveSessionId) {
            result.sessionId = effectiveSessionId;
          }

          sendSSE('done', result);
          return result;
        },
        {
          sessionId: effectiveSessionId,
          clientLabel,
          taskType: 'chat',
          modelMode,
          signal: reqAbortController.signal,
          onQueueUpdate: (snap) => sendSSE('queue', snap)
        }
      );
    } catch (error) {
      if (error?.name === 'AbortError' || error?.status === 499) {
        // Client disconnected or cancelled queue request cleanly
      } else if (error?.status === 503) {
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

  app.get('/api/os/metrics', async (_req, res) => {
    const snapshot = await getOSSnapshot();
    return res.json(snapshot);
  });

  app.post('/api/linux/execute', async (req, res) => {
    try {
      const { command, sessionId } = req.body || {};
      const effectiveSessionId = sessionId || req.headers['x-session-id'] || null;

      if (!command || typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({
          success: false,
          error: 'คำสั่งไม่ถูกต้อง กรุณาระบุคำสั่ง Linux'
        });
      }

      const trimmedCmd = command.trim();
      const guard = validateLinuxCommand(trimmedCmd);
      if (!guard.ok || guard.risk !== 'read' || !guard.canExecute) {
        return res.status(403).json({
          success: false,
          error: `ระบบความปลอดภัยไม่อนุญาตให้รันคำสั่งนี้บนบอร์ด: ${guard.reasons.join(', ')}`,
          risk: guard.risk
        });
      }

      const clientLabel = formatClientDeviceLabel(req.headers['user-agent'], effectiveSessionId);
      const outcome = await queue.enqueue(
        () => executeLinuxCommand(trimmedCmd),
        {
          sessionId: effectiveSessionId,
          clientLabel,
          taskType: 'linux_exec',
          modelMode: 'lite'
        }
      );

      return res.status(outcome.status).json({
        success: outcome.ok,
        ...outcome.body
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Server error during Linux execution'
      });
    }
  });

  app.get('/api/queue/status', (req, res) => {
    const viewerSessionId = req.query?.sessionId || req.headers['x-session-id'] || null;
    const snapshot = queue.getQueueSnapshot
      ? queue.getQueueSnapshot(viewerSessionId)
      : {
          schedulerPolicy: 'SCHED_FIFO',
          activeCount: queue.activeCount,
          pendingCount: queue.pendingCount,
          totalProcessed: queue.totalProcessed,
          yourJob: null,
          runningJob: null,
          waitingJobs: []
        };
    return res.json(snapshot);
  });

  app.get('/api/chat/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const history = sessionMemory.getHistory(sessionId);
    const focusEntity = sessionMemory.getFocusEntity(sessionId);
    const usage = sessionMemory.getUsageSummary(sessionId);
    const telemetry = buildUsagePayload({
      sessionStats: usage.sessionTotal,
      contextWindowStats: usage.contextWindowStats
    });
    return res.json({ sessionId, history, focusEntity, usage, telemetry });
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
