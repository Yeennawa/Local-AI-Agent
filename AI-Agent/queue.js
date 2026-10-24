// Request Queue (Deep Module)
// Enforces strict FIFO concurrency control for local LLM inference on Raspberry Pi 5 (4GB RAM).
// Prevents concurrent model invocations that lead to Linux OOM-killer crashes during group demos.

export class RequestQueue {
  constructor({ maxConcurrent = 1, maxQueueLength = 10, timeoutMs = 120000 } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueLength = maxQueueLength;
    this.timeoutMs = timeoutMs;
    this.pending = [];
    this.active = 0;
    this.totalProcessed = 0;
  }

  get pendingCount() {
    return this.pending.length;
  }

  get activeCount() {
    return this.active;
  }

  enqueue(taskFn) {
    if (typeof taskFn !== 'function') {
      return Promise.reject(new TypeError('Task must be an executable function'));
    }

    if (this.pending.length >= this.maxQueueLength) {
      const err = new Error('Server is busy: Queue is full. Please try again shortly.');
      err.status = 503;
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      let timeoutTimer = null;

      if (this.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          const index = this.pending.findIndex((item) => item.resolve === resolve);
          if (index !== -1) {
            this.pending.splice(index, 1);
            const timeoutErr = new Error('Request queue timeout: wait limit exceeded');
            timeoutErr.status = 504;
            reject(timeoutErr);
          }
        }, this.timeoutMs);
      }

      this.pending.push({
        taskFn,
        resolve,
        reject,
        timeoutTimer
      });

      this._drain();
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
    }

    this.active++;

    try {
      const result = await item.taskFn();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.active--;
      this.totalProcessed++;
      this._drain();
    }
  }
}

export const requestQueue = new RequestQueue({ maxConcurrent: 1, maxQueueLength: 10 });
