---
name: small-llm-agent-logic
description: Engineering principles and architecture patterns for running reliable AI agents on small/sub-4B local LLMs (e.g., Qwen 1.5B, Raspberry Pi 5). Covers deterministic routing, query rewriting, structured templates, and hallucination prevention.
---

# Small LLM Agent Logic

Guidelines and architectural patterns for building resilient, low-latency AI agents powered by small language models (sub-4B parameters, such as Qwen 2.5 1.5B on Raspberry Pi 5).

## Core Principles

### 1. Deterministic First, Generative Last
- Sub-4B models fail when presented with large tool schemas (e.g. 9 tools = ~970 chars schema). They hallucinate tool names, misplace arguments, or get stuck in multi-turn ReAct loops.
- Use a deterministic router (`router.js`) for tool selection. The LLM should only be invoked for synthesizing natural conversational phrasing from clean context.

### 2. Zero-Token Structured Tool Responses
- For structured outputs (weather forecasts, currency exchange rates, system clocks, hardware metrics, arithmetic, news feeds):
  - Compose answers using handcrafted, natural language templates (`answer.js`).
  - Do NOT call the LLM to format structured facts.
  - Benefits: 0 tokens consumed, 0ms model latency, 0% hallucination risk.

### 3. Conversational Query Rewriting (Single Source of Truth)
- Small models lose track of conversational focus when presented with pronoun-heavy follow-up questions ("แล้วหมาล่ะ", "แล้วมันราคาเท่าไหร่", "เขาเกิดปีอะไร").
- Resolve follow-ups deterministically using `resolver.js` before invoking tools or the LLM.
- Always maintain a single source of truth for conversational history (`SessionMemory`).

### 4. Clean Extractive Context
- Small models mirror whatever formatting is present in the prompt. If prompts contain `[แหล่งที่ 1: title]` or numbered bullet lists, the model copies those exact markers into its output.
- Strip all metadata, brackets, source markers, and URLs from reference text before passing it to LLM synthesis (`cleanExtractiveText`).
- Use short, natural few-shot system prompts without rigid English schemas.

### 5. Polarity and Warning Guards
- Small models occasionally flip negations (e.g., summarizing "toxic to dogs" as "safe for dogs").
- Enforce a centralized safety guard (`safety.js`) that detects critical danger, toxicity, or prohibition warnings in reference data and prevents contradictory positive phrasing.

### 6. Probe-First Development (Feedback Loops)
- Never add ad-hoc regex rules or guards without first creating a failing probe test (Red-Green-Refactor).
- Use an automated benchmark runner (`tests/eval/runner.js`) to verify router accuracy, multi-turn recall, and token meters.
