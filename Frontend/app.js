const USE_MOCK_API = false;
const USE_STREAMING = true;
const API_URL = "/api/chat";
const STREAM_API_URL = "/api/chat/stream";

// Pi 5 Endurance Timeouts:
// Idle watchdog resets on every SSE chunk (including 10s server `: ping` heartbeats)
const STREAM_IDLE_TIMEOUT = 360000; // 6 minutes of complete silence before abort
const STREAM_MAX_TIMEOUT = 900000;  // 15 minutes absolute ceiling for heavy queue + 3B inference
const API_TIMEOUT = 600000;         // 10 minutes for non-streaming fallback

const FEELINGS = ["happy", "neutral", "surprised", "confused", "proud"];

// Keep turn history in tab memory so the Express server stays stateless across requests.
const history = [];

function getOrCreateSessionId() {
  let id = localStorage.getItem("ai_agent_session_id");
  if (!id) {
    id = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("ai_agent_session_id", id);
  }
  return id;
}

let currentSessionId = getOrCreateSessionId();

// Core Chat & Header Controls
const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const sendButton = document.getElementById("send-button");
const chatFeed = document.getElementById("chat-feed");
const newChatButton = document.getElementById("new-chat-button");
const aiCharacter = document.querySelector(".ai-character");
const modelSwitcher = document.getElementById("model-switcher");
const modeLiteBtn = document.getElementById("mode-lite-btn");
const modeAdvancedBtn = document.getElementById("mode-advanced-btn");
const modelStatusBadge = document.getElementById("model-status-badge");

const toolModeSwitcher = document.getElementById("tool-mode-switcher");
const toolModeAutoBtn = document.getElementById("tool-mode-auto-btn");
const toolModeChatBtn = document.getElementById("tool-mode-chat-btn");
const toolModeSearchBtn = document.getElementById("tool-mode-search-btn");
const toolNoticeBanner = document.getElementById("tool-notice-banner");
const noticeText = document.getElementById("notice-text");
const noticeClose = document.getElementById("notice-close");

// Linux OS Runqueue v2 Modal & Minimized Pill Elements
const queueMinimizedPill = document.getElementById("queue-minimized-pill");
const queueMinimizedText = document.getElementById("queue-minimized-text");
const queueExpandBtn = document.getElementById("queue-expand-btn");
const queueModalBackdrop = document.getElementById("queue-modal-backdrop");
const queueMinimizeBtn = document.getElementById("queue-minimize-btn");
const queueYourPosition = document.getElementById("queue-your-position");
const queueEstWait = document.getElementById("queue-est-wait");
const queueElapsedTimer = document.getElementById("queue-elapsed-timer");
const queueRunningText = document.getElementById("queue-running-text");
const queueWaitingList = document.getElementById("queue-waiting-list");
const queueCancelBtn = document.getElementById("queue-cancel-btn");

// Telemetry Drawer Elements
const telemetryToggleButton = document.getElementById("telemetry-toggle-button");
const telemetryDrawer = document.getElementById("telemetry-drawer");
const drawerCloseBtn = document.getElementById("drawer-close-btn");
const drawerModelPill = document.getElementById("drawer-model-pill");
const contextPercentText = document.getElementById("context-percent-text");
const contextMeterFill = document.getElementById("context-meter-fill");
const contextTokensText = document.getElementById("context-tokens-text");
const contextStatusTag = document.getElementById("context-status-tag");
const memoryTurnsText = document.getElementById("memory-turns-text");
const memoryMeterFill = document.getElementById("memory-meter-fill");
const memoryCharsText = document.getElementById("memory-chars-text");
const memoryFocusText = document.getElementById("memory-focus-text");
const turnTypeBadge = document.getElementById("turn-type-badge");
const statPromptTokens = document.getElementById("stat-prompt-tokens");
const statCompletionTokens = document.getElementById("stat-completion-tokens");
const statTurnTotal = document.getElementById("stat-turn-total");
const statTokensSpeed = document.getElementById("stat-tokens-speed");
const sessionTotalTokens = document.getElementById("session-total-tokens");
const sessionLlmCalls = document.getElementById("session-llm-calls");
const sessionDeterministicTurns = document.getElementById("session-deterministic-turns");
const appContainer = document.querySelector(".app-container");

// OS & Kernel Elements
const osRamAvailable = document.getElementById("os-ram-available");
const osZramStat = document.getElementById("os-zram-stat");
const osSocTemp = document.getElementById("os-soc-temp");
const osCpuLoad = document.getElementById("os-cpu-load");
const osProcessRss = document.getElementById("os-process-rss");
const osGovernorTag = document.getElementById("os-governor-tag");

// Tavily Diagnostics Elements
const tavilyDiagCard = document.getElementById("tavily-diag-card");
const tavilyStatusTag = document.getElementById("tavily-status-tag");
const tavilyStatusTitle = document.getElementById("tavily-status-title");
const tavilyKeySource = document.getElementById("tavily-key-source");
const tavilyMaskedKey = document.getElementById("tavily-masked-key");
const tavilyAdviceText = document.getElementById("tavily-advice-text");
const tavilyProbeBtn = document.getElementById("tavily-probe-btn");

// Application Runtime States
let isTelemetryOpen = localStorage.getItem("ai_agent_telemetry_open") === "1";
let currentModelMode = "lite";
let isGenerating = false;
let isSwitchingModel = false;
let currentToolMode = localStorage.getItem("ai_agent_tool_mode") || "auto";
let noticeTimer = null;

// Sliding Memory Tracking for Real-Time Optimistic Updates
let lastConfirmedMemoryTurns = 0;
let lastKnownMaxTurns = 30;
let lastConfirmedCharsUsed = 0;
let lastKnownMaxChars = 3200;
let lastConfirmedFocusEntity = null;

// Active Stream & Queue States
let activeStreamAbortController = null;
let userCancelledRequest = false;
let isQueueMinimized = false;
let isCurrentlyQueued = false;
let queueWaitStartedAt = 0;
let queueClockInterval = null;

// Live OS Kernel Polling Loop
let osMetricsTimer = null;
let osMetricsIntervalMs = 0;

function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "0";
  return num.toLocaleString("th-TH");
}

function formatDurationMMSS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

