import { systemInfoTool } from './systemInfo.js';
import { timeTool } from './time.js';

const DEFAULT_TOOL_TIMEOUT_MS = 5000;

export class ToolRegistry {
  constructor({ toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS } = {}) {
    this.tools = new Map();
    this.toolTimeoutMs = toolTimeoutMs;
    this.registerTool(systemInfoTool);
    this.registerTool(timeTool);
  }

  registerTool(tool) {
    if (!tool || !tool.name || typeof tool.execute !== 'function') {
      throw new Error(`Invalid tool definition: ${JSON.stringify(tool)}`);
    }
    this.tools.set(tool.name, tool);
  }

  hasTool(name) {
    return this.tools.has(name);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  // One line per tool. This string goes into every decision prompt, so keep it short.
  getToolsPromptDefinition() {
    return this.getAllTools()
      .map((t) => {
        const keys = Object.keys(t.parameters?.properties || {});
        return `- ${t.name}(${keys.join(', ')}): ${t.description}`;
      })
      .join('\n');
  }

  // Model output is untrusted: keep declared keys only, and check their types.
  cleanParams(tool, params) {
    const declared = tool.parameters?.properties || {};
    const clean = {};
    const input = params && typeof params === 'object' ? params : {};

    for (const [key, spec] of Object.entries(declared)) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== spec.type) {
        throw new Error(`Parameter "${key}" must be a ${spec.type}`);
      }
      clean[key] = value;
    }

    for (const key of tool.parameters?.required || []) {
      if (!(key in clean)) throw new Error(`Missing required parameter "${key}"`);
    }
    return clean;
  }

  // Never throws. The agent loop reads success/error instead of wrapping try/catch.
  async executeTool(name, params = {}) {
    const startTime = Date.now();
    const fail = (error, used = params) => ({
      success: false,
      tool: name,
      params: used,
      error,
      durationMs: Date.now() - startTime
    });

    if (!this.hasTool(name)) {
      return fail(`Tool not found: "${name}". Allowed tools: [${[...this.tools.keys()].join(', ')}]`);
    }

    const tool = this.getTool(name);
    let clean;
    try {
      clean = this.cleanParams(tool, params);
    } catch (error) {
      return fail(error.message);
    }

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tool "${name}" timed out after ${this.toolTimeoutMs}ms`)),
        this.toolTimeoutMs
      );
    });

    try {
      const result = await Promise.race([tool.execute(clean), timeout]);
      return {
        success: true,
        tool: name,
        params: clean,
        result,
        durationMs: Date.now() - startTime
      };
    } catch (error) {
      return fail(error.message || 'Execution failed', clean);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const toolRegistry = new ToolRegistry();
