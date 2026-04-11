# Fast Ideas For Backend Speed

This document is based on code inspection of the current app backend. I did not find usable runtime latency logs in the workspace, so the estimates below are code-based rather than measured from production traces.

## What Looks Slow Right Now

- The answer path is serial: one OpenAI call, then one or more tool calls, then another OpenAI call.
- Some tools do live network work directly on the request path: catalog scraping, opening hours scraping, events scraping, and embedding generation.
- The scraper timeout is 10 seconds, so one slow upstream response can dominate the entire request.
- The app already caches contacts for 10 minutes, but opening hours and events do not use the same pattern.
- There is a catalog over-fetch bug: in `handleSearchCatalog`, any `count >= 20` is treated as `fetch all pages`, not `return 20 results`.
- The prompt forces extra multi-step tool usage in at least one case where the backend already knows how to enrich the query itself.

## Suggested Order

If the goal is to move average latency down quickly, I would start in this order:

1. Fix catalog over-fetch semantics.
2. Cache live data and stop scraping it on every matching request.
3. Remove avoidable OpenAI round trips for similar-book flows.
4. Parallelize independent tool calls and add speculative prefetch.
5. Cache embeddings and make vector lookups cheaper.

## 1. Fix The Catalog Over-Fetch Bug First

### How it would work

Right now `handleSearchCatalog` treats any `count >= MAX_COUNT` as `fetch all`. That means a request for 20 books can trigger full catalog pagination instead of stopping at 20. This is likely one of the highest-cost bugs in the current code.

### What should be changed

- Change the `searchCatalog` flow so only an explicit `fetchAll` signal means "fetch all pages".
- Do not infer `fetchAll` from `count >= 20`.
- Align the following files so they all mean the same thing:
  - `app/graphql/services/agent/tools.ts`
  - `app/graphql/services/agent/preprocessing.ts`
  - `app/graphql/services/agent/constants.ts`
  - `app/graphql/utils/ai.prompt.ts`
- Prefer one of these designs:
  - Keep `count` numeric and add `fetchAll?: boolean`.
  - Or reserve a special sentinel only when the backend itself sets it, never when the model passes a user-facing count.

### Documentation

- Document the exact meaning of `count` versus `fetchAll` in the tool contract.
- Remove the current mismatch where the prompt says "all = 40" but runtime clamps to 20 and `searchCatalog` treats 20 as fetch-all.

### Risks

- Very low risk technically.
- The main behavioral change is that "20 books" will finally mean 20 books instead of "as many pages as the catalog has".

### Estimated help

- High on affected catalog queries.
- Roughly 2 to 8 seconds faster when the current bug is triggered.
- Low to medium average gain overall, depending on how often users ask for large result sets.

## 2. Cache Live Data Instead Of Scraping Every Time

This is the strongest version of your "cache the data instead of getting everytime" idea.

### How it would work

For opening hours and events, the backend should stop scraping the external website during every user request. Instead:

- Short term: add in-memory TTL cache with in-flight request deduplication.
- Better: refresh data in the background every few minutes and serve requests from local memory, Prisma, or Redis.
- Best: use stale-while-revalidate so users get a fast answer immediately and the refresh happens after the response.

The code already does this for contacts in `contact.service.ts`, so there is a working pattern to copy.

### What should be changed

- Add cache wrappers around:
  - `scrapeOpeningHours()`
  - `scrapeEvents()`
- Keep the existing contact cache and make the cache strategy consistent.
- Add in-flight deduplication so 20 concurrent requests for opening hours only produce one outbound scrape.
- If you want a stronger solution, add a scheduled refresher that stores the parsed result in local storage or the database.

### Documentation

- Document TTLs for each data source.
- Document when stale data is acceptable.
- Add a short admin/debug note for how to force refresh cached live data.

### Risks

- Cached data can become stale.
- In-memory cache only helps inside one process; multi-instance deployments need Redis or database-backed cache.

### Estimated help

- Very high on opening-hours and events queries.
- Roughly 1 to 6 seconds faster on those queries.
- Near-zero impact on catalog-only queries.

## 3. Remove An Extra OpenAI Round Trip For Similar-Book Requests

### How it would work

The prompt currently forces this sequence:

1. `searchCatalog(title)`
2. `recommendBooks(...)`
3. final answer

But `handleRecommendBooks` already contains `tryEnrichTitleQuery`, which means the backend can turn a short title into a richer recommendation query on its own. That means the model often does extra reasoning steps that the backend can already absorb.