// ============================================================================
// T1: Interactive Lock Synchronization (Prevents Mid-Thought Model Switch Bug)
// ============================================================================
function syncInteractiveLocks() {
  const busy = isGenerating || isSwitchingModel;

  if (promptInput) promptInput.disabled = busy;
  if (sendButton) {
    sendButton.disabled = busy;
    sendButton.textContent = busy ? "รอ" : "ส่ง";
  }

  if (modeLiteBtn) {
    modeLiteBtn.disabled = busy;
    modeLiteBtn.title = isGenerating
      ? "รอให้ AI ตอบคำถามปัจจุบันเสร็จก่อนจึงจะสลับโมเดลได้"
      : "โหมดประหยัด RAM (1.5B)";
  }
  if (modeAdvancedBtn) {
    modeAdvancedBtn.disabled = busy;
    modeAdvancedBtn.title = isGenerating
      ? "รอให้ AI ตอบคำถามปัจจุบันเสร็จก่อนจึงจะสลับโมเดลได้"
      : "โหมดประสิทธิภาพสูง (3B)";
  }

  if (toolModeAutoBtn) toolModeAutoBtn.disabled = busy;
  if (toolModeChatBtn) toolModeChatBtn.disabled = busy;
  if (toolModeSearchBtn) toolModeSearchBtn.disabled = busy;
  if (newChatButton) newChatButton.disabled = busy;

  if (modelSwitcher) modelSwitcher.classList.toggle("is-busy-locked", busy);
  if (toolModeSwitcher) toolModeSwitcher.classList.toggle("is-busy-locked", busy);
}

function setLoadingState(isLoading) {
  syncInteractiveLocks();
  if (!isLoading && promptInput && !isSwitchingModel && !isGenerating) {
    promptInput.disabled = false;
  }
}

// ============================================================================
// T5: Real-Time OS & Kernel Telemetry Polling + Sliding Memory Green Meter
// ============================================================================
async function fetchOSMetrics() {
  try {
    const res = await fetch("/api/os/metrics");
    if (!res.ok) return;
    const data = await res.json();
    if (osRamAvailable && data.memAvailableMB !== undefined) {
      osRamAvailable.textContent = `${formatNumber(data.memAvailableMB)} MB / ${formatNumber(data.totalMemoryMB)} MB`;
    }
    if (osZramStat) {
      if (data.zram && data.zram.zramActive) {
        osZramStat.textContent = `${data.zram.comprDataMB} MB (${data.zram.compressionRatio}x)`;
      } else {
        osZramStat.textContent = "ปกติ (0 Disk Writes)";
      }
    }
    if (osSocTemp) {
      osSocTemp.textContent = data.tempC !== null && data.tempC !== undefined ? `${data.tempC} °C` : "ปกติ";
    }
    if (osCpuLoad) {
      osCpuLoad.textContent = `${data.cpuPercent}% (3 AI / 1 OS)`;
    }
    if (osProcessRss) {
      osProcessRss.textContent = `${data.processRssMB} MB`;
    }
    if (osGovernorTag && data.governorState) {
      const level = data.governorState.level;
      osGovernorTag.className = "os-gov-tag";
      if (level === "critical") {
        osGovernorTag.classList.add("tag-critical");
        osGovernorTag.textContent = "วิกฤต (OOM)";
      } else if (level === "warning") {
        osGovernorTag.classList.add("tag-warning");
        osGovernorTag.textContent = "เฝ้าระวัง";
      } else {
        osGovernorTag.classList.add("tag-healthy");
        osGovernorTag.textContent = "ปกติ";
      }
    }
  } catch {
    // Non-fatal network hiccup
  }
}

function syncOSMetricsLiveLoop() {
  let desiredInterval = 0;
  if (isGenerating) {
    desiredInterval = 2000;
  } else if (isTelemetryOpen && document.visibilityState === "visible") {
    desiredInterval = 4000;
  }

  if (desiredInterval === osMetricsIntervalMs) return;

  if (osMetricsTimer) {
    clearInterval(osMetricsTimer);
    osMetricsTimer = null;
  }
  osMetricsIntervalMs = desiredInterval;

  if (desiredInterval > 0) {
    fetchOSMetrics();
    osMetricsTimer = setInterval(function () {
      if (document.visibilityState === "visible" || isGenerating) {
        fetchOSMetrics();
      }
    }, desiredInterval);
  }
}

function renderMemoryMeter(turnsUsed, maxTurns, charsUsed, maxChars, focusEntity) {
  const safeTurns = Math.max(0, Number(turnsUsed) || 0);
  const safeMaxTurns = Math.max(1, Number(maxTurns) || 30);
  const rawPct = Math.min(100, Math.round(((safeTurns / safeMaxTurns) * 100) * 10) / 10);
  const displayWidth = safeTurns > 0 ? Math.max(4, rawPct) : 0;

  if (memoryTurnsText) {
    memoryTurnsText.textContent = `${safeTurns} / ${safeMaxTurns} รอบ`;
  }
  if (memoryMeterFill) {
    memoryMeterFill.style.width = `${displayWidth}%`;
    memoryMeterFill.classList.remove("meter-normal", "meter-warning", "meter-danger");
    if (safeTurns >= 26) {
      memoryMeterFill.classList.add("meter-danger");
    } else if (safeTurns >= 19) {
      memoryMeterFill.classList.add("meter-warning");
    } else {
      memoryMeterFill.classList.add("meter-normal");
    }
  }
  if (memoryCharsText && charsUsed !== undefined) {
    const safeMaxChars = Number(maxChars) || 3200;
    const clampedChars = Math.min(safeMaxChars, Math.max(0, Number(charsUsed) || 0));
    memoryCharsText.textContent = `${formatNumber(clampedChars)} / ${formatNumber(safeMaxChars)} ตัวอักษร`;
  }
  if (memoryFocusText && focusEntity !== undefined) {
    memoryFocusText.textContent = focusEntity ? focusEntity : "ไม่มี";
  }
}

function setTelemetryDrawerState(open) {
  isTelemetryOpen = Boolean(open);
  localStorage.setItem("ai_agent_telemetry_open", isTelemetryOpen ? "1" : "0");
  if (telemetryDrawer) {
    telemetryDrawer.classList.toggle("hidden", !isTelemetryOpen);
  }
  if (telemetryToggleButton) {
    telemetryToggleButton.classList.toggle("active", isTelemetryOpen);
  }
  if (appContainer) {
    appContainer.classList.toggle("drawer-open", isTelemetryOpen);
  }
  syncOSMetricsLiveLoop();
  if (isTelemetryOpen) {
    fetchTavilyDiagnostics(false);
  }
}

if (telemetryToggleButton) {
  telemetryToggleButton.addEventListener("click", function () {
    setTelemetryDrawerState(!isTelemetryOpen);
  });
}

if (drawerCloseBtn) {
  drawerCloseBtn.addEventListener("click", function () {
    setTelemetryDrawerState(false);
  });
}

// ============================================================================
// T3: Detailed Tavily API Key Diagnostics & Live Server Probe
// ============================================================================
function mapKeySourceLabel(source) {
  switch (source) {
    case "env_var":
      return "Environment Variable (Server)";
    case "dotenv_file":
      return "ไฟล์ .env บนเครื่อง Server";
    case "dotenv_txt_file":
      return "ไฟล์ .env.txt (แนะนำแก้ชื่อเป็น .env)";
    case "override":
      return "ตั้งค่าทดสอบ (Override)";
    default:
      return "ไม่ได้ตั้งค่าบน Server";
  }
}

