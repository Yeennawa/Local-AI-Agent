// Request Queue v2: Linux OS FIFO Runqueue (Deep Module)
// Models Linux Kernel SCHED_FIFO runqueue + Process Control Block (job_struct) metadata.
// Enforces single-process concurrency (maxConcurrent: 1) on Raspberry Pi 5 (4GB RAM),
// broadcasts live queue position transitions via SSE callbacks, and evicts aborted tasks cleanly.

const DEFAULT_QUEUE_TIMEOUT_MS = Number(process.env.QUEUE_TIMEOUT_MS) || 600000; // 10 minutes for Pi 5 group sessions
const DEFAULT_BASELINE_TURNAROUND_MS = 18000;

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
  }

  get pendingCount() {
    return this.pending.length;
  }

  get activeCount() {
    return this.active;
  }

  get avgTurnaroundMs() {
    if (this.recentDurationsMs.length === 0) return DEFAULT_BASELINE_TURNAROUND_MS;
    const sum = this.recentDurationsMs.reduce((acc, v) => acc + v, 0);
    return Math.max(2000, Math.round(sum / this.recentDurationsMs.length));
  }

  _recordDuration(durationMs) {
    if (typeof durationMs !== 'number' || durationMs <= 0) return;
    this.recentDurationsMs.push(durationMs);
    if (this.recentDurationsMs.length > 5) {
      this.recentDurationsMs.shift();
    }
  }

  /**
   * Builds a Linux OS Runqueue snapshot from the perspective of a specific viewer session or PID.
   */
  getQueueSnapshot(viewerSessionId = null, viewerPid = null) {
    const now = Date.now();
    const avgMs = this.avgTurnaroundMs;

    let runningJob = null;
    const firstActive = this.activeJobs.values().next().value || null;
    if (firstActive) {
      const isYou = Boolean(
        (viewerPid && firstActive.pid === viewerPid) ||
        (viewerSessionId && firstActive.sessionId && firstActive.sessionId === viewerSessionId)
      );
      runningJob = {
        pid: firstActive.pid,
        state: 'TASK_RUNNING',
        clientLabel: firstActive.clientLabel,
        isYou,
        taskType: firstActive.taskType,
        modelMode: firstActive.modelMode,
        startedAt: firstActive.startedAt,
        elapsedMs: Math.max(0, now - (firstActive.startedAt || now))
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
        estimatedWaitSec: 0
      };
    } else {
      const foundWaiting = waitingJobs.find((w) => w.isYou);
      if (foundWaiting) {
        const runningRemainingMs = runningJob
          ? Math.max(3000, avgMs - runningJob.elapsedMs)
          : 0;
        const aheadWaitMs = runningRemainingMs + Math.max(0, foundWaiting.position - 1) * avgMs;
        yourJob = {
          pid: foundWaiting.pid,
          state: 'TASK_WAITING',
          position: foundWaiting.position,
          enqueuedAt: foundWaiting.enqueuedAt,
          startedAt: null,
          estimatedWaitSec: Math.max(2, Math.round(aheadWaitMs / 1000))
        };
      }
    }

    return {
      schedulerPolicy: 'SCHED_FIFO',
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
        this._broadcastQueueUpdate();
      }
    });
  }

  async _drain() {
    if (this.active >= this.maxConcurrent || this.pending.length === 0) {
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

    try {
      const result = await item.taskFn();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      const execMs = Date.now() - item.startedAt;
      this._recordDuration(execMs);
      this.activeJobs.delete(item.pid);
      this.active--;
      this.totalProcessed++;
      this._drain();
    }
  }
}

export const requestQueue = new RequestQueue({ maxConcurrent: 1, maxQueueLength: 10 });
