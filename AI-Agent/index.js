/**
 * Local AI Agent Entry Point
 * Deep Module interface for Group Backend and external integrations.
 */
export { runAgent } from './agent.js';
export { toolRegistry } from './tools/registry.js';
export { routeIntent, extractTopic, extractMathExpression, extractGithubQuery } from './router.js';
export { SessionMemory, sessionMemory } from './memory.js';
export { RequestQueue, requestQueue } from './queue.js';

