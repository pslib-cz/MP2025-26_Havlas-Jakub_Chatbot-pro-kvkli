// ─── Agent Runtime — Barrel Export ─────────────────────────────────────────────

export { AgentRuntime } from "./AgentRuntime";
export type { AgentRuntimeOptions } from "./AgentRuntime";
export { ConversationHistory } from "./ConversationHistory";
export type { ConversationHistoryConfig } from "./ConversationHistory";
export { ToolRegistry } from "./ToolRegistry";
export { chatCompletion } from "./OpenAIClient";
export { createToolRegistry } from "./tools";

export type {
    ToolDefinition,
    ToolHandlerFn,
    ValidatedArgs,
    AgentRuntimeConfig,
    AgentResult,
    StoredMessage,
} from "./types";

export {
    MODEL,
    MAX_TOOL_ITERATIONS,
    FALLBACK_ANSWER,
    ERROR_FALLBACK,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_COUNT,
    MAX_COUNT,
    FETCH_ALL_COUNT,
    COMPACT_THRESHOLD,
    CATALOG_BASE_URL,
    DEFAULT_MAX_HISTORY_MESSAGES,
} from "./constants";

export {
    sanitizeInput,
    normalizeUnicode,
    toAsciiOnly,
    normalizeForComparison,
    normalizeCount,
    stripAuthorRole,
} from "./preprocessing";

export {
    formatBooks,
    deduplicateBooks,
    filterByAuthor,
    ensureBookUrls,
} from "./formatting";