function renderTavilyDiagnostics(diag) {
  if (!diag) return;

  if (tavilyStatusTitle) {
    tavilyStatusTitle.textContent = diag.statusTitleThai || diag.statusCode || "-";
  }
  if (tavilyKeySource) {
    tavilyKeySource.textContent = mapKeySourceLabel(diag.keySource);
  }
  if (tavilyMaskedKey) {
    tavilyMaskedKey.textContent = diag.maskedKey
      ? `${diag.maskedKey} (${diag.keyLength || 0} ตัวอักษร)`
      : "ไม่มี Key";
  }
  if (tavilyAdviceText && diag.troubleshootingThai) {
    const latencyNote = typeof diag.lastLatencyMs === "number" && diag.lastLatencyMs > 0
      ? ` [เวลาตอบสนองล่าสุด: ${diag.lastLatencyMs} ms]`
      : "";
    tavilyAdviceText.textContent = diag.troubleshootingThai + latencyNote;
  }

  if (tavilyStatusTag && tavilyDiagCard) {
    tavilyStatusTag.className = "os-gov-tag";
    tavilyDiagCard.classList.remove("state-warning", "state-error");

    if (diag.statusCode === "verified_ok") {
      tavilyStatusTag.classList.add("tag-healthy");
      tavilyStatusTag.textContent = "เชื่อมต่อสำเร็จ";
    } else if (diag.statusCode === "configured_ready") {
      tavilyStatusTag.classList.add("tag-healthy");
      tavilyStatusTag.textContent = "พบ Key แล้ว";
    } else if (diag.statusCode === "key_missing" || diag.statusCode === "quota_exceeded_429" || diag.statusCode === "timeout") {
      tavilyStatusTag.classList.add("tag-warning");
      tavilyDiagCard.classList.add("state-warning");
      tavilyStatusTag.textContent = diag.statusCode === "key_missing" ? "ใช้ DuckDuckGo" : "โควตา/ล่าช้า";
    } else {
      tavilyStatusTag.classList.add("tag-critical");
      tavilyDiagCard.classList.add("state-error");
      tavilyStatusTag.textContent = "พบปัญหา";
    }
  }
}

async function fetchTavilyDiagnostics(probe) {
  if (tavilyProbeBtn && probe) {
    tavilyProbeBtn.disabled = true;
    tavilyProbeBtn.textContent = "กำลังทดสอบจาก Server...";
  }

  try {
    const url = probe ? "/api/tools/diagnostics?probe=1" : "/api/tools/diagnostics";
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    renderTavilyDiagnostics(data);
    if (probe && data) {
      showNoticeBanner(`ผลการตรวจสอบ Tavily จาก Server: ${data.statusTitleThai} — ${data.troubleshootingThai}`);
    }
    return data;
  } catch {
    if (probe) {
      showNoticeBanner("ไม่สามารถติดต่อ Endpoint ตรวจสอบสถานะของ Server ได้ในขณะนี้");
    }
    return null;
  } finally {
    if (tavilyProbeBtn && probe) {
      tavilyProbeBtn.disabled = false;
      tavilyProbeBtn.textContent = "ทดสอบ Tavily API";
    }
  }
}

if (tavilyProbeBtn) {
  tavilyProbeBtn.addEventListener("click", function () {
    fetchTavilyDiagnostics(true);
  });
}

// ============================================================================
// Telemetry Snapshot UI Updater & Reset
// ============================================================================
function updateTelemetryUI(usage) {
  if (!usage) return;

  try {
    localStorage.setItem("ai_agent_telemetry_snapshot", JSON.stringify(usage));
  } catch {}

  const modelLabel = usage.modelLabel || (currentModelMode === "advanced" ? "Qwen2.5 3B" : "Qwen2.5 1.5B");
  if (drawerModelPill) {
    drawerModelPill.textContent = modelLabel;
  }

  // 1. Context Window Budget
  const cw = usage.contextWindow || {};
  const usedTokens = cw.usedTokens || 0;
  const maxTokens = cw.maxTokens || 4096;
  const percent = maxTokens > 0 ? Math.min(100, Math.round(((usedTokens / maxTokens) * 100) * 10) / 10) : 0;

  if (contextPercentText) {
    contextPercentText.textContent = `${percent.toFixed(1)}%`;
  }
  if (contextTokensText) {
    contextTokensText.textContent = `${formatNumber(usedTokens)} / ${formatNumber(maxTokens)} tokens`;
  }
  if (contextMeterFill) {
    contextMeterFill.style.width = `${Math.min(100, percent)}%`;
    contextMeterFill.classList.remove("meter-normal", "meter-warning", "meter-danger");
    if (percent > 80) {
      contextMeterFill.classList.add("meter-danger");
    } else if (percent > 55) {
      contextMeterFill.classList.add("meter-warning");
    } else {
      contextMeterFill.classList.add("meter-normal");
    }
  }
  if (contextStatusTag) {
    contextStatusTag.classList.remove("tag-healthy", "tag-warning", "tag-danger");
    if (percent > 80) {
      contextStatusTag.classList.add("tag-danger");
      contextStatusTag.textContent = "ใกล้เต็ม";
    } else if (percent > 55) {
      contextStatusTag.classList.add("tag-warning");
      contextStatusTag.textContent = "ปานกลาง";
    } else {
      contextStatusTag.classList.add("tag-healthy");
      contextStatusTag.textContent = "ปกติ";
    }
  }

  // 2. Sliding Memory Capacity (30 turns)
  lastConfirmedMemoryTurns = cw.historyTurnsUsed || 0;
  lastKnownMaxTurns = cw.maxHistoryTurns || 30;
  lastConfirmedCharsUsed = cw.contextCharsUsed || 0;
  lastKnownMaxChars = cw.maxContextChars || 3200;
  lastConfirmedFocusEntity = cw.focusEntity || null;

  renderMemoryMeter(
    lastConfirmedMemoryTurns,
    lastKnownMaxTurns,
    lastConfirmedCharsUsed,
    lastKnownMaxChars,
    lastConfirmedFocusEntity
  );

  // 3. Last Turn Telemetry
  const lt = usage.lastTurn || {};
  if (turnTypeBadge) {
    turnTypeBadge.classList.toggle("deterministic", Boolean(lt.isDeterministic));
    turnTypeBadge.textContent = lt.isDeterministic ? "ตอบทันที (0 Token)" : "สังเคราะห์ LLM";
  }
  if (statPromptTokens) {
    statPromptTokens.textContent = formatNumber(lt.promptTokens || 0);
  }
  if (statCompletionTokens) {
    statCompletionTokens.textContent = formatNumber(lt.completionTokens || 0);
  }
  if (statTurnTotal) {
    statTurnTotal.textContent = formatNumber(lt.totalTokens || 0);
  }
  if (statTokensSpeed) {
    if (lt.isDeterministic) {
      statTokensSpeed.textContent = "0 ms";
    } else if (lt.tokensPerSec && lt.tokensPerSec > 0) {
      statTokensSpeed.textContent = `${lt.tokensPerSec} t/s`;
    } else {
      statTokensSpeed.textContent = "-";
    }
  }

  // 4. Session Cumulative Totals
  const st = usage.sessionTotal || {};
  if (sessionTotalTokens) {
    sessionTotalTokens.textContent = formatNumber(st.totalTokens || 0);
  }
  if (sessionLlmCalls) {
    sessionLlmCalls.textContent = `${formatNumber(st.llmCalls || 0)} ครั้ง`;
  }
  if (sessionDeterministicTurns) {
    sessionDeterministicTurns.textContent = `${formatNumber(st.deterministicTurns || 0)} ครั้ง`;
  }

  fetchOSMetrics();
}

