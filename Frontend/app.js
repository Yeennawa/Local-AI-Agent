const USE_MOCK_API = false;
const API_URL = "/api/chat";
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

  try {
    const reply = USE_MOCK_API
      ? await getMockResponse(prompt)
      : await sendMessageToBackend(prompt);

    thinkingBubble.remove();
    setAvatarFeeling(reply.feeling || "neutral");

    if (reply.status === "error") {
      appendBubble("error", reply.text);
      return;
    }

    // Push user and assistant turns together only after a non-error reply so roles always alternate.
    history.push(
      { role: "user", content: prompt },
      { role: "assistant", content: reply.text }
    );
    appendBubble("assistant", reply.text);
  } catch (error) {
    thinkingBubble.remove();
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
