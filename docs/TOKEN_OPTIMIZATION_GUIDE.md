# Token & Context Optimization Guide (Agent Playbook)

> **See also:** [[INDEX]] · [[02_ARCHITECTURE_AND_FOLDER_STRUCTURE]] · [[05_AGENT_RULES_AND_GUARDRAILS]]
> 
> **Core Tenet:** *Code correctness derives from deterministic compiler & test execution, never from prompt verbosity.*

This technical guide establishes the definitive standards for **minimizing LLM token and context window consumption** across developer workflows and autonomous AI agents in `CreateE_RDiagramsAndMappingTable`, while preserving 100% architectural rigor, test coverage, and code quality.

---

## 1. Executive Summary & The Two Loads

Every turn an agent executes consumes two distinct budgets:

* **Context Load:** The token cost of always-loaded material sitting on the agent's context window every turn (System Prompts, Skills descriptions, loaded files, conversation trajectory). Tokens spent here degrade attention and increase API costs multiplicatively on every subsequent turn.
* **Cognitive Load:** The organizational structure required by human developers to know which documents exist and when to reach for each.

The objective of this guide is to **minimize Context Load to the mathematical minimum** without sacrificing agent autonomy or code performance, utilizing **Progressive Disclosure**, **Deterministic Tooling**, and **Strict Scoping**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   3-TIER TOKEN OPTIMIZATION ARCHITECTURE               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [ LAYER 0: ULTRA-LEAN ANCHOR ] (~1,500 Tokens Baseline Context)       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ • docs/INDEX.md (Master TOC & High-Level Directory Map)          │  │
│  │ • 05_AGENT_RULES.md (Hard Guardrails: No-Delete, Verification)   │  │
│  │ • package.json / tsconfig.json (Deterministic Project Contracts) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │ (On-Demand Progressive Disclosure)   │
│                                  ▼                                      │
│  [ LAYER 1: SPECIALIZED ON-DEMAND SKILLS ] (Loaded Only When Triggered) │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ graph-layout-engineering│  │ codebase-design / domain-modeling    │  │
│  │ (Canvas/ELK/Obstacles)  │  │ (Deep Module Seams / Invariants)     │  │
│  └─────────────────────────┘  └──────────────────────────────────────┘  │
│                                  │ (Targeted Execution & Slicing)       │
│                                  ▼                                      │
│  [ LAYER 2: DETERMINISTIC VERIFICATION ] (0 Prompt Tokens for Logic)    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ • bun test src/core/layout/... (Unit Tests verify pure math)     │  │
│  │ • bunx tsc --noEmit (Compiler checks types with zero hallucinations)│
│  │ • view_file(StartLine:EndLine) (Symbol slicing: 30-80 lines)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Evaluation Matrix of 80 Context & Token Optimization Techniques

All 80 technical strategies have been evaluated specifically against this project's architecture (React 19, TypeScript, Bun, Zustand, `@xyflow/react`, `elkjs`, 7-Step Elmasri Mapping Engine):

### Categorization Matrix

| Category | Definition | Techniques Included |
| :--- | :--- | :--- |
| **A. High-Impact / Low-Complexity** | Highest token savings, easiest to enforce immediately with zero risk | **#1, #2, #5, #7, #8, #9, #10, #12, #13, #15, #17, #19, #20, #21, #23, #25, #27, #28, #29, #30, #31, #32, #34, #35, #36, #37, #38, #39, #41, #43, #44, #46, #47, #48, #49, #50, #51, #52, #54, #55, #56, #58, #59, #60, #61, #63, #64, #65, #66, #69, #70, #72, #73, #74, #75, #76, #77, #78, #79, #80** |
| **B. High-Impact / High-Complexity** | Substantial token reduction requiring structured multi-agent coordination | **#4, #14, #22, #24, #53, #57, #68, #71** |
| **C. Low-Impact / Low-Complexity** | Incremental savings, low effort | **#3, #6, #45, #62** |
| **D. Low-Impact / High-Complexity** | Heavy setup with marginal returns for single-repo scale | **#40, #42** |
| **E. Not Recommended (Anti-Patterns)** | Incompatible with local TypeScript codebase; high overhead or failure-prone | **#11 (Vector RAG), #16 (Semantic Code Search), #18 (AST Custom Parsers), #26 (Relevance Scoring Engine), #67 (Repo Knowledge Graph)** |

