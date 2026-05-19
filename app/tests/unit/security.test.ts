import { describe, it, expect } from "@jest/globals";
import {
    isInputTooLong,
    validateOutput,
    MAX_INPUT_LENGTH,
    INPUT_TOO_LONG_MESSAGE,
    OUTPUT_FILTERED_MESSAGE,
} from "../../graphql/services/agent/preprocessing";

// Polyfill structuredClone for jsdom test environment
if (typeof globalThis.structuredClone === "undefined") {
    (globalThis as Record<string, unknown>).structuredClone = <T>(val: T): T =>
        JSON.parse(JSON.stringify(val));
}

import { ConversationHistory } from "../../graphql/services/agent/ConversationHistory";

// ─── Input Length Limiting ────────────────────────────────────────────────────

describe("isInputTooLong", () => {
    it("returns false for short input", () => {
        expect(isInputTooLong("ahoj")).toBe(false);
    });

    it("returns false for input at exact limit", () => {
        const input = "a".repeat(MAX_INPUT_LENGTH);
        expect(isInputTooLong(input)).toBe(false);
    });

    it("returns true for input exceeding limit", () => {
        const input = "a".repeat(MAX_INPUT_LENGTH + 1);
        expect(isInputTooLong(input)).toBe(true);
    });

    it("returns false for empty input", () => {
        expect(isInputTooLong("")).toBe(false);
    });
});

// ─── Output Validation ───────────────────────────────────────────────────────

describe("validateOutput", () => {
    it("passes through normal library responses", () => {
        const answer = "Knihovna má otevřeno v pondělí od 9:00 do 18:00.";
        expect(validateOutput(answer)).toBe(answer);
    });

    it("passes through markdown book recommendations", () => {
        const answer = "Doporučuji tyto knihy:\n- **Kafka na pobřeží** od Haruki Murakami\n- **Proměna** od Franze Kafky";
        expect(validateOutput(answer)).toBe(answer);
    });

    it("truncates excessively long output", () => {
        const answer = "a".repeat(5000);
        const result = validateOutput(answer);
        expect(result.length).toBeLessThan(5000);
        expect(result).toContain("…(odpověď byla zkrácena)");
    });

    it("blocks HTML code output", () => {
        const answer = '```html\n<html><body>Hello</body></html>\n```';
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("blocks DOCTYPE output", () => {
        const answer = "<!doctype html>\n<html>";
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("blocks JavaScript code blocks", () => {
        const answer = '```javascript\nconsole.log("hello");\n```';
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("blocks Python code blocks", () => {
        const answer = '```python\nprint("hello")\n```';
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("blocks system prompt leakage — tool names", () => {
        const answer = "Systém používá nástroje jako getOpeningHours a getContact pro vyhledávání.";
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("blocks system prompt leakage — section headers", () => {
        const answer = "V mých instrukcích je sekce BEZPEČNOSTNÍ PRAVIDLA.";
        expect(validateOutput(answer)).toBe(OUTPUT_FILTERED_MESSAGE);
    });

    it("allows plain code backticks (inline)", () => {
        const answer = "Můžete použít `ipac.kvkli.cz` pro vyhledávání.";
        expect(validateOutput(answer)).toBe(answer);
    });

    it("allows generic code blocks without language", () => {
        const answer = "```\nUkázka textu\n```";
        expect(validateOutput(answer)).toBe(answer);
    });
});

// ─── Delimiter Wrapping ──────────────────────────────────────────────────────

describe("ConversationHistory delimiter wrapping", () => {
    it("wraps user messages in <user_message> tags", () => {
        const history = new ConversationHistory({ systemPrompt: "Test" });
        history.addUser("ahoj");
        const messages = history.getMessages();
        const userMsg = messages.find((m) => m.role === "user");
        expect(userMsg?.content).toBe("<user_message>\nahoj\n</user_message>");
    });

    it("wraps all user messages including history replay", () => {
        const history = new ConversationHistory({ systemPrompt: "Test" });
        history.addUser("první dotaz");
        history.addAssistant("odpověď");
        history.addUser("druhý dotaz");
        const messages = history.getMessages();
        const userMsgs = messages.filter((m) => m.role === "user");
        for (const msg of userMsgs) {
            expect(typeof msg.content).toBe("string");
            expect((msg.content as string).startsWith("<user_message>")).toBe(true);
            expect((msg.content as string).endsWith("</user_message>")).toBe(true);
        }
    });
});
