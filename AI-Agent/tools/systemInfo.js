import os from 'node:os';

export const systemInfoTool = {
  name: 'get_system_info',
  description: 'Device RAM usage, CPU cores and uptime.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  dangerous: false,
  async execute() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const totalMemoryMB = Math.round(totalMem / (1024 * 1024));
    const freeMemoryMB = Math.round(freeMem / (1024 * 1024));
    const usedMemoryMB = Math.round(usedMem / (1024 * 1024));
    const memoryUsagePercent = Number(((usedMem / totalMem) * 100).toFixed(1));
    const uptimeHours = Number((os.uptime() / 3600).toFixed(1));

    return {
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalMemoryMB,
      freeMemoryMB,
      usedMemoryMB,
      memoryUsagePercent,
      uptimeHours
    };
  }
};
