const USE_MOCK_API = false;
const USE_STREAMING = true;
const API_URL = "/api/chat";
const STREAM_API_URL = "/api/chat/stream";
const API_TIMEOUT = 120000;
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

const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const sendButton = document.getElementById("send-button");
const chatFeed = document.getElementById("chat-feed");
const newChatButton = document.getElementById("new-chat-button");
const aiCharacter = document.querySelector(".ai-character");
const modeLiteBtn = document.getElementById("mode-lite-btn");
const modeAdvancedBtn = document.getElementById("mode-advanced-btn");
const modelStatusBadge = document.getElementById("model-status-badge");

const toolModeAutoBtn = document.getElementById("tool-mode-auto-btn");
const toolModeChatBtn = document.getElementById("tool-mode-chat-btn");
const toolModeSearchBtn = document.getElementById("tool-mode-search-btn");
const toolNoticeBanner = document.getElementById("tool-notice-banner");
const noticeText = document.getElementById("notice-text");
const noticeClose = document.getElementById("notice-close");

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

let isTelemetryOpen = localStorage.getItem("ai_agent_telemetry_open") === "1";

function setTelemetryDrawerState(open) {
  isTelemetryOpen = Boolean(open);
  localStorage.setItem("ai_agent_telemetry_open", isTelemetryOpen ? "1" : "0");
  if (telemetryDrawer) {
    if (isTelemetryOpen) {
      telemetryDrawer.classList.remove("hidden");
    } else {
      telemetryDrawer.classList.add("hidden");
    }
  }
  if (telemetryToggleButton) {
    telemetryToggleButton.classList.toggle("active", isTelemetryOpen);
  }
  if (appContainer) {
    appContainer.classList.toggle("drawer-open", isTelemetryOpen);
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

function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "0";
  return num.toLocaleString("th-TH");
}

const osRamAvailable = document.getElementById("os-ram-available");
const osZramStat = document.getElementById("os-zram-stat");
const osSocTemp = document.getElementById("os-soc-temp");
const osCpuLoad = document.getElementById("os-cpu-load");
const osProcessRss = document.getElementById("os-process-rss");
const osGovernorTag = document.getElementById("os-governor-tag");

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
  } catch {}
}

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
  const historyTurnsUsed = cw.historyTurnsUsed || 0;
  const maxHistoryTurns = cw.maxHistoryTurns || 30;
  if (memoryTurnsText) {
    memoryTurnsText.textContent = `${historyTurnsUsed} / ${maxHistoryTurns} รอบ`;
  }
  if (memoryMeterFill) {
    const memoryPercent = maxHistoryTurns > 0 ? Math.min(100, Math.round((historyTurnsUsed / maxHistoryTurns) * 100)) : 0;
    memoryMeterFill.style.width = `${memoryPercent}%`;
  }
  if (memoryCharsText) {
    const charsUsed = cw.contextCharsUsed || 0;
    const maxChars = cw.maxContextChars || 3200;
    memoryCharsText.textContent = `${formatNumber(charsUsed)} / ${formatNumber(maxChars)} ตัวอักษร`;
  }
  if (memoryFocusText) {
    memoryFocusText.textContent = cw.focusEntity ? cw.focusEntity : "ไม่มี";
  }

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
  if (memoryTurnsText) memoryTurnsText.textContent = "0 / 30 รอบ";
  if (memoryMeterFill) memoryMeterFill.style.width = "0%";
  if (memoryCharsText) memoryCharsText.textContent = "0 / 3,200 ตัวอักษร";
  if (memoryFocusText) memoryFocusText.textContent = "ไม่มี";
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

let currentModelMode = "lite";
let isSwitchingModel = false;
let currentToolMode = localStorage.getItem("ai_agent_tool_mode") || "auto";
let noticeTimer = null;

function showNoticeBanner(message) {
  if (!toolNoticeBanner || !noticeText) return;
  noticeText.textContent = message;
  toolNoticeBanner.classList.remove("hidden");
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(function () {
    hideNoticeBanner();
  }, 7000);
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
    if (item.mode === mode) {
      item.btn.classList.add("active");
    } else {
      item.btn.classList.remove("active");
    }
  });
}

if (toolModeAutoBtn) {
  toolModeAutoBtn.addEventListener("click", function () {
    updateToolModeUI("auto");
  });
}
if (toolModeChatBtn) {
  toolModeChatBtn.addEventListener("click", function () {
    updateToolModeUI("chat");
  });
}
if (toolModeSearchBtn) {
  toolModeSearchBtn.addEventListener("click", function () {
    updateToolModeUI("search");
    checkTavilyStatusOnSearch();
  });
}

