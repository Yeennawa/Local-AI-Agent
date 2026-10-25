// Request Queue v2: Linux OS FIFO Runqueue (Deep Module)
// Models Linux Kernel SCHED_FIFO runqueue + Process Control Block (job_struct) metadata.
// Enforces single-process concurrency (maxConcurrent: 1) on Raspberry Pi 5 (4GB RAM),
// broadcasts live queue position transitions via SSE callbacks, and evicts aborted tasks cleanly.

const DEFAULT_QUEUE_TIMEOUT_MS = Number(process.env.QUEUE_TIMEOUT_MS) || 600000; // 10 minutes for Pi 5 group sessions
const DEFAULT_BASELINE_TURNAROUND_MS = 18000;

const CLASS_BASELINES = {
  'chat:lite:llm': 8000,
  'chat:lite:deterministic': 400,
  'chat:advanced:llm': 18000,
  'chat:advanced:deterministic': 400,
  'model_switch': 6000
};

/**
 * Parses User-Agent and session identifier into a privacy-safe, human-readable device tag
 * without exposing raw client IP addresses to other participants.
 */
export function formatClientDeviceLabel(userAgent = '', sessionId = '') {
  const ua = typeof userAgent === 'string' ? userAgent : '';

  let osName = 'Web Client';
  if (/iPhone/i.test(ua)) osName = 'iPhone';
  else if (/iPad/i.test(ua)) osName = 'iPad';
  else if (/Android/i.test(ua)) osName = 'Android';
  else if (/Windows/i.test(ua)) osName = 'Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) osName = 'Mac';
  else if (/Linux|aarch64|armv/i.test(ua)) osName = 'Linux / Pi';

  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const cleanSess = typeof sessionId === 'string' ? sessionId.replace(/[^a-zA-Z0-9]/g, '') : '';
  const shortTag = cleanSess.length >= 4 ? ` #${cleanSess.slice(-4)}` : '';
  const browserPart = browser ? ` (${browser})` : '';

  return `${osName}${browserPart}${shortTag}`;
}

export class RequestQueue {
  constructor({ maxConcurrent = 1, maxQueueLength = 10, timeoutMs = DEFAULT_QUEUE_TIMEOUT_MS } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueLength = maxQueueLength;
    this.timeoutMs = timeoutMs;
    this.pending = [];
    this.activeJobs = new Map();
    this.active = 0;
    this.totalProcessed = 0;
    this.nextPid = 1001;
    this.recentDurationsMs = [];
    this.classStats = new Map();
    this.heartbeatTimer = null;
  }

  get pendingCount() {
    return this.pending.length;
  }

  get activeCount() {
    return this.active;
  }

  get isHeartbeatActive() {
    return this.heartbeatTimer !== null;
  }

  get avgTurnaroundMs() {
    if (this.recentDurationsMs.length === 0) return DEFAULT_BASELINE_TURNAROUND_MS;
    const sum = this.recentDurationsMs.reduce((acc, v) => acc + v, 0);
    return Math.max(1000, Math.round(sum / this.recentDurationsMs.length));
  }

  _classKey(taskType = 'chat', modelMode = 'lite', kind = 'llm') {
    return taskType === 'model_switch' ? 'model_switch' : `${taskType}:${modelMode}:${kind}`;
  }

  getBaselineTurnaroundMs(taskType = 'chat', modelMode = 'lite', kind = 'llm') {
    const key = this._classKey(taskType, modelMode, kind);
    if (this.classStats.has(key)) {
      return this.classStats.get(key).ewma;
    }
    return CLASS_BASELINES[key] || CLASS_BASELINES[`chat:${modelMode}:llm`] || DEFAULT_BASELINE_TURNAROUND_MS;
  }

