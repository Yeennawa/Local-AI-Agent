// ค้นหา Element ที่ต้องใช้งานจากหน้า HTML
const USE_MOCK_API = true;
const API_URL = "http://localhost:3000/api/chat";
const API_TIMEOUT = 60000;
const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const sendButton = document.getElementById("send-button");
const aiResponse = document.getElementById("ai-response");


promptForm.addEventListener("submit", handleSubmit);
async function handleSubmit(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();

  if (prompt === "") return;
  showThinkingState();
  try{
    let answer;
    if(USE_MOCK_API){
      answer = await getMockResponse(prompt);
    }else{
      answer = await sendMessageToBackend(prompt);
    }
    showAIResponse(answer);
    promptInput.value = "";
  }catch (error){
    if(error.name === "AbortError"){
      showTimeoutMessage();
    }else{
      showErrorMessage();
    }
    console.error("เกิดข้อผิดพลาด: ", error);
  }finally{
    setLoadingState(false);
    promptInput.focus();
  }
}
function getMockResponse(prompt){
  return new Promise(function (resolve){
    setTimeout(function(){
      resolve(`นี่คือคำตอบจำลองสำหรับคำถาม: ${prompt}`);
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

      body: JSON.stringify({
        prompt: prompt
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Backend ตอบกลับด้วยสถานะ ${response.status}`
      );
    }
    const data = await response.json();

    if (typeof data.response !== "string") {
      throw new Error(
        "Backend ไม่ได้ส่งข้อมูล response กลับมาอย่างถูกต้อง"
      );
    }

    return data.response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function showThinkingState() {
  aiResponse.textContent= "กำลังคิด...";
  setLoadingState(true);
}

function showAIResponse(answer){
  aiResponse.textContent = answer;
}

function showErrorMessage(){
  aiResponse.textContent = "ไม่สามารถเชื่อมต่อระบบ AI ได้ กรุณาลองใหม่อีกครั้ง";
}

function showTimeoutMessage(){
  aiResponse.textContent = "ระบบใช้เวลาตอบนานเกินไป กรุณาลองส่งคำถามอีกครั้ง";
}

function setLoadingState(isLoading){
  promptInput.disabled = isLoading;
  sendButton.disabled = isLoading;

  if(isLoading){
    sendButton.textContent= "รอ";
  }else{
    sendButton.textContent= "ส่ง";
  }
}