### What should be changed

- Simplify the prompt so title-based similarity requests can call `recommendBooks` directly.
- Keep `tryEnrichTitleQuery()` as the backend fallback.
- If you want clearer semantics, add a dedicated tool such as `recommendSimilarToTitle` and let the backend own the enrichment flow completely.

### Documentation

- Update the prompt and tool descriptions so they no longer require the model to do a manual multi-step chain for title similarity.
- Document the fallback behavior when catalog enrichment fails.

### Risks

- If title enrichment fails, recommendation quality can drop slightly.
- This is easy to mitigate by falling back to the current two-step flow only when enrichment returns nothing useful.

### Estimated help

- High for "recommend something like this book" questions.
- Roughly 1 to 3 seconds faster on those queries.

## 4. Parallelize Independent Tool Calls In The Agent Runtime

This is the safe part of your "make all function calls asynchronous" idea.

### How it would work

Inside `AgentRuntime.run`, tool calls returned in the same assistant message are currently executed one by one in a `for` loop. If the model asks for multiple independent tools in the same step, the backend waits for each in sequence.

Instead:

- Run same-iteration tool calls with `Promise.allSettled`.
- Preserve result order when writing tool outputs back into history.
- Add deduplication when the same tool is called with identical arguments in the same iteration.

### What should be changed

- Update `app/graphql/services/agent/AgentRuntime.ts`.
- Add request-scoped logging IDs so parallel tool spans are still understandable in logs.
- Optionally mark tools as parallel-safe if you want stricter control.

### Documentation

- Document that only independent tool calls within one iteration run in parallel.
- Document that true multi-step chains still remain sequential because the model needs previous tool results before the next reasoning step.

### Risks

- More concurrent load on outbound services.
- Harder debugging without better timing logs.
- Some future tools may have dependencies that should not run in parallel.

### Estimated help

- Medium when multiple tools are emitted together.
- Roughly 0 to 3 seconds faster, depending on query shape.
- No benefit for single-tool queries.

## 5. Add Speculative Prefetch While The First Model Call Is Running

This is the more ambitious version of "let AI think while data is being scraped".

### How it would work

The model cannot finish a tool-dependent answer before it sees the tool result, but you can still overlap work:

- Run a very small intent classifier on the raw user message.
- If the request looks like opening hours, events, contacts, or catalog lookup, start the likely data fetch immediately.
- While that fetch is running, let the first OpenAI reasoning call run normally.
- If the model later asks for that tool, reuse the already-running promise.

This does not break the agent loop, but it shortens idle waiting between reasoning and data access.

### What should be changed

- Add a request-scoped prefetch registry near `generateAnswer()`.
- Teach tool handlers to consume prefetched promises if available.
- Keep prefetch rules small and conservative.

### Documentation

- Document which intents trigger prefetch.
- Document cancellation and timeout behavior.

### Risks

- Wasted outbound traffic when the heuristic guesses wrong.
- Too much speculative work can increase upstream load instead of decreasing latency.

### Estimated help

- Medium on matching queries.
- Roughly 0.5 to 2 seconds faster when the heuristic is correct.

## 6. Cache Embeddings And Reuse Hot Vector Resources

### How it would work

`searchWebsite`, `recommendBooks`, and `findBookByPlot` all pay for repeated vector-search setup work:

- embedding generation for the query
- collection lookup
- extra Chroma calls like `count()`

For popular or repeated queries, cache the normalized query embedding. Also keep hot collection handles and lightweight metadata in memory instead of re-resolving them each time.

### What should be changed

- Add an embedding cache keyed by normalized query text.
- Use it in:
  - `app/graphql/services/book.service.ts`
  - `app/graphql/services/site.service.ts`
- Cache Chroma collection handles and avoid repeated `getCollection()` / `count()` work where possible.

### Documentation

- Document embedding cache TTL and invalidation rules.
- Document that vector caches must be invalidated after crawl or re-embedding updates.

### Risks

- Stale cached embeddings can slightly delay visibility of newly crawled content if invalidation is forgotten.
- Memory usage needs a cap.

### Estimated help

- Medium for vector-based queries.
- Roughly 0.4 to 1.5 seconds faster on `searchWebsite`, `recommendBooks`, and `findBookByPlot`.

## 7. Make Catalog Responses Cheaper By Default

### How it would work

