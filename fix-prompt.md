# Fix: AI Skips Multi-Step Flow for "Similar Books" Recommendations

## Problem Analysis

When a user says _"Dočetl jsem knihu Na větrné Hůrce a chtěl bych si přečíst podobné"_, the expected flow is:

1. **Step 1 — searchCatalog**: Look up "Na větrné Hůrce" by title → get its description/subjects (Gothic romance, English heathland, love & revenge…)
2. **Step 2 — recommendBooks**: Use that description as query → vector DB returns thematically similar books

**What actually happened:** The AI called `recommendBooks(query: "Na větrné Hůrce")` directly, skipping step 1. The vector search matched on literal words ("větrné" = windy) and returned books about weather, mountains, and nature instead of Gothic romance.

### Why the server-side safeguard failed

There is already a `tryEnrichTitleQuery` function in `tools.ts` that detects short queries (≤8 words) and tries to look up the catalog to enrich them. However:

1. `queryCatalogService.searchByTitle("Na větrné Hůrce", 3)` queries the IPAC HTML catalog scraper — the book "Na Větrné hůrce" (Wuthering Heights) was not found or returned results with non-matching titles.
2. The matching logic uses exact substring inclusion: `titleLower.includes(queryLower) || queryLower.includes(titleLower)` — this fails if the catalog stores it as "Na Větrné hůrce /" (with trailing slash/different casing).
3. When no match is found, it falls back to the raw query "Na větrné Hůrce" → irrelevant vector results.

---

## Solutions

### Solution 1: Refactor System Prompt (Prompt-Level Fix)

**What:** Restructure the system prompt to make the multi-step rule more prominent and harder to ignore. Move the recommendation rule to a dedicated `CRITICAL` section near the top, add explicit JSON-like tool-call examples, and reduce overall prompt verbosity so the model pays more attention to each instruction.

**Changes:**
- Reorganize prompt into hierarchical priority levels (CRITICAL > IMPORTANT > GENERAL)
- Add concrete tool-call sequence examples directly in the prompt
- Use stronger directives: "NEVER call recommendBooks with a book title" 
- Compress repetitive sections to reduce token count

**Risks:**
- ⚠️ **Low reliability** — LLMs can still ignore even strongly worded instructions, especially under high context load
- ⚠️ Prompt restructuring may break compliance with other rules
- ⚠️ Model-dependent: behavior can change with model version updates

**Effort:** Low

---

### Solution 2: Improve Server-Side Safeguard in `tryEnrichTitleQuery` (Code-Level Fix)

**What:** Make the existing `tryEnrichTitleQuery` fallback more robust so it covers cases where the catalog scraper fails but the book exists in ChromaDB.

**Changes:**
- Add fuzzy title matching (normalize diacritics + strip trailing punctuation before comparing)
- If catalog search fails to find a match, fall back to **ChromaDB vector search** for the title to retrieve the book's description
- Log when enrichment succeeds vs. falls back so we can monitor

**Risks:**
- ⚠️ Adds ~1-2s latency to every `recommendBooks` call with short queries (catalog lookup + potential ChromaDB fallback)
- ⚠️ ChromaDB fallback might return a wrong book if the title is ambiguous
- ✅ Transparent to the AI — works regardless of what the model decides to call

**Effort:** Medium

---

### Solution 3: Add a Dedicated `findSimilarBooks` Tool (New Tool)

**What:** Create a new `findSimilarBooks` tool that takes a book title and internally executes the full two-step pipeline (catalog/vector lookup → extract description → vector search for similar). The AI just calls one tool.

**Changes:**
- New tool spec: `findSimilarBooks(title: string, count?: number)`
- Handler: calls catalog search + ChromaDB lookup, extracts description, then calls vector search
- Update system prompt: "When user wants similar books, use `findSimilarBooks`"
- Keep `recommendBooks` for theme/genre-based queries only

**Risks:**
- ⚠️ Tool proliferation — now 8 tools instead of 7; more for the model to reason about
- ⚠️ AI might still incorrectly choose `recommendBooks` over `findSimilarBooks` 
- ✅ Cleanest separation of concerns — the tool does exactly what the user wants
- ✅ Eliminates the multi-step coordination problem entirely

**Effort:** Medium-High

---

### Solution 4: Combine Prompt Refactor + Server Safeguard (Defense in Depth)