async function checkTavilyStatusOnSearch() {
  try {
    const res = await fetch("/api/tools/status");
    if (res.ok) {
      const data = await res.json();
      if (data && data.tavilyConfigured === false && currentToolMode === "search") {
        showNoticeBanner("ไม่พบ Tavily API Key จึงใช้งาน DuckDuckGo แทน");
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
    if (mode === "lite") {
      modeLiteBtn.classList.add("active");
      modeAdvancedBtn.classList.remove("active");
    } else if (mode === "advanced") {
      modeAdvancedBtn.classList.add("active");
      modeLiteBtn.classList.remove("active");
    }
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
  if (isSwitchingModel || targetMode === currentModelMode) return;

  isSwitchingModel = true;
  setLoadingState(true);
  if (modeLiteBtn) modeLiteBtn.disabled = true;
  if (modeAdvancedBtn) modeAdvancedBtn.disabled = true;

  updateModelUI(targetMode, "กำลังสลับโหมด...", "switching");
  const switchingBubble = appendBubble("thinking", "กำลังปล่อยโมเดลเดิมจาก RAM และโหลดโหมดใหม่...");

  try {
    const res = await fetch("/api/model/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: targetMode })
    });

    const data = await res.json();
    switchingBubble.remove();

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
    setLoadingState(false);
    if (modeLiteBtn) modeLiteBtn.disabled = false;
    if (modeAdvancedBtn) modeAdvancedBtn.disabled = false;
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
  if (document.visibilityState === "visible") {
    fetchOSMetrics();
  }
});

async function handleSubmit(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();

  if (prompt === "") return;

  promptInput.value = "";
  appendBubble("user", prompt);
  const thinkingBubble = appendBubble("thinking", "กำลังคิด...");
  setLoadingState(true);

  let assistantBubble = null;
  let livePromptTokens = 0;
  let liveCompletionTokens = 0;

  try {
    let reply;

    if (USE_MOCK_API) {
      reply = await getMockResponse(prompt);
      thinkingBubble.remove();
      appendBubble("assistant", reply.text);
    } else if (USE_STREAMING && window.ReadableStream) {
      reply = await sendStreamMessageToBackend(prompt, {
        onStatus: function (statusData) {
          if (statusData.status === "notice" && statusData.message) {
            showNoticeBanner(statusData.message);
          } else if (statusData.status === "using_tool") {
            const toolLabels = {
              search_wikipedia: "กำลังค้นหา Wikipedia...",
              search_web: "กำลังค้นหาข้อมูลจากเว็บ...",
              calculate: "กำลังคำนวณตัวเลข...",
              search_github: "กำลังค้นหา GitHub...",
              get_system_info: "กำลังตรวจสอบสถานะเครื่อง...",
              get_current_time: "กำลังตรวจสอบเวลา...",
              get_weather: "กำลังตรวจสอบสภาพอากาศ...",
              get_fx: "กำลังแปลงอัตราแลกเปลี่ยน...",
              get_news: "กำลังดึงข่าวสารล่าสุด..."
            };
            const label = statusData.label ? `กำลัง${statusData.label}...` : (toolLabels[statusData.tool] || `กำลังเรียกใช้ ${statusData.tool}...`);
            thinkingBubble.textContent = label;
          } else if (statusData.status === "synthesizing") {
            thinkingBubble.textContent = "กำลังเรียบเรียงคำตอบ...";
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
          }
        },
        onToken: function (token) {
          if (!assistantBubble) {
            thinkingBubble.remove();
            assistantBubble = appendBubble("assistant", "");
          }
          assistantBubble.textContent += token;
          liveCompletionTokens += Math.max(1, Math.round(token.length * 0.65));
          if (statCompletionTokens) statCompletionTokens.textContent = formatNumber(liveCompletionTokens);
          if (statTurnTotal) statTurnTotal.textContent = formatNumber(livePromptTokens + liveCompletionTokens);
          chatFeed.scrollTop = chatFeed.scrollHeight;
        }
      });

      if (!assistantBubble) {
        thinkingBubble.remove();
        if (reply?.text) {
          assistantBubble = appendBubble("assistant", reply.text);
        }
      } else if (reply?.text) {
        assistantBubble.textContent = reply.text;
      }
    } else {
      reply = await sendMessageToBackend(prompt);
      thinkingBubble.remove();
      assistantBubble = appendBubble("assistant", reply.text);
    }

    if (reply?.usage) {
      updateTelemetryUI(reply.usage);
    }

    if (reply?.notice?.message) {
      showNoticeBanner(reply.notice.message);
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
          const time = t.durationMs !== undefined ? ` (${(t.durationMs / 1000).toFixed(1)}s)` : '';
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

    if (reply?.status === "error") {
      if (assistantBubble) assistantBubble.remove();
      appendBubble("error", reply.text);
      return;
    }

    // Push user and assistant turns together only after a non-error reply so roles always alternate.
    history.push(
      { role: "user", content: prompt },
      { role: "assistant", content: reply.text }
    );
  } catch (error) {
    thinkingBubble.remove();
    if (assistantBubble) assistantBubble.remove();
    setAvatarFeeling("confused");

    if (error.name === "AbortError") {
      appendBubble("error", "ระบบใช้เวลาตอบนานเกินไป กรุณาลองส่งคำถามอีกครั้ง");
    } else {
      appendBubble("error", "ไม่สามารถเชื่อมต่อระบบ AI ได้ กรุณาลองใหม่อีกครั้ง");
    }
    console.error("เกิดข้อผิดพลาด: ", error);
  } finally {
    setLoadingState(false);
    promptInput.focus();
  }
}

function handleNewChat() {
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

async function sendStreamMessageToBackend(prompt, { onStatus, onToken } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, API_TIMEOUT);

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

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalResult = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

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
            if (event === "status" && typeof onStatus === "function") {
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
    clearTimeout(timeoutId);
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

function setLoadingState(isLoading) {
  promptInput.disabled = isLoading;
  sendButton.disabled = isLoading;

  if (isLoading) {
    sendButton.textContent = "รอ";
  } else {
    sendButton.textContent = "ส่ง";
  }
}