  getTurnaroundEstimate(taskType = 'chat', modelMode = 'lite', kind = 'llm') {
    const key = this._classKey(taskType, modelMode, kind);
    const stats = this.classStats.get(key);
    if (stats && stats.samples.length >= 2) {
      const sorted = [...stats.samples].sort((a, b) => a - b);
      const p90Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
      return {
        ewma: stats.ewma,
        p90: Math.max(stats.ewma, sorted[p90Idx]),
        confidence: stats.samples.length >= 4 ? 'measured' : 'calibrating'
      };
    }
    const baseline = this.getBaselineTurnaroundMs(taskType, modelMode, kind);
    return {
      ewma: baseline,
      p90: Math.round(baseline * 1.35),
      confidence: 'baseline'
    };
  }

  _recordDuration(durationMs, taskType = 'chat', modelMode = 'lite', kind = 'llm') {
    if (typeof durationMs !== 'number' || durationMs <= 0) return;
    this.recentDurationsMs.push(durationMs);
    if (this.recentDurationsMs.length > 20) {
      this.recentDurationsMs.shift();
    }

    const key = this._classKey(taskType, modelMode, kind);
    let entry = this.classStats.get(key);
    if (!entry) {
      entry = { ewma: durationMs, samples: [] };
      this.classStats.set(key, entry);
    } else {
      entry.ewma = Math.round(0.3 * durationMs + 0.7 * entry.ewma);
    }
    entry.samples.push(durationMs);
    if (entry.samples.length > 20) {
      entry.samples.shift();
    }
  }

  reportProgress(pid, { tokens = 0, numPredict = 768, tps = 0 } = {}) {
    const active = this.activeJobs.get(pid);
    if (active) {
      active.progress = {
        tokens: Number(tokens) || 0,
        numPredict: Number(numPredict) || 768,
        tps: Number(tps) || 0,
        updatedAt: Date.now()
      };
    }
  }

  reportActiveProgress(progress = {}) {
    const firstActive = this.activeJobs.values().next().value;
    if (firstActive) {
      this.reportProgress(firstActive.pid, progress);
    }
  }