---

### Detailed Analysis of All 80 Techniques

#### 1. Documentation & Instruction Layering (Techniques 1–8)
* **1. Progressive Disclosure (Cat A | 40–60% reduction):** Documents hold brief context pointers (`[[WikiLinks]]`). Deeper material is loaded only when specifically needed by the task branch.
* **2. Context Layering (Cat A | 30–50% reduction):** Separate documentation into 3 tiers: L0 (Index/Guardrails) → L1 (Module Seams/Types) → L2 (Deep Implementation).
* **3. Scoped Instructions (Cat C | 20–35% reduction):** Canvas rules are isolated from Mapping Engine rules so each task loads only its domain rules.
* **4. Hierarchical Agent Instructions (Cat B | 15–25% reduction):** Root `05_AGENT_RULES.md` holds immutable guardrails that supersede module-specific guidelines.
* **5. Instruction Deduplication (Cat A | 15–20% reduction):** Eliminate repeated rules (e.g. "Do not delete files", "Run bun test") scattered across multiple files. State once in `05_AGENT_RULES.md`.
* **6. Context Compression (Cat C | 25–40% reduction):** Replace verbose explanatory prose with structured Markdown comparison tables.
* **7. Semantic Compression (Cat A | 30–50% reduction):** Use symbol references (`[ChenEdge.tsx#L25-L50]`) instead of dumping full 100-line code blocks into conversational turns.
* **8. High-Signal Instruction Design (Cat A | 20–30% reduction):** Use compact leading words (`invariant`, `tight`, `zero-collision`) that recruit the model's pretraining priors in 1 token instead of 4 sentences.

#### 2. File Retrieval & Code Navigation (Techniques 9–19)
* **9. Task-Specific Context Loading (Cat A | 35–50% reduction):** Modifying UI toolbar components never loads the 7-step relational mapping math.
* **10. Just-in-Time Context Retrieval (Cat A | 25–45% reduction):** Read files immediately prior to editing, not at the beginning of the turn.
* **11. Retrieval-Augmented Context (RAG) (Cat E | Not Recommended):** Vector databases introduce embedding hallucinations and indexing overhead on local TypeScript code where exact symbol search is provably superior.
* **12. Selective File Retrieval (Cat A | 40–60% reduction):** Read type definitions (`relational-types.ts`, `ai-types.ts`) instead of inspecting 600-line implementation files.
* **13. Relevant-File Filtering (Cat A | 50–80% tool reduction):** Strictly exclude `node_modules/`, `dist/`, `.git/`, and build artifacts from grep and file searches.
* **14. Dependency-Aware Context Selection (Cat B | 20–30% reduction):** Inspect the module import graph (`import ... from './obstacle-router'`) to determine affected files before touching code.
* **15. Codebase Indexing (Cat A | 20–35% reduction):** Maintain a concise 1-page map in `docs/02_ARCHITECTURE_AND_FOLDER_STRUCTURE.md` listing every folder's purpose and entry point.
* **16. Semantic Code Search (Cat E | Not Recommended):** Unnecessary for strongly-typed codebases. Ripgrep and symbol lookup provide deterministic 0-hallucination results.
* **17. Symbol-Level Retrieval (Cat A | 50–70% reduction):** Use `view_file` with precise `StartLine:EndLine` slices instead of reading entire files into context.
* **18. AST-Based Code Retrieval (Cat E | Not Recommended):** TypeScript Compiler (`tsc`) already performs exact AST verification; writing custom AST retrieval tools creates redundant maintenance.
* **19. Repository Map / Codebase Map (Cat A | 20–30% reduction):** Provide a compact folder hierarchy tree in `docs/INDEX.md` so agents orient instantly without directory crawling.

