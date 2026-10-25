---
name: small-llm-agent-logic
description: Engineering principles and architecture patterns for running reliable AI agents on small/sub-4B local LLMs (e.g., Qwen 1.5B, Qwen 3B, Raspberry Pi 5). Covers Adaptive RAG routing, Corrective RAG (CRAG) quality gates, extractive span grounding, query rewriting, structured templates, and hallucination prevention.
---

# Small LLM Agent Logic

Guidelines and architectural patterns for building resilient, low-latency AI agents powered by small language models (sub-4B parameters, such as Qwen 2.5 1.5B and 3B on Raspberry Pi 5).

## Core Principles

### 1. Adaptive RAG Routing (Don't Search Everything)
- **Anti-Pattern:** Routing every user sentence with a question mark (`ไหม`, `มั้ย`, `อะไร`, `ทำไม`) or every short Thai phrase to `search_web` or `search_wikipedia`. Scraping DuckDuckGo for common-sense questions ("แมวกินได้ไหม", "คนกินแมวได้ไหม") or conversational feedback ("เขียนชื่อผิดนะ") injects noisy SEO clickbait into the context window and causes RAG poisoning.
- **Adaptive Routing Tiers:**
  1. **Tier 1 - Runtime Self-Awareness & Meta-Conversation (0 Tools):** Questions about the AI's own identity, active LLM model (`qwen2.5:1.5b` vs `qwen2.5:3b`), active mode (`Lite` vs `Advanced`), or capabilities must be answered deterministically from runtime state (`replies.js` / `agent.js`). Conversational corrections ("เขียนชื่อผิดนะ", "สะกดผิด", "มั่วแล้ว", "อธิบายเพิ่มหน่อย") must route to `intent: 'finish'` (LLM with history), NEVER to Wikipedia.
  2. **Tier 2 - Parametric Knowledge & Common Sense (`intent: 'finish'`, 0 Tools):** General everyday questions, common sense, edibility/safety advice, coding ("เขียน for loop ใน python"), comparisons ("python กับ js ต่างกันยังไง"), and creative requests should be answered directly by the LLM using its pre-trained weights plus curated safety hints (`safety.js`) without web scraping.
  3. **Tier 3 - Deterministic Structured Tools (0 LLM Tokens):** Clock (`get_current_time`), hardware stats (`get_system_info`), weather (`get_weather`), currency (`get_fx`), math (`calculate`), news (`get_news`), and GitHub (`search_github`) execute deterministically and format answers via templates (`composeStructuredAnswer`).
  4. **Tier 4 - Grounded Factual / Live Retrieval (`search_wikipedia`, `search_web`):** Trigger `search_wikipedia` ONLY for explicit encyclopedic entities, historical facts, or current office holders ("นายกไทยคนปัจจุบัน", "ประวัติ Linux", "CEO ของ..."). Trigger `search_web` ONLY for live/volatile data ("ราคาทองวันนี้", "ราคาน้ำมันวันนี้") or as a fallback when an encyclopedic lookup needs broader search.

### 2. Corrective RAG (CRAG) & Never Dump Raw Snippets
- **Never Return Raw Scrape Text as Final Answer:** `polishAnswerText` must NEVER replace an LLM's synthesized response with raw `referenceText` from `search_web` (which contains SEO titles, dates like `14 มิ.ย. 2024`, and forum fragments).
- **Snippet Grading & Cleaning:** Before passing `search_web` snippets to the LLM, filter out clickbait markers, forum questions ("ขอถามผู้รู้ทีครับ..."), date stamps, and truncated ellipses. If retrieved snippets have low relevance to the query head entity, discard them (CRAG fallback) rather than poisoning the LLM context.

### 3. Extractive Span Grounding for Proper Nouns
- Sub-3B models (especially 1.5B) frequently corrupt rare Thai proper nouns during token-by-token generation (e.g., turning `อนุทิน ชาญวีรกูล` from Wikipedia into `อนุทิน ชาญวิกรม์`).
- **Rule:** When answering office-holder or direct factual queries from Wikipedia where an explicit pattern exists in `referenceText` (e.g., `ผู้ดำรงตำแหน่งคนปัจจุบันคือ <ชื่อ>`), extract the exact span deterministically or verify/correct generated proper nouns against `referenceText` so spelling is 100% faithful.

### 4. Polarity and Safety Knowledge Guard
- For high-risk biological/toxicity questions (e.g., pets eating chocolate, grapes, paracetamol, onions, xylitol, or human consumption of domestic pets under Thai law), provide a deterministic/curated safety fact hint in `safety.js` so the answer is instant (0ms network wait), natural, and 100% safe without relying on noisy web search snippets.

### 5. Conversational Query Rewriting (Single Source of Truth)
- Resolve pronoun-heavy follow-ups ("แล้วหมาล่ะ", "แล้วมันราคาเท่าไหร่", "เขาเกิดปีอะไร") deterministically using `resolver.js`.
- Do NOT rewrite conversational pushback ("เขียนชื่อผิดนะ", "ไม่ใช่", "ใช่ของ Qwen ไหม") into topic lookups.

### 6. Probe-First Development (Feedback Loops)
- Always write failing probe tests first (`tdd` Red-Green-Refactor) covering real user failure modes before modifying routing or synthesis logic.
- Verify with both `node --test` and `node tests/eval/runner.js`.

### 7. Tool Mode Policy Seam & Single Search Facade Pattern
- **Avoid Tool Sprawl on Sub-4B Models:**
  - Registering separate tools for each search provider (e.g. `tavily_search`, `duckduckgo_search`, `web_search`) inflates tool definition tokens in the system prompt and confuses the router/LLM on sub-4B models.
  - **Pattern (Single Facade):** Register one unified `search_web` tool in `toolRegistry`. Encapsulate provider switching (`TavilyProvider` -> `DuckDuckGoProvider` -> `WikipediaSnippet`) internally within the tool.
  - When optional keys (`TAVILY_API_KEY`) are omitted, seamlessly fallback to zero-key scrapers and attach structured notices (`tavily_key_missing`) without breaking the user experience.
- **Pure Functional Policy Seam (`toolMode.js`):**
  - Keep the deterministic router (`router.js`) pure and decouple user-selected modes (`auto`, `chat`, `search`) into a post-routing policy function: `applyToolModePolicy(route, { toolMode, message })`.
  - `auto`: Strictly preserves Adaptive RAG tiering.
  - `chat`: Suppresses noisy external search tools to conserve context tokens and latency, while preserving fast in-device local tools (`time`, `systemInfo`, `calculate`, `weather`, `fx`).
  - `search`: Boosts general knowledge queries to live web retrieval while preserving meta/greeting turns.
