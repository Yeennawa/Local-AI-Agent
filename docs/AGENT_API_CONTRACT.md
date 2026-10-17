# AI Agent API Contract & Integration Specification
**Version:** 1.0.0  
**Target Device:** Raspberry Pi 5 (4GB RAM)  
**Consumer:** Group Backend API & Web Chat Animated UI  

---

## 1. Overview & Boundary

This document defines the interface contract between the **AI Agent module** (developed by the AI Agent Developer) and the **Group Backend** (developed by Backend/Frontend team members).

The AI Agent acts as a **Deep Module**: The backend does not need to know about Ollama prompts, ReAct loops, or tool dispatching logic. It calls one asynchronous function: `runAgent(request)`.

```
[ Frontend (Laptop) ]
       │ HTTP / WebSocket
       ▼
[ Group Backend (Pi 5) ]
       │ runAgent({ message, conversationHistory })
       ▼
[ AI Agent Engine (Pi 5) ] ──► [ Ollama LLM / Tools ]
```

---

## 2. Public Function Interface

```javascript
import { runAgent } from './AI-Agent/index.js';

const response = await runAgent({
  message: "เครื่องราสเบอร์รีพายสถานะเป็นอย่างไรบ้าง",
  conversationHistory: [
    { role: "user", content: "สวัสดี" },
    { role: "assistant", content: "สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ" }
  ]
});
```

---

## 3. Data Schema

### 3.1 Input Schema (`AgentRequest`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `message` | `string` | **Yes** | The latest user message from the Web Chat UI. |
| `conversationHistory` | `Array<Message>` | No | Previous chat messages. The Agent will automatically apply a sliding window (last 4 messages) to conserve RAM and tokens. |
| `options` | `object` | No | Optional configuration overrides (e.g. `timeoutMs`, `model`). |

#### Message Object:
```json
{
  "role": "user | assistant",
  "content": "string"
}
```

---

### 3.2 Output Schema (`AgentResponse`)

```json
{
  "text": "ขณะนี้เครื่อง Raspberry Pi 5 ใช้งานแรมไป 1.4 GB จากทั้งหมด 4 GB (เหลือว่าง 2.6 GB) และระบบเปิดทำงานมาแล้ว 3 ชั่วโมงครับ",
  "status": "idle",
  "feeling": "happy",
  "toolsUsed": [
    {
      "tool": "get_system_info",
      "params": {},
      "result": {
        "platform": "linux",
        "cpuCores": 4,
        "totalMemoryMB": 4096,
        "freeMemoryMB": 2662,
        "memoryUsagePercent": 35.0,
        "uptimeHours": 3.2
      },
      "durationMs": 15
    }
  ],
  "error": null
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `text` | `string` | The final natural language response synthesized for the user. |
| `status` | `string` | Current Agent state machine status: `'idle'`, `'using_tool'`, or `'error'`. |
| `feeling` | `string` | Expression for Animated UI Avatar: `'happy'`, `'neutral'`, `'surprised'`, `'confused'`, `'proud'`. |
| `toolsUsed` | `Array<ToolRecord>` | List of tools executed to fulfill the request (empty if pure conversation). |
| `error` | `string \| null` | Error description if execution failed, otherwise `null`. |

---

## 4. Animated UI Avatar Integration (`feeling`)

The Frontend developer can map the `feeling` string directly to facial animation sprites/states:

| `feeling` Value | Meaning | Recommended Face Expression |
| :--- | :--- | :--- |
| `neutral` | Standard factual response | Calm / Attentive face |
| `happy` | Friendly response, successful action | Smiling eyes / Cheerful mouth |
| `surprised` | Unexpected input, discovery | Wide eyes / Raised eyebrows |
| `confused` | Ambiguous request, need clarification | Tilted head / Thinking expression |
| `proud` | Task completed successfully | Wink / Confident smile |

---

## 5. Error Handling Contract

The Agent will **never throw uncaught exceptions** into the backend server process. All internal failures (Ollama unavailable, JSON parse failure, timeout) are caught and returned gracefully:

```json
{
  "text": "ขออภัยครับ ขณะนี้ระบบประมวลผล AI กำลังติดขัด กรุณาลองใหม่อีกครั้ง",
  "status": "error",
  "feeling": "confused",
  "toolsUsed": [],
  "error": "Ollama connection timeout (15000ms exceeded)"
}
```