#### 3. Context Boundaries & Budgeting (Techniques 20–30)
* **20. Module-Level Context Isolation (Cat A | 30–45% reduction):** Treat `frontend/` and `backend/` as isolated modules with a clean boundary defined in `docs/02_ARCHITECTURE...`.
* **21. Workspace-Level vs Module-Level Rules (Cat A | 15–25% reduction):** Security and Git safety remain at Root; Canvas layout rules live strictly in `docs/06_ER_DIAGRAM...`.
* **22. Dynamic Context Assembly (Cat B | 25–40% reduction):** Assemble context on-the-fly for complex refactors using subagents.
* **23. Context Budgeting (Cat A | 30–50% reduction):** Enforce strict line limits on tool inspections (e.g. max 150 lines per `view_file` call).
* **24. Token Budget Allocation (Cat B | 40–60% cost reduction):** Route simple lookups and status checks to `flash`/`flash_lite` models, reserving `pro` models for complex architectural design.
* **25. Context Prioritization (Cat A | 20–30% reduction):** Priority order: 1. Types & Interfaces → 2. Unit Test Contracts → 3. Implementation Code.
* **26. Context Relevance Scoring (Cat E | Not Recommended):** Algorithmic scoring scripts add prompt overhead and risk dropping critical edge cases.
* **27. Instruction Priority Hierarchy (Cat A | 10–15% reduction):** Clear hierarchy: Hard Safety Guardrails > Architectural Invariants > Style Preferences.
* **28. Rule Precedence / Conflict Resolution (Cat A | 10–15% reduction):** Explicitly document that collision avoidance and test invariants always supersede aesthetic visual preferences.
* **29. Short-Circuit Context Loading (Cat A | 20–35% reduction):** Terminate file exploration immediately once the interface contract or root cause of a bug is identified.
* **30. Lazy Context Loading (Cat A | 25–40% reduction):** Defer loading schema definitions until the mapping function execution step.

#### 4. Deterministic Tooling vs. Prompt Rules (Techniques 31–41)
* **31. On-Demand Documentation Retrieval (Cat A | 30–50% reduction):** Retrieve `docs/03_DATABASE_THEORY...` only when writing new relational mapping steps.
* **32. Skill-Based Context Loading (Cat A | 40–60% reduction):** Load `graph-layout-engineering` or `gridgeist` dynamically when requested; unload after turn completion.
* **33. Tool-Based Knowledge Retrieval (Cat A | 25–35% reduction):** Use CLI test suites to verify SQL syntax instead of writing exhaustive SQL dialect grammars in prompts.
* **34. Externalized Knowledge (Cat A | 50–70% reduction):** Store Elmasri database theory in `docs/knowledge_base/` rather than cluttering system prompts.
* **35. Deterministic Tooling Instead of Instructions (Cat A | 60–80% reduction):** **Primary Lever:** Run `bun test <file>` to verify mathematical algorithms (e.g., Liang-Barsky obstacle routing) rather than asking the LLM to mentally simulate geometry.
* **36. Automated Validation Instead of Prompt Rules (Cat A | 20–30% reduction):** Use code linters and formatters to enforce code style instead of conversational prompting.
* **37. Linter / Formatter Enforcement (Cat A | 15–25% reduction):** Enforce formatting deterministically via toolchain.
* **38. Type Checker Enforcement (Cat A | 40–60% reduction):** Run `bunx tsc --noEmit` to verify type safety in 3 seconds instead of prompting the model to check types.
* **39. Test-Based Enforcement (Cat A | 50–70% reduction):** The 92 unit tests serve as the living executable specification.
* **40. CI/CD Enforcement (Cat D | 10–20% reduction):** Automate checks via GitHub Actions or pre-commit hooks.
* **41. Schema-Based Validation (Cat A | 25–40% reduction):** Validate API and imported JSON payloads using TypeScript interfaces and `sanitizeObject()`.

