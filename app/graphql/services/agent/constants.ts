// ─── Agent Runtime Constants ──────────────────────────────────────────────────

/** OpenAI model identifier */
export const MODEL = "gpt-5.4-mini";

/** Maximum tool call iterations before forcing a response */
export const MAX_TOOL_ITERATIONS = 5;

/** Fallback response when the model fails to produce an answer */
export const FALLBACK_ANSWER =
    "Omlouvám se, ale nemohu odpovědět na váš dotaz.";

/** Error fallback shown to user on unrecoverable failures */
export const ERROR_FALLBACK =
    "Omlouvám se, došlo k chybě při zpracování vašeho dotazu.";

/** Default system prompt when none is provided */
export const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/** Default number of items to return from tools */
export const DEFAULT_COUNT = 5;

/** Maximum number of items a tool may return */
export const MAX_COUNT = 20;

/** Sentinel value meaning "fetch all pages" for catalog queries */
export const FETCH_ALL_COUNT = 0;

/** Compact formatting threshold — use compact format above this count */
export const COMPACT_THRESHOLD = 5;

/** Base URL for catalog item detail pages */
export const CATALOG_BASE_URL =
    "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat";

/** Maximum number of conversation history messages (excluding system) */
export const DEFAULT_MAX_HISTORY_MESSAGES = 50;