function resetTelemetryUI() {
  try {
    localStorage.removeItem("ai_agent_telemetry_snapshot");
  } catch {}

  lastConfirmedMemoryTurns = 0;
  lastKnownMaxTurns = 30;
  lastConfirmedCharsUsed = 0;
  lastKnownMaxChars = 3200;
  lastConfirmedFocusEntity = null;

  if (contextPercentText) contextPercentText.textContent = "0.0%";
  if (contextTokensText) contextTokensText.textContent = "0 / 4,096 tokens";
  if (contextMeterFill) {
    contextMeterFill.style.width = "0%";
    contextMeterFill.className = "meter-fill meter-normal";
  }
  if (contextStatusTag) {
    contextStatusTag.className = "meter-status-tag tag-healthy";
    contextStatusTag.textContent = "ปกติ";
  }

  renderMemoryMeter(0, 30, 0, 3200, null);
  if (memoryMeterFill) {
    memoryMeterFill.className = "meter-fill meter-normal";
  }

  if (turnTypeBadge) {
    turnTypeBadge.className = "turn-type-badge";
    turnTypeBadge.textContent = "พร้อมใช้งาน";
  }
  if (statPromptTokens) statPromptTokens.textContent = "0";
  if (statCompletionTokens) statCompletionTokens.textContent = "0";
  if (statTurnTotal) statTurnTotal.textContent = "0";
  if (statTokensSpeed) statTokensSpeed.textContent = "0 t/s";
  if (sessionTotalTokens) sessionTotalTokens.textContent = "0";
  if (sessionLlmCalls) sessionLlmCalls.textContent = "0 ครั้ง";
  if (sessionDeterministicTurns) sessionDeterministicTurns.textContent = "0 ครั้ง";

  fetchOSMetrics();
}

// ============================================================================
// T2: Linux OS FIFO Runqueue v2 Modal & Minimized Pill Controller
// ============================================================================
function stopQueueClock() {
  if (queueClockInterval) {
    clearInterval(queueClockInterval);
    queueClockInterval = null;
  }
}

function startQueueClock() {
  stopQueueClock();
  if (!queueWaitStartedAt) queueWaitStartedAt = Date.now();
  if (queueElapsedTimer) {
    queueElapsedTimer.textContent = formatDurationMMSS(Date.now() - queueWaitStartedAt);
  }
  queueClockInterval = setInterval(function () {
    if (queueElapsedTimer && queueWaitStartedAt) {
      queueElapsedTimer.textContent = formatDurationMMSS(Date.now() - queueWaitStartedAt);
    }
  }, 1000);
}

function closeQueueUI() {
  isCurrentlyQueued = false;
  isQueueMinimized = false;
  queueWaitStartedAt = 0;
  stopQueueClock();
  if (queueModalBackdrop) queueModalBackdrop.classList.add("hidden");
  if (queueMinimizedPill) queueMinimizedPill.classList.add("hidden");
}

function syncQueueVisibility() {
  if (!isCurrentlyQueued) {
    if (queueModalBackdrop) queueModalBackdrop.classList.add("hidden");
    if (queueMinimizedPill) queueMinimizedPill.classList.add("hidden");
    return;
  }
  if (isQueueMinimized) {
    if (queueModalBackdrop) queueModalBackdrop.classList.add("hidden");
    if (queueMinimizedPill) queueMinimizedPill.classList.remove("hidden");
  } else {
    if (queueModalBackdrop) queueModalBackdrop.classList.remove("hidden");
    if (queueMinimizedPill) queueMinimizedPill.classList.add("hidden");
  }
}

function updateQueueModal(snap) {
  if (!snap || !snap.yourJob || snap.yourJob.position <= 0 || snap.yourJob.state === "TASK_RUNNING") {
    closeQueueUI();
    return;
  }

  const pos = snap.yourJob.position;
  isCurrentlyQueued = true;
  if (!queueWaitStartedAt) {
    queueWaitStartedAt = snap.yourJob.enqueuedAt || Date.now();
    startQueueClock();
  }

  if (queueYourPosition) {
    queueYourPosition.textContent = `คิวที่ #${pos}`;
  }
  if (queueEstWait) {
    const estSec = snap.yourJob.estimatedWaitSec || 18;
    queueEstWait.textContent = `เวลารอโดยประมาณ ~${estSec} วินาที`;
  }
  if (queueMinimizedText) {
    queueMinimizedText.textContent = `กำลังรอคิวประมวลผล ลำดับที่ #${pos} (กดดูรายละเอียด)`;
  }

  if (queueRunningText) {
    if (snap.runningJob) {
      const runSec = Math.max(0, Math.round((snap.runningJob.elapsedMs || 0) / 1000));
      const taskLabel = snap.runningJob.taskType === "model_switch" ? "สลับโมเดล" : "ประมวลผลคำตอบ";
      queueRunningText.textContent = `PID ${snap.runningJob.pid} | ${snap.runningJob.clientLabel} (${taskLabel} ${runSec} วิ)`;
    } else {
      queueRunningText.textContent = "กำลังจัดสรรสล็อต CPU ให้คิวถัดไป...";
    }
  }

  if (queueWaitingList) {
    queueWaitingList.replaceChildren();
    const list = Array.isArray(snap.waitingJobs) ? snap.waitingJobs : [];
    list.forEach(function (job) {
      const li = document.createElement("li");
      li.className = "queue-waiting-item" + (job.isYou ? " is-you" : "");

      const left = document.createElement("div");
      left.className = "queue-item-left";

      const posTag = document.createElement("span");
      posTag.className = "queue-pos-tag";
      posTag.textContent = `#${job.position}`;

      const nameSpan = document.createElement("span");
      nameSpan.textContent = `PID ${job.pid} - ${job.clientLabel}`;

      left.appendChild(posTag);
      left.appendChild(nameSpan);
      li.appendChild(left);

      if (job.isYou) {
        const youTag = document.createElement("span");
        youTag.className = "queue-you-tag";
        youTag.textContent = "เครื่องของคุณ";
        li.appendChild(youTag);
      }

      queueWaitingList.appendChild(li);
    });
  }

  syncQueueVisibility();
}

