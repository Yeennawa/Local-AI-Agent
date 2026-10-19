const USE_MOCK_API = false;
const USE_STREAMING = true;
const API_URL = "/api/chat";
const STREAM_API_URL = "/api/chat/stream";
const API_TIMEOUT = 60000;
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

promptForm.addEventListener("submit", handleSubmit);
if (newChatButton) {
  newChatButton.addEventListener("click", handleNewChat);
}

async function handleSubmit(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();

  if (prompt === "") return;

  promptInput.value = "";
  appendBubble("user", prompt);
  const thinkingBubble = appendBubble("thinking", "กำลังคิด...");
  setLoadingState(true);

  let assistantBubble = null;

  try {
    let reply;

    if (USE_MOCK_API) {
      reply = await getMockResponse(prompt);
      thinkingBubble.remove();
      appendBubble("assistant", reply.text);
    } else if (USE_STREAMING && window.ReadableStream) {
      reply = await sendStreamMessageToBackend(prompt, {
        onStatus: function (statusData) {
          if (statusData.status === "using_tool") {
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
          }
        },
        onToken: function (token) {
          if (!assistantBubble) {
            thinkingBubble.remove();
            assistantBubble = appendBubble("assistant", "");
          }
          assistantBubble.textContent += token;
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

    // Attach permanent badge if tools were used or retrieved from memory
    if (reply?.toolsUsed?.length > 0 && assistantBubble) {
      const toolNames = reply.toolsUsed
        .filter(function (t) { return t.tool; })
        .map(function (t) {
          if (t.result?.fromNote) return "คลังความจำ (0ms)";
          const name = t.label || t.tool;
          const time = t.durationMs !== undefined ? ` (${(t.durationMs / 1000).toFixed(1)}s)` : '';
          return `${name}${time}`;
        });
      if (toolNames.length > 0) {
        const badge = document.createElement("div");
        badge.className = "tool-used-badge";
        badge.textContent = `[ ใช้เครื่องมือ: ${toolNames.join(", ")} ]`;
        assistantBubble.appendChild(badge);
      }
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
        conversationHistory: history.slice(-4)
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
      // Send sessionId for continuous session memory along with sliding history window
      body: JSON.stringify({
        message: prompt,
        sessionId: currentSessionId,
        conversationHistory: history.slice(-4)
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