#### 5. Scoping, Routing & Classification (Techniques 42–50)
* **42. Generated Docs Instead of Static Instructions (Cat D | 15–25% reduction):** Generate API indexes automatically when needed.
* **43. Machine-Readable Project Metadata (Cat A | 20–30% reduction):** Treat `package.json` scripts and `tsconfig.json` paths as the single source of truth for execution commands.
* **44. Structured Instruction Formats (Cat A | 15–20% reduction):** Format documentation with standardized Markdown headers and YAML frontmatter.
* **45. Metadata-Based Context Routing (Cat C | 20–30% reduction):** Use domain tags (`#layout`, `#mapping`, `#normalization`) to guide agents directly to relevant modules.
* **46. File-Path-Based Rule Scoping (Cat A | 20–30% reduction):** Core mathematical algorithms in `frontend/src/core/` are strictly pure TypeScript with zero React or DOM dependencies.
* **47. Glob-Based Instruction Scoping (Cat A | 15–25% reduction):** TDD rules apply strictly to `*.test.ts` files.
* **48. Agent Skill Routing (Cat A | 30–50% reduction):** Automatically route layout queries to `graph-layout-engineering` and UI tasks to `gridgeist`.
* **49. Task Classification Before Context Loading (Cat A | 25–40% reduction):** Classify the user intent (Bugfix vs Refactor vs Feature) on Turn 1 before loading code.
* **50. Query/Intent-Based Context Selection (Cat A | 30–50% reduction):** User mentions "3NF" ➔ load `normalization.ts` and `normalization.test.ts` only.

#### 6. Error-Driven Refinement & Memory Management (Techniques 51–59)
* **51. Failure-Driven Context Retrieval (Cat A | 30–50% reduction):** Load debugging skills only when a test or build fails, never in successful runs.
* **52. Error-Triggered Doc Retrieval (Cat A | 20–35% reduction):** When encountering TypeScript error `TS6133`, load only the import cleanup rule.
* **53. Feedback-Based Context Refinement (Cat B | 15–25% reduction):** Narrow search patterns based on initial grep findings.
* **54. Iterative Context Expansion (Cat A | 40–60% reduction):** Start by inspecting function signatures; only inspect function bodies if logic changes are necessary.
* **55. Minimal Initial Context (Cat A | 50–70% reduction):** **Turn 1 Golden Rule:** Begin with only the user request and `docs/INDEX.md`. Do not load source files until an execution plan is formulated.
* **56. Progressive Context Expansion (Cat A | 35–50% reduction):** Expand context file-by-file as execution moves through the planned sequence.
* **57. Working-Memory Minimization (Cat B | 50–75% reduction):** Offload large documentation reading or multi-file research to a `research` subagent; receive only a 10-line synthesized result in main context.
* **58. Conversation History Compression (Cat A | 40–60% reduction):** Use concise checkpoint summaries at milestone boundaries to prune obsolete tool scratch logs.
* **59. Summarization of Previous Agent Steps (Cat A | 30–45% reduction):** State "All 92 tests pass" instead of printing 300 lines of raw terminal test logs into the response.

#### 7. Tool Output Optimization & Prompt Caching (Techniques 60–66)
* **60. Tool Output Filtering (Cat A | 60–85% reduction):** Run targeted test files (`bun test src/core/layout/obstacle-router.test.ts`) instead of the entire 92-test suite on every minor change.
* **61. Tool Output Compression (Cat A | 40–60% reduction):** Always specify `StartLine:EndLine` when using `view_file`. Never view entire 800-line files.
* **62. Structured Tool Responses (Cat C | 20–30% reduction):** Emit compact JSON data from helper scripts rather than verbose explanatory text.
* **63. Avoiding Redundant Tool Results (Cat A | 25–40% reduction):** Cache and remember search results from previous turns; do not re-grep unchanged files.
* **64. Caching Stable Context (Cat A | 70–90% cost reduction):** Keep system prompts and skill descriptions stable and immutable to maximize **Prompt Caching** (cache hit rates).
* **65. Reusing Previously Retrieved Context (Cat A | 20–35% reduction):** Refer to type definitions already loaded in memory rather than calling `view_file` repeatedly.
* **66. Context Reuse Across Agent Steps (Cat A | 25–40% reduction):** Pass clean structured state between subagent turns.

