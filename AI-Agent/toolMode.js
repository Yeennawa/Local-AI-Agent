// Deep Module: ToolModePolicy
// Pure functional policy governing tool activation modes (auto, chat, search).
// Zero I/O, zero token consumption, deterministic seam.

export const TOOL_MODES = ['auto', 'chat', 'search', 'linux'];

export function normalizeToolMode(value) {
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (TOOL_MODES.includes(lower)) {
      return lower;
    }
  }
  return 'auto';
}

const LOCAL_AND_STRUCTURED_TOOLS = new Set([
  'get_current_time',
  'get_system_info',
  'calculate',
  'get_weather',
  'get_fx'
]);

const META_OR_DIRECT_REASONS = new Set([
  'model_identity',
  'conversational_feedback',
  'greeting_chat',
  'emotional_opinion_chat',
  'empty_input',
  'capabilities',
  'unsupported_platform',
  'joke_request',
  'slang_definition',
  'roleplay_persona'
]);

const QUESTION_MARKER_REGEX = /(?:ไหม|มั้ย|หรือ|อะไร|ใคร|ที่ไหน|เมื่อไหร่|อย่างไร|ทำไม|เท่าไหร่|กี่|\?)/i;

/**
 * Applies tool mode policy to a routed intent without mutating internal router logic.
 *
 * @param {Object} route - The route result produced by routeIntent()
 * @param {Object} options
 * @param {string} [options.toolMode='auto'] - 'auto' | 'chat' | 'search'
 * @param {string} [options.message=''] - Original user message
 * @returns {Object} Adjusted route object
 */
export function applyToolModePolicy(route, { toolMode = 'auto', message = '' } = {}) {
  const mode = normalizeToolMode(toolMode);

  // 1. Auto mode: strictly identical to router output
  if (mode === 'auto') {
    return route;
  }

  // 2. Preserved intents across all modes (meta, identity, jokes, direct, feedback, greeting)
  if (
    route.intent === 'direct' ||
    route.intent === 'joke' ||
    route.intent === 'slang' ||
    route.intent === 'roleplay' ||
    META_OR_DIRECT_REASONS.has(route.reason)
  ) {
    return route;
  }

  // 3. In-device local tools & structured data are preserved across all modes
  if (route.intent === 'tool' && LOCAL_AND_STRUCTURED_TOOLS.has(route.toolCall?.name)) {
    return route;
  }

  // 4. Chat Mode: suppress external search and knowledge tools
  if (mode === 'chat') {
    if (route.intent === 'tool') {
      return {
        intent: 'finish',
        toolCall: null,
        confidence: 'high',
        reason: 'tool_mode_chat'
      };
    }
    return route;
  }

  // 5. Search Mode: boost knowledge & substantive queries to live web search
  if (mode === 'search') {
    // If router picked Wikipedia or News, redirect to deep live web search (Tavily AI Primary)
    if (route.intent === 'tool' && (route.toolCall?.name === 'search_wikipedia' || route.toolCall?.name === 'get_news')) {
      const fullQuery = (typeof message === 'string' && message.trim())
        ? message.trim()
        : (route.toolCall.params?.topic || route.toolCall.params?.query || '');
      return {
        intent: 'tool',
        toolCall: {
          name: 'search_web',
          params: { query: fullQuery }
        },
        confidence: 'high',
        reason: 'tool_mode_search_override'
      };
    }

    // In search mode, any substantive prompt falling through default_chat or general knowledge is promoted to search_web
    if (route.intent === 'finish' && (route.reason === 'default_chat' || route.reason === 'practical_qa' || route.reason === 'edibility_qa')) {
      const queryStr = (typeof message === 'string') ? message.trim() : '';
      if (queryStr.length >= 2) {
        return {
          intent: 'tool',
          toolCall: {
            name: 'search_web',
            params: { query: queryStr }
          },
          confidence: 'high',
          reason: 'tool_mode_search_prompt'
        };
      }
    }

    return route;
  }

  // 6. Linux Mode: route directly to linux_assistant tool
  if (mode === 'linux') {
    const queryStr = (typeof message === 'string') ? message.trim() : '';
    return {
      intent: 'tool',
      toolCall: {
        name: 'linux_assistant',
        params: { query: queryStr }
      },
      confidence: 'high',
      reason: 'tool_mode_linux'
    };
  }

  return route;
}