Catalog search currently does one search page request and then fetches individual detail pages for each selected book. That is expensive, and not every answer needs rich detail data.

The cheap path should be:

- Use search-page data for fast list answers.
- Only fetch detail pages when you truly need `description` and `subjects`.
- Optionally fetch rich details only for the top 1 to 2 results, or only when the user asks for more detail.

### What should be changed

- Split `queryCatalogService` into:
  - fast list search
  - rich detail enrichment
- Let `searchCatalog` choose the mode based on requested output size and formatting style.
- Tie rich detail fetching to the cases where `formatBooks()` will actually show that extra metadata.

### Documentation

- Document the difference between fast list mode and rich metadata mode.
- Document when the backend upgrades a result from fast to rich.

### Risks

- Less descriptive default answers.
- Author verification may need a bit more robust parsing if it no longer depends on detail pages.

### Estimated help

- High for catalog searches.
- Roughly 1 to 4 seconds faster on many book lookup requests.

## 8. Shrink Prompt And History Payload

### How it would work

The system prompt is long and repetitive, and history is trimmed only by message count, not by token budget. That increases model latency and cost, especially as answers become longer.

The faster pattern is:

- shorter system prompt
- intent-specific tool rules instead of one large monolith
- summarized history instead of full previous answers
- token-aware history trimming before each OpenAI call

### What should be changed

- Refactor `app/graphql/utils/ai.prompt.ts` into a smaller base prompt plus a compact tool policy block.
- Implement real token-aware trimming in `ConversationHistory.getTokenSafeMessages()`.
- Consider storing a short summary of prior turns instead of raw full answers.

### Documentation

- Document prompt design goals: shortest prompt that still preserves tool accuracy.
- Document conversation retention policy and summary behavior.

### Risks

- Over-compressing the prompt can reduce tool-call accuracy.
- Needs testing against Czech user flows, especially live-data queries.

### Estimated help

- Medium average improvement.
- Roughly 0.2 to 1.5 seconds faster on average, more on longer conversations.

## 9. Stream Progress And First Tokens Instead Of Blocking The Mutation

### How it would work

This does not reduce backend compute time, but it does reduce user-visible waiting.

The current GraphQL mutation blocks until `aiService.generateAnswer()` fully completes. A better UX is:

- immediately send a progress event such as "searching catalog" or "loading opening hours"
- start streaming tokens when the final assistant answer begins
- persist the completed answer after the stream finishes

### What should be changed

- Move from a purely blocking mutation to SSE, WebSocket, GraphQL subscription, or a Next.js streaming route.
- Add OpenAI streaming support in `OpenAIClient.ts`.
- Update the frontend widget to handle partial responses and tool-progress states.

### Documentation

- Document streaming event types.
- Document reconnect, cancel, and persistence behavior.

### Risks

- Bigger API and frontend change than the cache fixes.
- Requires careful handling of moderation, retries, and persistence.

### Estimated help

- Backend speed: 0 seconds.
- Perceived latency: 2 to 6 seconds better for users.

## 10. Add Proper Latency Instrumentation Before And After The Fixes

### How it would work

You currently log events, but not request timing spans. Add timing for:

- total request time
- first OpenAI call
- each tool execution
- second OpenAI call
- timeout/fallback path

Without this, it is too easy to optimize the wrong layer.

### What should be changed

- Add span timing in:
  - `app/graphql/services/ai.service.ts`
  - `app/graphql/services/agent/AgentRuntime.ts`
  - each slow tool handler
  - `app/graphql/services/logger.service.ts`
- Add a request ID that flows through all logs.
- Add alert thresholds for very slow tool calls.

### Documentation

- Document a basic latency SLO, for example: `p50 < 4s`, `p95 < 8s`.
- Add a short runbook for how to read slow-request logs.

### Risks

- Slightly more log volume.
- No meaningful functional risk.

### Estimated help

- Very small direct speed gain.
- High leverage because it will show which fix actually moves the average down.

## Practical Recommendation

If you want the fastest path to a noticeably better average without redesigning the whole system, I would do this first:

1. Fix the `searchCatalog` over-fetch bug.
2. Add TTL cache + in-flight dedupe for opening hours and events.
3. Let title-similarity requests go directly to `recommendBooks`.
4. Parallelize same-iteration tool calls.
5. Add query-embedding cache for vector search.

That combination is the best chance of moving a 10 second average toward something closer to 4 to 6 seconds without a large frontend rewrite.