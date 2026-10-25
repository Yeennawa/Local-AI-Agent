// Model Manager (Deep Module)
// Orchestrates dynamic model switching between Lite (1.5B) and Advanced (3B) modes.
// Guarantees sequential unloading (keep_alive: 0) before loading new model weights
// to protect the 4GB RAM ceiling of Raspberry Pi 5 from kernel OOM crashes.

import ollama from 'ollama';

export const MODEL_MODES = {
  lite: {
    id: 'lite',
    label: 'Lite Mode (1.5B)',
    model: process.env.OLLAMA_MODEL_LITE || 'qwen2.5:1.5b',
    estimatedRamMB: 1150,
    description: 'เหมาะสำหรับงานทั่วไป รวดเร็ว และประหยัดทรัพยากร'
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced Mode (3B)',
    model: process.env.OLLAMA_MODEL_ADVANCED || 'qwen2.5:3b',
    estimatedRamMB: 2350,
    description: 'เหมาะสำหรับงานวิเคราะห์เชิงลึกและภาษาไทยสละสลวย'
  }
};

const DEFAULT_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '2m';

const defaultOllamaClient = {
  chat: (req) => ollama.chat(req),
  ps: () => ollama.ps(),
  list: () => ollama.list()
};

export class ModelManager {
  /**
   * @param {Object} options
   * @param {Object} [options.client] - Ollama adapter (accepts dependencies for unit test isolation)
   * @param {string} [options.initialMode='lite'] - Initial active mode ('lite' or 'advanced')
   * @param {number} [options.verifyRetries=5] - Retries for checking unloaded status in ps()
   * @param {number} [options.verifyDelayMs=150] - Interval between ps() checks
   * @param {string} [options.defaultKeepAlive='2m'] - Memory hold duration for loaded model
   */
  constructor({
    client = defaultOllamaClient,
    initialMode = 'lite',
    verifyRetries = 5,
    verifyDelayMs = 150,
    defaultKeepAlive = DEFAULT_KEEP_ALIVE
  } = {}) {
    this.client = client;
    this.mode = MODEL_MODES[initialMode] ? initialMode : 'lite';
    this.state = 'ready'; // 'ready' | 'switching' | 'loading' | 'error'
    this.lastError = null;
    this.verifyRetries = verifyRetries;
    this.verifyDelayMs = verifyDelayMs;
    this.defaultKeepAlive = defaultKeepAlive;
  }

  getMode() {
    return this.mode;
  }

  getCurrentModel() {
    return MODEL_MODES[this.mode]?.model || MODEL_MODES.lite.model;
  }

  getState() {
    return this.state;
  }

  getLastError() {
    return this.lastError;
  }

  getStatusSync() {
    const config = MODEL_MODES[this.mode] || MODEL_MODES.lite;
    return {
      mode: this.mode,
      model: config.model,
      label: config.label,
      state: this.state,
      lastError: this.lastError,
      estimatedRamMB: config.estimatedRamMB,
      modes: MODEL_MODES
    };
  }

  async getStatus() {
    const base = this.getStatusSync();
    let loadedModels = [];

    try {
      if (typeof this.client?.ps === 'function') {
        const psRes = await this.client.ps();
        loadedModels = Array.isArray(psRes?.models)
          ? psRes.models.map((m) => ({
              name: m.name || m.model,
              sizeBytes: m.size || m.size_vram || 0
            }))
          : [];
      }
    } catch {
      // If Ollama is offline or ps fails, report loadedModels as empty
      loadedModels = [];
    }

    return {
      ...base,
      loadedModels
    };
  }