**What:** Apply both Solution 1 and Solution 2. Improve the prompt to encourage the correct multi-step behavior, AND harden the server-side enrichment to catch cases where the AI ignores the prompt.

**Changes:**
- All changes from Solution 1 (prompt restructure)
- All changes from Solution 2 (robust `tryEnrichTitleQuery` with fuzzy match + ChromaDB fallback)

**Risks:**
- ⚠️ More code changes = more testing needed
- ✅ Double safety net: even if the AI ignores the prompt, the server catches it
- ✅ Even if the server safeguard picks the wrong book, the AI multi-step flow provides a better experience

**Effort:** Medium

---

### Solution 5: Modular "Build Your Own Prompt" Architecture

**What:** Break the monolithic system prompt into smaller, topic-specific prompt modules (e.g. `getInfoAboutBookRecommendation`, `getInfoAboutSiteInfo`, `getInfoAboutContacts`, `getInfoAboutOpeningHours`). Instead of loading the entire prompt at once, the AI first receives a lightweight routing prompt that tells it to call a meta-tool like `getPromptModule(topic)` to load only the relevant instruction set for the user's question.

**Changes:**
- Split `ai.prompt.ts` into separate prompt modules: `prompts/bookRecommendation.ts`, `prompts/siteInfo.ts`, `prompts/contacts.ts`, `prompts/openingHours.ts`, `prompts/events.ts`, `prompts/catalog.ts`
- Create a new tool `getPromptInstructions(topic: string)` that returns the relevant prompt module text
- The base system prompt becomes a short router: identity, general rules, and instruction to call `getPromptInstructions` before answering domain-specific questions
- Each module contains the full, detailed instructions for that domain (e.g. the book recommendation module includes the multi-step searchCatalog → recommendBooks flow)

**Example flow:**
1. User: "Přečetl jsem Na Větrné hůrce, doporuč podobné"
2. AI receives short base prompt → recognizes book recommendation intent → calls `getPromptInstructions("bookRecommendation")`
3. Gets back detailed instructions including the critical multi-step rule
4. Follows the instructions: `searchCatalog` → extract description → `recommendBooks`

**Risks:**
- ⚠️ **Added latency** — extra tool call round-trip before the AI can start working
- ⚠️ **Routing errors** — AI might load the wrong module or skip the meta-tool entirely
- ⚠️ **Complexity** — more files to maintain, module boundaries can be ambiguous (e.g. "find a book about climate" = catalog or recommendation?)
- ⚠️ **Cross-domain queries** — user asks about opening hours AND book recommendations in one message; AI needs to load multiple modules
- ✅ **Focused context** — AI sees only relevant instructions, reducing distraction and improving compliance
- ✅ **Scalable** — easy to add new domains without bloating the main prompt
- ✅ **Better token efficiency** — smaller prompts per request

**Effort:** High

---

### Solution 6: Combine New Tool + Server Safeguard (Maximum Reliability) ⭐ RECOMMENDED

**What:** Create the `findSimilarBooks` tool (Solution 3) AND improve the `recommendBooks` safeguard (Solution 2). Also update the system prompt to direct the AI to use the new tool.

**Changes:**
- New `findSimilarBooks` tool that encapsulates the full pipeline
- Improved `tryEnrichTitleQuery` in `recommendBooks` as a fallback if AI still calls it with a title
- Prompt update to mention `findSimilarBooks`
- Fuzzy matching + ChromaDB fallback in both code paths

**Risks:**
- ⚠️ Most code changes — higher effort
- ⚠️ 8 tools for the model to choose between
- ✅ Most reliable: works even if AI picks the wrong tool
- ✅ Clean API: `findSimilarBooks` makes the intent explicit
- ✅ Backward-compatible: `recommendBooks` still works for theme queries

**Effort:** High

---

## Recommendation

**Solution 4 (Prompt + Server Safeguard)** offers the best effort-to-reliability ratio:
- The prompt refactor nudges the AI toward correct behavior (step 1 → step 2)
- The hardened `tryEnrichTitleQuery` catches failures silently when the AI skips ahead
- No new tool = no risk of tool selection confusion
- Changes are localized to 2 files: `ai.prompt.ts` and `tools.ts`

Solution 5 is overkill unless Solution 4 proves insufficient in production.

