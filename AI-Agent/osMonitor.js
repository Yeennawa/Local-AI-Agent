// Deep Module: Linux OS Kernel Telemetry & Active Pressure Governor (osMonitor.js)
// Extracts real Linux kernel metrics (/proc/meminfo, /sys/block/zram0, /sys/class/thermal),
// measures CPU tick deltas, process PCB RSS, and governs active OOM/thermal throttling.
// Designed for Raspberry Pi 5 with graceful cross-platform fallback for development.

import os from 'node:os';
import fs from 'node:fs';
import process from 'node:process';

let prevCpuTicks = null;

function sampleCpuTicks() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

// Initialize tick baseline
prevCpuTicks = sampleCpuTicks();

export function computeCpuPercent() {
  const current = sampleCpuTicks();
  if (!prevCpuTicks) {
    prevCpuTicks = current;
    return 0;
  }

  const idleDelta = current.idle - prevCpuTicks.idle;
  const totalDelta = current.total - prevCpuTicks.total;
  prevCpuTicks = current;

  if (totalDelta <= 0) return 0;
  const usage = Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
  return Number(usage.toFixed(1));
}

export function parseProcMeminfo() {
  try {
    if (!fs.existsSync('/proc/meminfo')) return null;
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const data = {};
    for (const line of content.split('\n')) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const val = parseInt(parts[1].trim().split(' ')[0], 10);
        if (!isNaN(val)) data[key] = val;
      }
    }
    return data;
  } catch {
    return null;
  }
}

export function parseZramStat() {
  try {
    const mmStatPath = '/sys/block/zram0/mm_stat';
    if (fs.existsSync(mmStatPath)) {
      const content = fs.readFileSync(mmStatPath, 'utf8').trim();
      const parts = content.split(/\s+/).map((n) => parseInt(n, 10));
      if (parts.length >= 3) {
        const origDataSize = parts[0];
        const comprDataSize = parts[1];
        const memUsedTotal = parts[2];
        const ratio = comprDataSize > 0 ? Number((origDataSize / comprDataSize).toFixed(2)) : 1.0;
        return {
          zramActive: true,
          origDataMB: Number((origDataSize / (1024 * 1024)).toFixed(1)),
          comprDataMB: Number((comprDataSize / (1024 * 1024)).toFixed(1)),
          memUsedMB: Number((memUsedTotal / (1024 * 1024)).toFixed(1)),
          compressionRatio: ratio
        };
      }
    }
  } catch {
    // Non-fatal if not running on Linux with ZRAM
  }

  return { zramActive: false, compressionRatio: 1.0 };
}

export function readSoCTemp() {
  try {
    const thermalPath = '/sys/class/thermal/thermal_zone0/temp';
    if (fs.existsSync(thermalPath)) {
      const raw = parseInt(fs.readFileSync(thermalPath, 'utf8').trim(), 10);
      if (!isNaN(raw)) {
        return Number((raw / 1000).toFixed(1));
      }
    }
  } catch {
    // Non-fatal fallback
  }
  return null;
}

export function getOSPressureState({ memAvailableMB = 1500, tempC = null } = {}) {
  // Critical pressure threshold: under 450MB RAM available (Linux OOM killer danger zone on Pi 5)
  if (memAvailableMB < 450) {
    return { level: 'critical', reason: 'oom_risk', memAvailableMB, tempC };
  }

  // Warning pressure threshold: under 800MB RAM or SoC above 78°C
  if (memAvailableMB < 800 || (typeof tempC === 'number' && tempC > 78)) {
    return {
      level: 'warning',
      reason: (typeof tempC === 'number' && tempC > 78) ? 'thermal_throttling' : 'low_memory',
      memAvailableMB,
      tempC
    };
  }

  return { level: 'normal', reason: 'ok', memAvailableMB, tempC };
}

export function applyOSGovernorPolicy(pressureState, { model = 'qwen2.5:1.5b', maxTokens = 768 } = {}) {
  const level = pressureState?.level || 'normal';

  if (level === 'critical') {
    return {
      model: 'qwen2.5:1.5b', // Force small model under critical pressure
      maxTokens: 256,
      throttled: true,
      reason: 'Critical OS RAM pressure: forced lite model & compact output'
    };
  }

  if (level === 'warning') {
    return {
      model,
      maxTokens: Math.min(maxTokens, 512),
      throttled: true,
      reason: 'Elevated OS pressure: capped max output tokens'
    };
  }

  return {
    model,
    maxTokens,
    throttled: false,
    reason: 'Normal OS operating conditions'
  };
}

export async function getOSSnapshot() {
  const platform = os.platform();
  const arch = os.arch();
  const cpuCores = (os.cpus() || []).length || 4;
  const loadAvg = os.loadavg();
  const uptimeHours = Number((os.uptime() / 3600).toFixed(1));
  const cpuPercent = computeCpuPercent();
  const procMem = parseProcMeminfo();
  const zram = parseZramStat();
  const tempC = readSoCTemp();

  let totalMemoryMB;
  let freeMemoryMB;
  let usedMemoryMB;
  let memAvailableMB;
  let ramPercent;

  if (procMem && procMem.MemTotal) {
    totalMemoryMB = Math.round(procMem.MemTotal / 1024);
    freeMemoryMB = Math.round((procMem.MemFree || 0) / 1024);
    memAvailableMB = Math.round((procMem.MemAvailable || procMem.MemFree || 0) / 1024);
    usedMemoryMB = totalMemoryMB - memAvailableMB;
    ramPercent = Number(((usedMemoryMB / totalMemoryMB) * 100).toFixed(1));
  } else {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    totalMemoryMB = Math.round(totalBytes / (1024 * 1024));
    freeMemoryMB = Math.round(freeBytes / (1024 * 1024));
    memAvailableMB = freeMemoryMB;
    usedMemoryMB = totalMemoryMB - freeMemoryMB;
    ramPercent = Number(((usedMemoryMB / totalMemoryMB) * 100).toFixed(1));
  }

  const memUsage = process.memoryUsage();
  const processRssMB = Number((memUsage.rss / (1024 * 1024)).toFixed(1));
  const processHeapUsedMB = Number((memUsage.heapUsed / (1024 * 1024)).toFixed(1));

  const pressure = getOSPressureState({ memAvailableMB, tempC });

  return {
    platform,
    arch,
    cpuCores,
    totalMemoryMB,
    freeMemoryMB,
    usedMemoryMB,
    memAvailableMB,
    ramPercent,
    memoryUsagePercent: ramPercent,
    cpuPercent,
    loadAvg,
    uptimeHours,
    tempC,
    zram,
    processRssMB,
    processHeapUsedMB,
    governorState: pressure
  };
}
