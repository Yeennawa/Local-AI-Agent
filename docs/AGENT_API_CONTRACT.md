# AI Agent API Contract & Integration Specification

**Version:** 2.0.0  
**Target Platform:** Raspberry Pi 5 (4GB RAM) & Local Compute  
**Consumers:** Group Backend API (Express.js), Web Chat UI, and Mobile/Desktop Clients  

---

## 1. Overview & Deep Module Seam

This document defines the formal API contract between the **AI Agent Engine** (`AI-Agent/`) and calling consumers (Backend server, Frontend web interface, or CLI test harnesses).

In accordance with the **Deep Module Principle** (`.agents/skills/codebase-design`), all underlying ReAct loop execution, memory management, tool dispatching, safety filtering, and model switching are encapsulated behind two clean entry points:
1. Programmatic Seam: `runAgent(request)`
2. Network Seam: `POST /api/chat` and `POST /api/chat/stream` (SSE)

```text
[ Client (Browser / Mobile) ]
       │ HTTP REST / Server-Sent Events (SSE)
       ▼
[ Group Backend Server (Express.js) ]
       │ runAgent({ message, sessionId, toolMode, conversationHistory, options })
       ▼
[ AI Agent Engine (Deep Module) ] ──► [ Ollama LLM / Deterministic Tools ]
```

---

## 2. Programmatic Interface (`runAgent`)

```javascript
import { runAgent } from './AI-Agent/index.js';

const response = await runAgent({
  message: "อุณหภูมิกรุงเทพตอนนี้กี่องศา",
  sessionId: "sess_1729612345_a1b2c3",
  toolMode: "auto",
  conversationHistory: [
    { role: "user", content: "สวัสดี" },
    { role: "assistant", content: "สวัสดีครับ มีอะไรให้ช่วยไหมครับ" }
  ],
  options: {
    model: "qwen2.5:1.5b"
  }
});
```

### 2.1 Input Schema (`AgentRequest`)

| Field | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `message` | `string` | **Yes** | - | The raw user query or prompt. |
| `sessionId` | `string` | No | `null` | Persistent session identifier for turn tracking and Note Memory ledger. |
| `toolMode` | `string` | No | `"auto"` | Tool execution policy: `"auto"` (Adaptive RAG), `"chat"` (Parametric only), or `"search"` (Web search forced). |
| `conversationHistory` | `Array<Message>` | No | `[]` | Sliding dialogue turns. Automatically sanitized to max 10 turns (1,200 chars). |
| `options` | `object` | No | `{}` | Runtime overrides: `model`, `chatFn`, `useRouter`, `focusEntity`, `onStatus`, `onToken`. |

#### Message Object:
```json
{
  "role": "user | assistant",
  "content": "string"
}
```

---

### 2.2 Output Schema (`AgentResponse`)

