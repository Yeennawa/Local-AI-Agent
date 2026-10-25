import { getOSSnapshot } from '../osMonitor.js';

export const systemInfoTool = {
  name: 'get_system_info',
  description: 'Device RAM usage, CPU load, SoC temperature, and uptime.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  dangerous: false,
  async execute() {
    return await getOSSnapshot();
  }
};