if (queueMinimizeBtn) {
  queueMinimizeBtn.addEventListener("click", function () {
    isQueueMinimized = true;
    syncQueueVisibility();
  });
}

if (queueExpandBtn) {
  queueExpandBtn.addEventListener("click", function () {
    isQueueMinimized = false;
    syncQueueVisibility();
  });
}

if (queueCancelBtn) {
  queueCancelBtn.addEventListener("click", function () {
    if (activeStreamAbortController) {
      userCancelledRequest = true;
      activeStreamAbortController.abort();
    }
    closeQueueUI();
  });
}

// ============================================================================
// T6: Gemini-Style Live Thinking & Tool Usage Tracker Component
// ============================================================================
function createThinkingTracker(container) {
  const card = document.createElement("div");
  card.className = "thinking-tracker-card";

  const headerBtn = document.createElement("button");
  headerBtn.type = "button";
  headerBtn.className = "thinking-header-btn";
  headerBtn.setAttribute("aria-expanded", "true");

  const headerLeft = document.createElement("div");
  headerLeft.className = "thinking-header-left";

  const pulseDot = document.createElement("span");
  pulseDot.className = "thinking-pulse-dot";
  pulseDot.setAttribute("aria-hidden", "true");

  const headline = document.createElement("span");
  headline.className = "thinking-headline";
  headline.textContent = "กำลังเริ่มวิเคราะห์คำถาม...";

  headerLeft.appendChild(pulseDot);
  headerLeft.appendChild(headline);

  const headerRight = document.createElement("div");
  headerRight.className = "thinking-header-right";

  const timerSpan = document.createElement("span");
  timerSpan.className = "thinking-timer";
  timerSpan.textContent = "0.0 วิ";

  const chevron = document.createElement("span");
  chevron.className = "thinking-chevron";
  chevron.setAttribute("aria-hidden", "true");

  headerRight.appendChild(timerSpan);
  headerRight.appendChild(chevron);

  headerBtn.appendChild(headerLeft);
  headerBtn.appendChild(headerRight);

  const stepsBody = document.createElement("div");
  stepsBody.className = "thinking-steps-body";

  const stepList = document.createElement("ul");
  stepList.className = "thinking-step-list";
  stepsBody.appendChild(stepList);

  card.appendChild(headerBtn);
  card.appendChild(stepsBody);
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

  const startedAt = Date.now();
  let isCompleted = false;
  const toolsRecorded = [];

  const timerId = setInterval(function () {
    if (isCompleted) return;
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    timerSpan.textContent = `${elapsedSec} วิ`;
  }, 100);

  headerBtn.addEventListener("click", function () {
    const collapsed = card.classList.toggle("collapsed");
    headerBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  function pushStep(text) {
    const prevActive = stepList.querySelector(".active-step");
    if (prevActive) prevActive.classList.remove("active-step");

    const li = document.createElement("li");
    li.className = "thinking-step-item active-step";
    li.textContent = text;
    stepList.appendChild(li);
    container.scrollTop = container.scrollHeight;
  }

  return {
    setHeadline: function (text) {
      if (!isCompleted) {
        headline.textContent = text;
      }
    },
    addStep: function (text) {
      pushStep(text);
    },
    recordTool: function (label) {
      if (label && !toolsRecorded.includes(label)) {
        toolsRecorded.push(label);
      }
    },
    complete: function () {
      if (isCompleted) return;
      isCompleted = true;
      clearInterval(timerId);

      const prevActive = stepList.querySelector(".active-step");
      if (prevActive) prevActive.classList.remove("active-step");

      const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      timerSpan.textContent = `${totalSec} วิ`;

      if (stepList.children.length === 0) {
        pushStep("ประมวลผลคำตอบตรงจากคลังความจำ");
      }

      const toolNote = toolsRecorded.length > 0
        ? `ใช้เครื่องมือ: ${toolsRecorded.join(", ")}`
        : "ประมวลผลสำเร็จ";
      headline.textContent = `ดูขั้นตอนการทำงาน (${toolNote})`;

      card.classList.add("completed", "collapsed");
      headerBtn.setAttribute("aria-expanded", "false");
    },
    destroy: function () {
      isCompleted = true;
      clearInterval(timerId);
      card.remove();
    }
  };
}

// ============================================================================
// Notice Banner & Mode Switchers
// ============================================================================
function showNoticeBanner(message) {
  if (!toolNoticeBanner || !noticeText) return;
  noticeText.textContent = message;
  toolNoticeBanner.classList.remove("hidden");
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(function () {
    hideNoticeBanner();
  }, 8500);
}

function hideNoticeBanner() {
  if (!toolNoticeBanner) return;
  toolNoticeBanner.classList.add("hidden");
  if (noticeTimer) clearTimeout(noticeTimer);
}

if (noticeClose) {
  noticeClose.addEventListener("click", hideNoticeBanner);
}

function updateToolModeUI(mode) {
  currentToolMode = mode;
  localStorage.setItem("ai_agent_tool_mode", mode);
  const buttons = [
    { btn: toolModeAutoBtn, mode: "auto" },
    { btn: toolModeChatBtn, mode: "chat" },
    { btn: toolModeSearchBtn, mode: "search" }
  ];
  buttons.forEach(function (item) {
    if (!item.btn) return;
    item.btn.classList.toggle("active", item.mode === mode);
  });
}

if (toolModeAutoBtn) {
  toolModeAutoBtn.addEventListener("click", function () {
    if (isGenerating || isSwitchingModel) return;
    updateToolModeUI("auto");
  });
}
if (toolModeChatBtn) {
  toolModeChatBtn.addEventListener("click", function () {
    if (isGenerating || isSwitchingModel) return;
    updateToolModeUI("chat");
  });
}
if (toolModeSearchBtn) {
  toolModeSearchBtn.addEventListener("click", function () {
    if (isGenerating || isSwitchingModel) return;
    updateToolModeUI("search");
    checkTavilyStatusOnSearch();
  });
}

async function checkTavilyStatusOnSearch() {
  try {
    const diag = await fetchTavilyDiagnostics(false);
    if (diag && !diag.usable && currentToolMode === "search") {
      showNoticeBanner(`${diag.statusTitleThai} — ${diag.troubleshootingThai}`);
      return;
    }
    const res = await fetch("/api/tools/status");
    if (res.ok) {
      const data = await res.json();
      if (data && data.tavilyConfigured === false && currentToolMode === "search") {
        showNoticeBanner("ไม่พบ Tavily API Key บนเซิร์ฟเวอร์ จึงใช้งาน DuckDuckGo แทน");
      }
    }
  } catch {
    // Non-fatal
  }
}

promptForm.addEventListener("submit", handleSubmit);
if (newChatButton) {
  newChatButton.addEventListener("click", handleNewChat);
}
if (modeLiteBtn) {
  modeLiteBtn.addEventListener("click", function () { handleModeSwitch("lite"); });
}
if (modeAdvancedBtn) {
  modeAdvancedBtn.addEventListener("click", function () { handleModeSwitch("advanced"); });
}

function updateModelUI(mode, statusText, badgeState) {
  currentModelMode = mode;
  if (modeLiteBtn && modeAdvancedBtn) {
    modeLiteBtn.classList.toggle("active", mode === "lite");
    modeAdvancedBtn.classList.toggle("active", mode === "advanced");
  }
  if (drawerModelPill) {
    drawerModelPill.textContent = mode === "advanced" ? "Qwen2.5 3B" : "Qwen2.5 1.5B";
  }
  if (modelStatusBadge) {
    modelStatusBadge.classList.remove("switching", "error");
    if (badgeState) {
      modelStatusBadge.classList.add(badgeState);
    }
    if (statusText) {
      modelStatusBadge.textContent = statusText;
    } else {
      modelStatusBadge.textContent = mode === "advanced" ? "Adv Ready" : "Lite Ready";
    }
  }
}

async function initModelStatus() {
  try {
    const res = await fetch("/api/model/status");
    if (res.ok) {
      const data = await res.json();
      if (data && data.mode) {
        updateModelUI(data.mode);
      }
    }
  } catch (err) {
    console.warn("Failed to fetch initial model status:", err);
  }
}

async function handleModeSwitch(targetMode) {
  if (isGenerating) {
    showNoticeBanner("กรุณารอให้ AI ตอบคำถามปัจจุบันให้เสร็จก่อนจึงจะสลับโหมดโมเดลได้ครับ");
    return;
  }
  if (isSwitchingModel || targetMode === currentModelMode) return;

  isSwitchingModel = true;
  syncInteractiveLocks();

  updateModelUI(targetMode, "กำลังสลับโหมด...", "switching");
  const switchingBubble = appendBubble("thinking", "กำลังปล่อยโมเดลเดิมจาก RAM และโหลดโหมดใหม่...");

  try {
    const res = await fetch("/api/model/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: targetMode, rejectIfBusy: true })
    });

    const data = await res.json();
    switchingBubble.remove();

    if (res.status === 409) {
      updateModelUI(currentModelMode);
      showNoticeBanner(data.error || "ขณะนี้เซิร์ฟเวอร์กำลังประมวลผลคำถามอยู่ กรุณารอสักครู่แล้วค่อยสลับโมเดลครับ");
      return;
    }

    if (res.ok && data.success) {
      const resolvedMode = data.mode || data.currentMode || targetMode;
      const modeLabel = data.label || (resolvedMode === "advanced" ? "Advanced Mode (3B)" : "Lite Mode (1.5B)");
      updateModelUI(resolvedMode);
      appendBubble("system", "สลับสู่ " + modeLabel + " สำเร็จแล้ว");
    } else {
      const errMsg = data.error || "ไม่สามารถสลับโหมดได้";
      updateModelUI(currentModelMode, "Error", "error");
      appendBubble("error", "การสลับโหมดล้มเหลว: " + errMsg);
      setTimeout(function () {
        updateModelUI(currentModelMode);
      }, 3500);
    }
  } catch (err) {
    switchingBubble.remove();
    updateModelUI(currentModelMode, "Error", "error");
    appendBubble("error", "เกิดข้อผิดพลาดในการเชื่อมต่อ: " + (err.message || "ไม่สามารถเชื่อมต่อ Server ได้"));
    setTimeout(function () {
      updateModelUI(currentModelMode);
    }, 3500);
  } finally {
    isSwitchingModel = false;
    syncInteractiveLocks();
  }
}

initModelStatus();
updateToolModeUI(currentToolMode);
setTelemetryDrawerState(isTelemetryOpen);
if (currentToolMode === "search") {
  checkTavilyStatusOnSearch();
}

async function hydrateSessionTelemetry() {
  try {
    const raw = localStorage.getItem("ai_agent_telemetry_snapshot");
    if (raw) {
      const snap = JSON.parse(raw);
      if (snap) updateTelemetryUI(snap);
    }
  } catch {}

  fetchOSMetrics();
  fetchTavilyDiagnostics(false);

  if (currentSessionId) {
    try {
      const res = await fetch(`/api/chat/session/${currentSessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.telemetry) {
          updateTelemetryUI(data.telemetry);
        }
      }
    } catch {}
  }
}

hydrateSessionTelemetry();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateSessionTelemetry);
}
window.addEventListener("pageshow", hydrateSessionTelemetry);
document.addEventListener("visibilitychange", function () {
  syncOSMetricsLiveLoop();
  if (document.visibilityState === "visible") {
    fetchOSMetrics();
  }
});

// ============================================================================
// Main Chat Submission & Streaming Orchestrator
// ============================================================================
async function handleSubmit(event) {
  event.preventDefault();
  if (isGenerating || isSwitchingModel) return;

  const prompt = promptInput.value.trim();
  if (prompt === "") return;

  promptInput.value = "";
  userCancelledRequest = false;
  isGenerating = true;
  syncInteractiveLocks();
  syncOSMetricsLiveLoop();

  appendBubble("user", prompt);

  // T5: Real-Time Optimistic Sliding Memory Increment immediately on submit
  const optimisticTurns = Math.min(lastKnownMaxTurns, lastConfirmedMemoryTurns + 1);
  renderMemoryMeter(
    optimisticTurns,
    lastKnownMaxTurns,
    lastConfirmedCharsUsed + prompt.length,
    lastKnownMaxChars,
    lastConfirmedFocusEntity
  );

  // T6: Gemini-Style Live Thinking Tracker
  const thinkingTracker = createThinkingTracker(chatFeed);

  let assistantBubble = null;
  let livePromptTokens = 0;
  let liveCompletionTokens = 0;

  const toolThaiNames = {
    search_wikipedia: "ค้นหาสารานุกรม Wikipedia",
    search_web: "ค้นหาข้อมูลจากเว็บ",
    calculate: "คำนวณตัวเลข",
    search_github: "ค้นหาคลังโค้ด GitHub",
    get_system_info: "ตรวจสอบสถานะฮาร์ดแวร์",
    get_current_time: "ตรวจสอบเวลาปัจจุบัน",
    get_weather: "ตรวจสอบสภาพอากาศ",
    get_fx: "แปลงอัตราแลกเปลี่ยนเงินตรา",
    get_news: "ดึงพาดหัวข่าวล่าสุด"
  };

  try {
    let reply;

    if (USE_MOCK_API) {
      thinkingTracker.addStep("จำลองการตอบกลับในโหมดทดสอบ");
      reply = await getMockResponse(prompt);
      thinkingTracker.complete();
      assistantBubble = appendBubble("assistant", reply.text);
    } else if (USE_STREAMING && window.ReadableStream) {
      reply = await sendStreamMessageToBackend(prompt, {
        onQueue: function (queueSnap) {
          updateQueueModal(queueSnap);
          if (queueSnap?.yourJob?.position >= 1) {
            thinkingTracker.setHeadline(`อยู่ในคิวประมวลผล ลำดับที่ #${queueSnap.yourJob.position}...`);
          }
        },
        onStatus: function (statusData) {
          if (!statusData) return;

          if (statusData.status === "notice" && statusData.message) {
            showNoticeBanner(statusData.message);
            fetchTavilyDiagnostics(false);
          } else if (statusData.status === "analyzing") {
            closeQueueUI();
            const modeDesc = statusData.mode === "search" ? "โหมดค้นเว็บ" : (statusData.mode === "chat" ? "โหมดคุยล้วน" : "โหมดอัตโนมัติ");
            thinkingTracker.setHeadline("กำลังวิเคราะห์เจตนาและบริบทคำถาม...");
            if (statusData.resolvedTopic) {
              thinkingTracker.addStep(`เชื่อมโยงคำถามต่อเนื่องเป็น: "${statusData.resolvedTopic}" (${modeDesc})`);
            } else {
              thinkingTracker.addStep(`วิเคราะห์คำถามเสร็จสิ้น (${modeDesc} • ${statusData.modelLabel || "Qwen2.5"})`);
            }
          } else if (statusData.status === "using_tool") {
            closeQueueUI();
            const baseLabel = statusData.label || toolThaiNames[statusData.tool] || statusData.tool;
            const preview = statusData.queryPreview ? `: "${statusData.queryPreview}"` : "";
            thinkingTracker.setHeadline(`กำลัง${baseLabel}${preview}...`);
            thinkingTracker.addStep(`เรียกใช้เครื่องมือ ${baseLabel}${preview}`);
          } else if (statusData.status === "tool_done") {
            const baseLabel = statusData.label || toolThaiNames[statusData.tool] || statusData.tool;
            const prov = statusData.providerLabel ? ` ผ่าน ${statusData.providerLabel}` : "";
            const sec = typeof statusData.durationMs === "number" ? ` (${(statusData.durationMs / 1000).toFixed(1)} วิ)` : "";
            if (statusData.found) {
              thinkingTracker.recordTool(statusData.providerLabel ? `${baseLabel} (${statusData.providerLabel})` : baseLabel);
              thinkingTracker.addStep(`ดึงข้อมูลสำเร็จ${prov}${sec}`);
            } else {
              thinkingTracker.addStep(`ไม่พบข้อมูลตรงจาก ${baseLabel}${sec}`);
            }
          } else if (statusData.status === "tool_cascade") {
            thinkingTracker.setHeadline("กำลังสลับไปค้นหาข้อมูลเพิ่มเติมบนเว็บ...");
            thinkingTracker.addStep("ไม่พบบทความตรงใน Wikipedia จึงสลับไปค้นหาเว็บอัตโนมัติ");
          } else if (statusData.status === "synthesizing") {
            closeQueueUI();
            const modelName = statusData.modelLabel || (currentModelMode === "advanced" ? "Qwen2.5 3B" : "Qwen2.5 1.5B");
            const synthDesc = statusData.hasReference
              ? `กำลังเรียบเรียงคำตอบจากข้อมูลอ้างอิงด้วย ${modelName}...`
              : `กำลังคิดและเรียบเรียงคำตอบด้วย ${modelName}...`;
            thinkingTracker.setHeadline(synthDesc);
            thinkingTracker.addStep(synthDesc.replace(/\.\.\.$/, ""));

            if (typeof statusData.estimatedPromptTokens === "number") {
              livePromptTokens = statusData.estimatedPromptTokens;
              if (statPromptTokens) statPromptTokens.textContent = formatNumber(livePromptTokens);
              if (turnTypeBadge) {
                turnTypeBadge.classList.remove("deterministic");
                turnTypeBadge.textContent = "กำลังประมวลผล...";
              }
              const maxTok = statusData.maxContextTokens || 4096;
              const pct = maxTok > 0 ? Math.min(100, Math.round(((livePromptTokens / maxTok) * 100) * 10) / 10) : 0;
              if (contextPercentText) contextPercentText.textContent = `${pct.toFixed(1)}%`;
              if (contextTokensText) contextTokensText.textContent = `${formatNumber(livePromptTokens)} / ${formatNumber(maxTok)} tokens`;
              if (contextMeterFill) contextMeterFill.style.width = `${pct}%`;
            }
          } else if (statusData.status === "reflecting") {
            thinkingTracker.setHeadline("กำลังตรวจสอบความถูกต้องของข้อมูลและภาษา...");
            thinkingTracker.addStep("ตรวจสอบความแม่นยำและขัดเกลาคำตอบรอบที่ 2");
          }
        },
        onToken: function (token) {
          closeQueueUI();
          if (!assistantBubble) {
            thinkingTracker.complete();
            assistantBubble = appendBubble("assistant", "");
          }
          assistantBubble.textContent += token;
          liveCompletionTokens += Math.max(1, Math.round(token.length * 0.65));
          if (statCompletionTokens) statCompletionTokens.textContent = formatNumber(liveCompletionTokens);
          if (statTurnTotal) statTurnTotal.textContent = formatNumber(livePromptTokens + liveCompletionTokens);
          chatFeed.scrollTop = chatFeed.scrollHeight;
        }
      });

      closeQueueUI();
      thinkingTracker.complete();

      if (!assistantBubble) {
        if (reply?.text) {
          assistantBubble = appendBubble("assistant", reply.text);
        }
      } else if (reply?.text) {
        assistantBubble.textContent = reply.text;
      }
    } else {
      thinkingTracker.setHeadline("กำลังส่งคำขอประมวลผลไปยังเซิร์ฟเวอร์...");
      thinkingTracker.addStep("ส่งคำขอไปยังไปป์ไลน์ AI");
      reply = await sendMessageToBackend(prompt);
      thinkingTracker.complete();
      assistantBubble = appendBubble("assistant", reply.text);
    }

    if (reply?.usage) {
      updateTelemetryUI(reply.usage);
    }

    if (reply?.notice?.message) {
      showNoticeBanner(reply.notice.message);
      fetchTavilyDiagnostics(false);
    }

    if (reply?.status === "error") {
      thinkingTracker.destroy();
      if (assistantBubble) assistantBubble.remove();
      renderMemoryMeter(
        lastConfirmedMemoryTurns,
        lastKnownMaxTurns,
        lastConfirmedCharsUsed,
        lastKnownMaxChars,
        lastConfirmedFocusEntity
      );
      setAvatarFeeling("confused");
      appendBubble("error", reply.text);
      return;
    }

    // Attach model and tool metadata badge to assistant bubble
    if (assistantBubble) {
      const activeModelLabel = reply?.modelLabel || (currentModelMode === "advanced" ? "Qwen2.5 3B" : "Qwen2.5 1.5B");
      const toolNames = (reply?.toolsUsed || [])
        .filter(function (t) { return t.tool; })
        .map(function (t) {
          if (t.result?.fromNote) return "คลังความจำ (0ms)";
          let name = t.label || t.tool;
          if (t.result?.providerLabel) {
            name = `${name} (${t.result.providerLabel})`;
          }
          const time = t.durationMs !== undefined ? ` (${(t.durationMs / 1000).toFixed(1)}s)` : "";
          return `${name}${time}`;
        });

      const badgeParts = [`โมเดล: ${activeModelLabel}`];
      if (toolNames.length > 0) {
        badgeParts.push(`ใช้เครื่องมือ: ${toolNames.join(", ")}`);
      }

      const badge = document.createElement("div");
      badge.className = "tool-used-badge";
      badge.textContent = `[ ${badgeParts.join(" | ")} ]`;
      assistantBubble.appendChild(badge);
    }

    setAvatarFeeling(reply?.feeling || "neutral");

    // Push user and assistant turns together only after a non-error reply so roles always alternate.
    history.push(
      { role: "user", content: prompt },
      { role: "assistant", content: reply.text }
    );
  } catch (error) {
    closeQueueUI();
    thinkingTracker.destroy();
    if (assistantBubble) assistantBubble.remove();

    renderMemoryMeter(
      lastConfirmedMemoryTurns,
      lastKnownMaxTurns,
      lastConfirmedCharsUsed,
      lastKnownMaxChars,
      lastConfirmedFocusEntity
    );

    if (userCancelledRequest) {
      setAvatarFeeling("neutral");
      appendBubble("system", "ยกเลิกคำขอในคิวประมวลผลเรียบร้อยแล้ว");
    } else {
      setAvatarFeeling("confused");
      if (error.name === "AbortError") {
        appendBubble("error", "ระบบใช้เวลาประมวลผลเกินเพดานสูงสุด (ขาดสัญญาณตอบสนองจากบอร์ด) กรุณาลองใหม่อีกครั้ง");
      } else {
        appendBubble("error", "ไม่สามารถเชื่อมต่อระบบ AI ได้ กรุณาลองใหม่อีกครั้ง");
      }
      console.error("เกิดข้อผิดพลาด: ", error);
    }
  } finally {
    activeStreamAbortController = null;
    isGenerating = false;
    closeQueueUI();
    syncInteractiveLocks();
    syncOSMetricsLiveLoop();
    promptInput.focus();
  }
}

