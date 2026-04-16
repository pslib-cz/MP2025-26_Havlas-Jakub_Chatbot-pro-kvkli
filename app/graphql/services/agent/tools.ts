// ─── Tool Definitions — Barrel Re-export ──────────────────────────────────────
//
// Split into:
//   tools/schemas.ts      — Zod validation schemas
//   tools/specs.ts        — OpenAI function specs
//   tools/bookHandlers.ts — Catalog, recommendations, plot search handlers
//   tools/infoHandlers.ts — Website, contact, hours, events, office handlers
//   tools/registry.ts     — createToolRegistry factory
//

export { createToolRegistry } from "./tools/registry";