```json
{
  "text": "ขณะนี้กรุงเทพมหานครมีอุณหภูมิประมาณ 31.2°C ท้องฟ้าแจ่มใสครับ",
  "status": "idle",
  "feeling": "happy",
  "toolsUsed": [
    {
      "success": true,
      "tool": "get_weather",
      "params": { "location": "Bangkok" },
      "result": { "location": "Bangkok", "temperature": 31.2, "weather": "ท้องฟ้าแจ่มใส" },
      "durationMs": 18
    }
  ],
  "notice": null,
  "sessionId": "sess_1729612345_a1b2c3",
  "error": null,
  "model": "qwen2.5:1.5b",
  "modelLabel": "Qwen2.5 1.5B",
  "mode": "lite",
  "usage": {
    "model": "qwen2.5:1.5b",
    "modelLabel": "Qwen2.5 1.5B",
    "mode": "lite",
    "contextWindow": {
      "usedTokens": 380,
      "maxTokens": 4096,
      "usagePercent": 9.3,
      "historyTurnsUsed": 2,
      "maxHistoryTurns": 10,
      "contextCharsUsed": 450,
      "maxContextChars": 2400,
      "focusEntity": "กรุงเทพมหานคร"
    },
    "lastTurn": {
      "promptTokens": 290,
      "completionTokens": 90,
      "totalTokens": 380,
      "durationMs": 2150,
      "tokensPerSec": 41.9,
      "isDeterministic": false
    },
    "sessionTotal": {
      "promptTokens": 290,
      "completionTokens": 90,
      "totalTokens": 380,
      "llmCalls": 1,
      "deterministicTurns": 0,
      "totalTurns": 1
    }
  }
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `text` | `string` | Final synthesized or template-composed natural language answer. |
| `status` | `string` | Agent lifecycle status: `'idle'` or `'error'`. |
| `feeling` | `string` | Emotional avatar expression: `'happy'`, `'neutral'`, `'surprised'`, `'confused'`, `'proud'`. |
| `toolsUsed` | `Array<ToolRecord>` | List of deterministic tools executed for this request (empty if pure conversation). |
| `notice` | `object \| null` | System notifications (e.g. `{ "code": "tavily_key_missing", "message": "..." }`). |
| `sessionId` | `string \| null` | Confirmed session ID associated with this turn. |
| `error` | `string \| null` | Error description if failure occurred, otherwise `null`. |
| `model` | `string` | Exact Ollama model tag used (e.g. `'qwen2.5:1.5b'` or `'qwen2.5:3b'`). |
| `modelLabel` | `string` | Human-readable model display label (e.g. `'Qwen2.5 1.5B'`). |
| `mode` | `string` | Active model mode: `'lite'` or `'advanced'`. |
| `usage` | `object` | Complete telemetry metrics for Context Window, Last Turn, and Session Totals. |

---

## 3. Network REST & SSE Endpoints

### 3.1 Streaming Endpoint (`POST /api/chat/stream`)
Primary endpoint for interactive web clients supporting Server-Sent Events (SSE).

#### Request Body:
```json
{
  "message": "เล่าประวัติความเป็นมาของคอมพิวเตอร์สั้นๆ",
  "sessionId": "sess_12345",
  "toolMode": "auto",
  "conversationHistory": []
}
```

#### Event Sequence:
1. `event: status`:
   - Tool execution: `{ "status": "using_tool", "tool": "search_wikipedia", "label": "กำลังค้นหา Wikipedia..." }`
   - Synthesis start: `{ "status": "synthesizing", "estimatedPromptTokens": 320, "maxContextTokens": 4096 }`
   - Warning notice: `{ "status": "notice", "code": "tavily_key_missing", "message": "..." }`
2. `event: token`:
   - Emits streaming tokens: `{ "token": "คอมพิวเตอร์" }`
3. `event: done`:
   - Emits complete `AgentResponse` JSON object with final `usage` telemetry.
4. `event: error`:
   - Emits error object `{ "text": "...", "status": "error", "feeling": "confused", "error": "..." }`.

---

### 3.2 Synchronous Chat Endpoint (`POST /api/chat`)
Single-round synchronous HTTP POST returning the complete `AgentResponse` JSON object.

---

### 3.3 Dynamic Model Management

#### `GET /api/model/status`
Returns current model name, mode, RAM usage, and loaded state:
```json
{
  "mode": "lite",
  "model": "qwen2.5:1.5b",
  "label": "Lite Mode (1.5B)",
  "state": "ready",
  "lastError": null,
  "estimatedRamMB": 1150,
  "loadedModels": []
}
```

#### `POST /api/model/switch`
Executes safe sequential unload and switches model:
```json
// Request Body
{ "mode": "advanced" }

// Response Body
{
  "success": true,
  "previousMode": "lite",
  "currentMode": "advanced",
  "mode": "advanced",
  "label": "Advanced Mode (3B)",
  "model": "qwen2.5:3b",
  "estimatedRamMB": 2350,
  "loadedModels": ["qwen2.5:3b"]
}
```

---

### 3.4 Tool & Search Provider Status (`GET /api/tools/status`)
```json
{
  "modes": {
    "auto": { "name": "auto", "label": "ออโต้", "description": "Adaptive RAG" },
    "chat": { "name": "chat", "label": "คุยล้วน", "description": "Parametric only" },
    "search": { "name": "search", "label": "ค้นเว็บ", "description": "Web search" }
  },
  "tavilyConfigured": false
}
```

---

### 3.5 Session Management
- `GET /api/chat/session/:sessionId`: Retrieves active turns, focus entity, and usage summary.
- `DELETE /api/chat/session/:sessionId`: Immediately clears session memory and returns zeroed telemetry.

---

### 3.6 Hardware Telemetry (`GET /api/health`)
Returns live RAM statistics, FIFO queue status, and active session count on Raspberry Pi 5.

---

## 4. Error Handling Guarantee

The Agent adheres to the **Non-Throwing Contract**:
- Unhandled exceptions are never thrown into the parent process.
- All internal network drops, timeout events, or JSON malformations are caught and converted into a graceful `AgentResponse` with `status: "error"`, `feeling: "confused"`, and an informative Thai user message.