#### 8. Architectural Awareness & Git Scoping (Techniques 67–75)
* **67. Repository-Level Knowledge Graph (Cat E | Not Recommended):** Graph database infrastructure is excessive for a single repository.
* **68. Dependency Graph-Based Retrieval (Cat B | 25–35% reduction):** Follow imports linearly: Store ➔ Core Engine ➔ Primitives.
* **69. Architecture-Aware Retrieval (Cat A | 30–45% reduction):** Maintain clear architectural layers: UI Component (`components/`) ➔ State (`store/`) ➔ Pure Engine (`core/`). Navigate directly to the responsible layer.
* **70. Test-Aware Context Retrieval (Cat A | 35–50% reduction):** Inspect the corresponding `.test.ts` file to understand contracts before modifying implementations.
* **71. Change-Impact-Based Context Selection (Cat B | 25–40% reduction):** Use TypeScript compiler to detect impacted downstream call sites.
* **72. Git-Diff-Aware Context Selection (Cat A | 40–60% reduction):** Run `git status -s` and `git diff` during verification to inspect only modified lines.
* **73. Incremental Context Loading (Cat A | 30–50% reduction):** Modify and verify one file at a time.
* **74. Change-Scope Isolation (Cat A | 30–45% reduction):** When modifying the obstacle router, strictly isolate changes from unrelated components like `AuthModal` or `SQLImporter`.
* **75. Read-Before-Load Optimization (Cat A | 35–55% reduction):** Check file size and line counts before inspecting. If a file is large (>400 lines), target specific symbols.

#### 9. Truth Boundaries & Anti-Slop (Techniques 76–80)
* **76. Reference-Based Documentation (Cat A | 40–60% reduction):** Cite standard database literature (Elmasri & Navathe) rather than pasting textbook chapters into comments.
* **77. Link-Based Progressive Disclosure (Cat A | 35–50% reduction):** Use Obsidian-style `[[WikiLinks]]` cross-references throughout `docs/`.
* **78. Canonical Source of Truth (Cat A | 20–30% reduction):** Define all entity dimensions and layout spacing constants in `obstacle-router.ts` (`DENSITY_SPACING`) only. Never duplicate constants.
* **79. Single-Source-of-Truth Documentation (Cat A | 20–30% reduction):** `docs/INDEX.md` is the sole directory root for project documentation.
* **80. Removing General-Knowledge Instructions (Cat A | 30–50% reduction):** **Zero Tolerance for General Slop:** Never explain how React hooks work, how TypeScript interfaces function, or basic SQL syntax. Modern LLMs have complete mastery of general programming concepts; document only project-specific invariants.

---

## 3. The 10 Golden Rules for AI Agents (Practical Playbook)

Any AI agent or developer operating within this codebase must adhere to these 10 practical rules:

### 1. The 50-Line Slicing Rule
Never use `view_file` to view more than 100 lines at once unless writing a whole-file diff. Use `run_command` with `Select-String` (or grep) to locate the target function or line number, then inspect precisely with `StartLine` and `EndLine`.

```powershell
# [OK] Correct: Find line number first
Select-String -Path "frontend/src/core/layout/obstacle-router.ts" -Pattern "computeOrganicPath" -Context 0,0

# Then call view_file with StartLine: 220, EndLine: 270 (50 lines)
```

### 2. Test-First Contract Inspection
When tasked with updating or debugging an algorithm in `frontend/src/core/`, **read the corresponding `.test.ts` file first**, not the implementation file. Test files state the exact inputs, outputs, and edge cases in compact syntax.