function handleNewChat() {
  if (isGenerating || isSwitchingModel) return;

  if (currentSessionId) {
    fetch(`/api/chat/session/${currentSessionId}`, { method: "DELETE" }).catch(function () {});
  }
  currentSessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem("ai_agent_session_id", currentSessionId);
  history.length = 0;
  chatFeed.replaceChildren();
  setAvatarFeeling("neutral");
  hideNoticeBanner();
  resetTelemetryUI();
  promptInput.focus();
}

function getMockResponse(prompt) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve({
        text: `นี่คือคำตอบจำลองสำหรับคำถาม: ${prompt}`,
        feeling: "neutral"
      });
    }, 1000);
  });
}

async function sendStreamMessageToBackend(prompt, { onQueue, onStatus, onToken } = {}) {
  const controller = new AbortController();
  activeStreamAbortController = controller;

  let idleTimerId = null;
  const resetIdleWatchdog = function () {
    if (idleTimerId) clearTimeout(idleTimerId);
    idleTimerId = setTimeout(function () {
      controller.abort();
    }, STREAM_IDLE_TIMEOUT);
  };

  const maxTimerId = setTimeout(function () {
    controller.abort();
  }, STREAM_MAX_TIMEOUT);

  resetIdleWatchdog();

  try {
    const response = await fetch(STREAM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        sessionId: currentSessionId,
        toolMode: currentToolMode,
        conversationHistory: history.slice(-10)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Backend ตอบกลับด้วยสถานะ ${response.status}`);
    }

    resetIdleWatchdog();
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalResult = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Every chunk from server (including `: ping` every 10s) proves Pi 5 is alive!
      resetIdleWatchdog();

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        let event = "message";
        let data = "";

        const lines = trimmed.split("\n");
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            data = line.slice(6).trim();
          }
        }

        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (event === "queue" && typeof onQueue === "function") {
              onQueue(parsed);
            } else if (event === "status" && typeof onStatus === "function") {
              onStatus(parsed);
            } else if (event === "token" && typeof onToken === "function") {
              onToken(parsed.token || "");
            } else if (event === "done") {
              finalResult = parsed;
            } else if (event === "error") {
              finalResult = parsed;
            }
          } catch (e) {
            console.error("SSE parse error", e);
          }
        }
      }
    }

    if (!finalResult) {
      throw new Error("สตรีมสิ้นสุดลงโดยไม่มีข้อมูลผลลัพธ์");
    }

    return finalResult;
  } finally {
    if (idleTimerId) clearTimeout(idleTimerId);
    clearTimeout(maxTimerId);
  }
}

async function sendMessageToBackend(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, API_TIMEOUT);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        sessionId: currentSessionId,
        toolMode: currentToolMode,
        conversationHistory: history.slice(-10)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Backend ตอบกลับด้วยสถานะ ${response.status}`);
    }

    const data = await response.json();

    if (typeof data.text !== "string") {
      throw new Error("Backend ไม่ได้ส่งข้อมูล response กลับมาอย่างถูกต้อง");
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendBubble(kind, text) {
  const bubble = document.createElement("p");
  bubble.className = `chat-bubble ${kind}`;
  bubble.textContent = text;
  chatFeed.appendChild(bubble);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return bubble;
}

function setAvatarFeeling(feeling) {
  if (!aiCharacter) return;
  const nextFeeling = FEELINGS.includes(feeling) ? feeling : "neutral";
  aiCharacter.classList.remove(...FEELINGS);
  aiCharacter.classList.add(nextFeeling);
}