  /**
   * Sequentially switches between lite (1.5B) and advanced (3B) modes.
   *
   * Workflow:
   * 1. Validate target mode
   * 2. Pre-flight check: ensure target model is installed on disk via list()
   * 3. Unload current model using keep_alive: 0
   * 4. Verify current model is gone from ps()
   * 5. Preload target model using keep_alive: 2m
   * 6. Verify target model is present in ps()
   * 7. Finalize ready state (or rollback on failure)
   *
   * @param {string} targetMode - 'lite' | 'advanced'
   * @returns {Promise<{ success: boolean, mode: string, model: string, statusCode?: number, error?: string }>}
   */
  async switchMode(targetMode) {
    if (!targetMode || !MODEL_MODES[targetMode]) {
      return {
        success: false,
        statusCode: 400,
        error: `โหมดไม่ถูกต้อง กรุณาเลือก ${Object.keys(MODEL_MODES).join(' หรือ ')}`,
        mode: this.mode,
        model: this.getCurrentModel()
      };
    }

    if (targetMode === this.mode && this.state === 'ready') {
      return {
        success: true,
        previousMode: this.mode,
        mode: this.mode,
        currentMode: this.mode,
        model: this.getCurrentModel(),
        label: MODEL_MODES[this.mode].label,
        estimatedRamMB: MODEL_MODES[this.mode].estimatedRamMB,
        message: `ระบบอยู่ในโหมด ${MODEL_MODES[this.mode].label} อยู่แล้ว`
      };
    }

    const previousMode = this.mode;
    const previousModel = this.getCurrentModel();
    const targetConfig = MODEL_MODES[targetMode];

    // 1. Pre-flight Disk Check: verify target model is installed in Ollama tags
    try {
      if (typeof this.client?.list === 'function') {
        const listRes = await this.client.list();
        const installed = Array.isArray(listRes?.models)
          ? listRes.models.map((m) => (m.name || m.model || '').toLowerCase())
          : [];

        const targetBase = targetConfig.model.toLowerCase();
        const isInstalled = installed.some(
          (m) => m === targetBase || m.startsWith(`${targetBase}:`) || targetBase.startsWith(`${m}:`)
        );

        if (!isInstalled && installed.length > 0) {
          return {
            success: false,
            statusCode: 404,
            error: `โมเดล ${targetConfig.model} ยังไม่ได้ติดตั้งในเครื่อง กรุณารันคำสั่ง 'ollama pull ${targetConfig.model}' ใน Terminal ก่อนสลับโหมด`,
            mode: this.mode,
            model: this.getCurrentModel()
          };
        }
      }
    } catch (err) {
      // If list() call fails due to connection issues, abort before unloading
      return {
        success: false,
        statusCode: 503,
        error: `ไม่สามารถเชื่อมต่อ Ollama เพื่อตรวจสอบโมเดลได้: ${err.message || 'Service Unavailable'}`,
        mode: this.mode,
        model: this.getCurrentModel()
      };
    }

    // 2. Sequential Unload of Previous Model
    this.state = 'switching';
    this.lastError = null;

    try {
      if (typeof this.client?.chat === 'function') {
        await this.client.chat({
          model: previousModel,
          messages: [],
          keep_alive: 0,
          stream: false
        });
      }

      // Verify previous model unloaded from memory
      if (typeof this.client?.ps === 'function') {
        for (let i = 0; i < this.verifyRetries; i++) {
          const psRes = await this.client.ps();
          const isStillLoaded = Array.isArray(psRes?.models) &&
            psRes.models.some((m) => (m.name || m.model || '').toLowerCase().includes(previousModel.toLowerCase()));
          if (!isStillLoaded) break;
          if (this.verifyDelayMs > 0) {
            await new Promise((r) => setTimeout(r, this.verifyDelayMs));
          }
        }
      }

      // 3. Sequential Load of New Model
      this.state = 'loading';
      if (typeof this.client?.chat === 'function') {
        await this.client.chat({
          model: targetConfig.model,
          messages: [],
          keep_alive: this.defaultKeepAlive,
          stream: false
        });
      }

      this.mode = targetMode;
      this.state = 'ready';
      this.lastError = null;

      return {
        success: true,
        previousMode,
        mode: this.mode,
        currentMode: this.mode,
        model: targetConfig.model,
        label: targetConfig.label,
        estimatedRamMB: targetConfig.estimatedRamMB
      };
    } catch (err) {
      // Rollback to previous mode on failure to prevent bricked state
      this.mode = previousMode;
      this.state = 'error';
      this.lastError = err.message || 'Unknown model switching error';

      return {
        success: false,
        statusCode: 500,
        error: `การสลับโหมดล้มเหลว: ${this.lastError}`,
        mode: this.mode,
        model: this.getCurrentModel()
      };
    }
  }
}

export const modelManager = new ModelManager();