  _startHeartbeat() {
    if (this.heartbeatTimer || this.pending.length === 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.pending.length === 0) {
        this._stopHeartbeat();
        return;
      }
      this._broadcastQueueUpdate();
    }, 1000);
    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  destroy() {
    this._stopHeartbeat();
    for (const item of this.pending) {
      if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
    }
    this.pending.length = 0;
    this.activeJobs.clear();
  }

  /**
   * Builds a Linux OS Runqueue snapshot from the perspective of a specific viewer session or PID.
   */
  getQueueSnapshot(viewerSessionId = null, viewerPid = null) {
    const now = Date.now();
    const avgMs = this.avgTurnaroundMs;

    let runningJob = null;
    let runningRemainingMs = 0;
    let runningIsOverrun = false;

    const firstActive = this.activeJobs.values().next().value || null;
    if (firstActive) {
      const isYou = Boolean(
        (viewerPid && firstActive.pid === viewerPid) ||
        (viewerSessionId && firstActive.sessionId && firstActive.sessionId === viewerSessionId)
      );

      const elapsedMs = Math.max(0, now - (firstActive.startedAt || now));
      const est = this.getTurnaroundEstimate(firstActive.taskType, firstActive.modelMode, 'llm');
      runningIsOverrun = elapsedMs > est.p90;

      if (firstActive.progress && firstActive.progress.tps > 0 && firstActive.progress.numPredict > firstActive.progress.tokens) {
        const tokensLeft = firstActive.progress.numPredict - firstActive.progress.tokens;
        runningRemainingMs = Math.round((tokensLeft / firstActive.progress.tps) * 1000);
      } else {
        runningRemainingMs = Math.max(800, est.ewma - elapsedMs);
      }

      runningJob = {
        pid: firstActive.pid,
        state: 'TASK_RUNNING',
        clientLabel: firstActive.clientLabel,
        isYou,
        taskType: firstActive.taskType,
        modelMode: firstActive.modelMode,
        startedAt: firstActive.startedAt,
        elapsedMs,
        isOverrun: runningIsOverrun,
        progress: firstActive.progress || null
      };
    }

    const waitingJobs = this.pending.map((item, idx) => {
      const position = idx + 1;
      const isYou = Boolean(
        (viewerPid && item.pid === viewerPid) ||
        (viewerSessionId && item.sessionId && item.sessionId === viewerSessionId)
      );
      return {
        position,
        pid: item.pid,
        state: 'TASK_WAITING',
        clientLabel: item.clientLabel,
        isYou,
        taskType: item.taskType,
        modelMode: item.modelMode,
        enqueuedAt: item.enqueuedAt,
        waitMs: Math.max(0, now - item.enqueuedAt)
      };
    });

    let yourJob = null;
    if (runningJob && runningJob.isYou) {
      yourJob = {
        pid: runningJob.pid,
        state: 'TASK_RUNNING',
        position: 0,
        enqueuedAt: firstActive.enqueuedAt,
        startedAt: runningJob.startedAt,
        estimatedWaitSec: 0,
        estimatedWaitRange: { low: 0, high: 0, confidence: 'measured' },
        waitMs: runningJob.elapsedMs
      };
    } else {
      const foundWaiting = waitingJobs.find((w) => w.isYou);
      if (foundWaiting) {
        const jobsAhead = waitingJobs.slice(0, foundWaiting.position - 1);
        let aheadLowMs = 0;
        let aheadHighMs = 0;

        for (const j of jobsAhead) {
          const est = this.getTurnaroundEstimate(j.taskType, j.modelMode, 'llm');
          aheadLowMs += Math.round(est.ewma * 0.7);
          aheadHighMs += est.p90;
        }

        const currentLow = Math.round(runningRemainingMs * 0.7);
        const currentHigh = runningIsOverrun ? runningRemainingMs + 4000 : Math.round(runningRemainingMs * 1.3);

        const totalLowMs = currentLow + aheadLowMs;
        const totalHighMs = currentHigh + aheadHighMs;

        const lowSec = Math.max(1, Math.round(totalLowMs / 1000));
        const highSec = Math.max(lowSec, Math.round(totalHighMs / 1000));
        const estConfidence = this.getTurnaroundEstimate(foundWaiting.taskType, foundWaiting.modelMode, 'llm').confidence;

        yourJob = {
          pid: foundWaiting.pid,
          state: 'TASK_WAITING',
          position: foundWaiting.position,
          enqueuedAt: foundWaiting.enqueuedAt,
          startedAt: null,
          estimatedWaitSec: highSec,
          estimatedWaitRange: {
            low: lowSec,
            high: highSec,
            confidence: estConfidence
          },
          waitMs: foundWaiting.waitMs
        };
      }
    }

    return {
      schedulerPolicy: 'SCHED_FIFO',
      serverNow: now,
      maxConcurrent: this.maxConcurrent,
      maxQueueLength: this.maxQueueLength,
      activeCount: this.active,
      pendingCount: this.pending.length,
      totalProcessed: this.totalProcessed,
      avgTurnaroundMs: avgMs,
      yourJob,
      runningJob,
      waitingJobs
    };
  }

  _broadcastQueueUpdate() {
    for (const item of this.pending) {
      if (typeof item.onQueueUpdate === 'function') {
        try {
          item.onQueueUpdate(this.getQueueSnapshot(item.sessionId, item.pid));
        } catch {
          // Listener errors must never disrupt scheduler loop
        }
      }
    }
  }

  enqueue(taskFn, meta = {}) {
    if (typeof taskFn !== 'function') {
      return Promise.reject(new TypeError('Task must be an executable function'));
    }

    const opts = (meta && typeof meta === 'object') ? meta : {};

    if (opts.signal?.aborted) {
      const abortErr = new Error('Request cancelled by client');
      abortErr.name = 'AbortError';
      abortErr.status = 499;
      return Promise.reject(abortErr);
    }

    if (this.pending.length >= this.maxQueueLength) {
      const err = new Error('Server is busy: Queue is full. Please try again shortly.');
      err.status = 503;
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      const pid = this.nextPid++;

      const job = {
        pid,
        sessionId: opts.sessionId || null,
        clientLabel: opts.clientLabel || 'Web Client',
        taskType: opts.taskType || 'chat',
        modelMode: opts.modelMode || 'lite',
        state: 'TASK_WAITING',
        enqueuedAt: Date.now(),
        startedAt: null,
        taskFn,
        resolve,
        reject,
        timeoutTimer: null,
        cleanupAbort: null,
        onQueueUpdate: typeof opts.onQueueUpdate === 'function' ? opts.onQueueUpdate : null
      };

      if (this.timeoutMs > 0) {
        job.timeoutTimer = setTimeout(() => {
          const index = this.pending.findIndex((item) => item.pid === pid);
          if (index !== -1) {
            const [removed] = this.pending.splice(index, 1);
            removed.cleanupAbort?.();
            const timeoutErr = new Error('Request queue timeout: wait limit exceeded');
            timeoutErr.status = 504;
            this._broadcastQueueUpdate();
            if (this.pending.length === 0) this._stopHeartbeat();
            reject(timeoutErr);
          }
        }, this.timeoutMs);
      }

      if (opts.signal && typeof opts.signal.addEventListener === 'function') {
        const onAbort = () => {
          const index = this.pending.findIndex((item) => item.pid === pid);
          if (index !== -1) {
            const [removed] = this.pending.splice(index, 1);
            if (removed.timeoutTimer) clearTimeout(removed.timeoutTimer);
            const abortErr = new Error('Request cancelled by client while waiting in queue');
            abortErr.name = 'AbortError';
            abortErr.status = 499;
            this._broadcastQueueUpdate();
            if (this.pending.length === 0) this._stopHeartbeat();
            reject(abortErr);
          }
        };
        opts.signal.addEventListener('abort', onAbort, { once: true });
        job.cleanupAbort = () => opts.signal.removeEventListener('abort', onAbort);
      }

      this.pending.push(job);

      if (this.active < this.maxConcurrent) {
        this._drain();
      } else {
        this._startHeartbeat();
        this._broadcastQueueUpdate();
      }
    });
  }

  async _drain() {
    if (this.active >= this.maxConcurrent || this.pending.length === 0) {
      if (this.pending.length === 0) {
        this._stopHeartbeat();
      }
      return;
    }

    const item = this.pending.shift();
    if (!item) return;

    if (item.timeoutTimer) {
      clearTimeout(item.timeoutTimer);
      item.timeoutTimer = null;
    }
    item.cleanupAbort?.();
    item.cleanupAbort = null;

    item.state = 'TASK_RUNNING';
    item.startedAt = Date.now();
    this.active++;
    this.activeJobs.set(item.pid, item);

    // Notify promoted task that it is now TASK_RUNNING (position 0)
    if (typeof item.onQueueUpdate === 'function') {
      try {
        item.onQueueUpdate(this.getQueueSnapshot(item.sessionId, item.pid));
      } catch {
        // Non-fatal
      }
    }

    // Notify all remaining waiting tasks that their queue position moved up
    this._broadcastQueueUpdate();

    let taskResult;
    try {
      taskResult = await item.taskFn();
      item.resolve(taskResult);
    } catch (err) {
      item.reject(err);
    } finally {
      const execMs = Date.now() - item.startedAt;
      const isDet = Boolean(taskResult?.usage?.isDeterministic || taskResult?.result?.isDeterministic);
      this._recordDuration(execMs, item.taskType, item.modelMode, isDet ? 'deterministic' : 'llm');
      this.activeJobs.delete(item.pid);
      this.active--;
      this.totalProcessed++;
      this._drain();
    }
  }
}

export const requestQueue = new RequestQueue({ maxConcurrent: 1, maxQueueLength: 10 });
