// Web Search Tool delegation wrapper (maintains backwards compatibility)
// Delegates directly to dedicated modular tools: tavilyTool and duckDuckGoTool.
// Prevents code duplication and avoids redundant network implementations.

import { tavilyTool } from './tavily.js';
import { duckDuckGoTool } from './duckduckgo.js';

export const webSearchTool = {
  name: 'search_web',
  description: 'Search the live web using Tavily with automatic fallback to DuckDuckGo.',
  parameters: tavilyTool.parameters,
  dangerous: false,
  async execute(params = {}) {
    // 1. Primary: Delegate to dedicated Tavily tool
    const tavilyRes = await tavilyTool.execute(params);
    if (tavilyRes && tavilyRes.found) {
      return {
        ...tavilyRes,
        source: 'tavily'
      };
    }

    // 2. Fallback: Delegate to dedicated DuckDuckGo tool
    const ddgRes = await duckDuckGoTool.execute(params);
    return {
      ...ddgRes,
      source: 'duckduckgo'
    };
  }
};
