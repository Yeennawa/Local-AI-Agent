// Linux Assistant Tool Wrapper
// Connects the Linux Assistant module to the deterministic tool registry.

import { handleLinuxAssistantQuery } from '../linux/linuxAssistant.js';

export const linuxTool = {
  name: 'linux_assistant',
  description: 'Linux systems engineering assistant and command generator for Raspberry Pi OS.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The user query or Linux task description.'
      }
    },
    required: ['query']
  },
  dangerous: false,
  async execute(params = {}, context = {}) {
    const query = params?.query || '';
    return await handleLinuxAssistantQuery(query, {
      chatFn: context?.chatFn,
      model: context?.model
    });
  }
};