### 3. Targeted Test Execution
Never run the entire test suite during incremental development. Run only the test file you are modifying:

```bash
# [OK] Correct: Fast, targeted, low-token output (~20 lines)
bun test src/core/layout/obstacle-router.test.ts

# [FAIL] Wrong: Emits 150+ lines across all 10 test files on every minor edit
bun test
```
*Run the full suite (`bun test`) only once during final verification before committing.*

### 4. Compiler-Driven Type Validation
Never write long conversational prompts asking the AI to verify whether types match. Run:

```bash
bunx tsc --noEmit
```
The TypeScript compiler executes in ~2 seconds and produces deterministic error locations with zero token waste.

### 5. Minimal Initial Context (Turn 1 Discipline)
On Turn 1 of a user request:
1. Do not immediately open 5 source files.
2. Formulate a technical hypothesis or plan first.
3. Open only the single file identified as the entry point.

### 6. Offload Heavy Research to Subagents
If a task requires auditing 10+ documentation files, reviewing git history across 50 commits, or scanning third-party dependencies:
* Dispatch a `research` subagent using `invoke_subagent`.
* The subagent performs the exploration in an isolated context and returns a concise summary, preventing the main conversation context from bloating.

### 7. Never Repeat General Knowledge (No AI Slop)
Do not write documentation or instructions explaining:
* How React `useState` or `useEffect` works.
* What SQL `PRIMARY KEY` or `FOREIGN KEY` means theoretically.
* Standard Tailwind CSS class meanings.
* State only the **custom business logic**, **mathematical invariants**, and **architectural seams**.

### 8. Single Source of Truth for Constants
Always import constants from their canonical definitions. If layout spacing values are needed, import `DENSITY_SPACING` from `frontend/src/core/layout/obstacle-router.ts`. Never hardcode numerical mirrors elsewhere.

### 9. Prompt the Positive (Avoid Negation Chains)
State what the code **must do** in clear positive directives. Avoid negative instruction chains (e.g. *"Do not do X, make sure never to Y, avoid Z"*), which paradoxically activate the forbidden behavior in LLM attention layers and consume double the tokens.

### 10. Git-Diff Verification
When reviewing work before committing, use:

```powershell
git status --short
git diff --stat
```
Inspect only the diff hunks of modified files to confirm zero regressions.

---

## 4. Anti-Patterns That Inflate Token Consumption

| Anti-Pattern | Why It Fails | Token-Efficient Replacement |
| :--- | :--- | :--- |
| **Full File Dumps** | Viewing 600-line files dumps ~3,000 tokens per call | Line-sliced viewing (`StartLine:EndLine`) |
| **Re-running Full Test Suite** | Emits 200+ lines of terminal text on every save | Targeted file test: `bun test path/to/file.test.ts` |
| **Repeated Search Commands** | Grepping the same keyword across the repo 3 times in 1 task | Cache and review findings in scratchpad memory |
| **Vector RAG on Local Code** | Embeddings hallucinate AST structures and miss exact imports | Exact symbol grep + TypeScript compiler diagnostics |
| **Verbose Chat Responses** | Quoting 200 lines of unchanged code back to the user | Link to file and line range (`[file#L10-L30]`) |
| **Inline Theory Dumps** | Pasting database textbook definitions into component files | Point to `docs/knowledge_base/` via `[[WikiLinks]]` |

---

## 5. Verification Checklist

Before completing any task, ensure compliance with the Token Optimization standard:

```
□ Minimal initial context maintained (no speculative file reads)
□ Symbol slicing used for all file inspections (no unbounded view_file calls)
□ Targeted test execution used during incremental loop (bun test <specific_file>)
□ Full verification run only at completion (bun test && bun run build)
□ No general-knowledge explanations added to documentation
□ Canonical constants imported from Single Source of Truth
□ Terminal outputs summarized compactly in chat responses
```
