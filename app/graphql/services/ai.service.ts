import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageToolCall } from "openai/resources/chat";
import { vectorService } from "./book.service";
import { searchSimilarContent } from "./site.service";
import { queryCatalogService } from "./queryCatalog.service";
import LoggerService from "./logger.service";
import { buildSystemPrompt } from "../../lib/ai.prompt";
import { type FunctionDefinition, toolDefinitions } from "../../lib/ai.functions";
import type { GenerateAnswerArgs, BookItem, SearchCatalogArgs, RecommendBooksArgs, FindBookByPlotArgs, SearchWebsiteArgs, ToolFunctionCall, ToolMessage } from "../../types";

// ─── Internal Types ───────────────────────────────────────────────────────────

type ToolHandler = (
    args: Record<string, unknown>,
    messages: ChatCompletionMessageParam[],
    toolCallId: string,
    functionName: string,
) => Promise<string>;

type ToolCallFunction = { id: string; function: { name: string; arguments: string } };

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = "gpt-5-mini-2025-08-07";
const FALLBACK_ANSWER = "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
const CATALOG_BASE_URL = "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat";

// ─── Book Formatting ──────────────────────────────────────────────────────────

function formatBook(b: BookItem): string {
    const url = b.url ?? `${CATALOG_BASE_URL}-${b.id}-Arila/?disprec=2&iset=1`;
    const title = b.title.replace(/\s*\/\s*$/, "").trim();
    let result = `### 📘 [${title}](${url})\n**Autor:** ${b.author}`;
    if (b.year) result += ` (${b.year})`;
    if (b.subjects) result += `\n**Témata:** ${b.subjects}`;
    if (b.description) {
        const desc = b.description.length > 150 ? `${b.description.substring(0, 150)}...` : b.description;
        result += `\n${desc}`;
    }
    return result;
}

function formatBooks(books: BookItem[]): string {
    return books.map(formatBook).join("\n\n");
}

function formatBooksForPrompt(books: BookItem[]): string {
    return formatBooks(books);
}

// ─── OpenAI Abstraction ───────────────────────────────────────────────────────

async function callModel(
    messages: ChatCompletionMessageParam[],
    functions?: FunctionDefinition[],
) {
    const body: ChatCompletionCreateParamsNonStreaming = { model: MODEL, messages };
    if (functions) {
        body.tools = functions.map((fn) => ({ type: "function" as const, function: fn }));
        body.tool_choice = "auto";
    }
    return openai.chat.completions.create(body);
}

// ─── Message Helpers ──────────────────────────────────────────────────────────

function injectToolResult(
    messages: ChatCompletionMessageParam[],
    toolCallId: string,
    functionName: string,
    result: string,
): void {
    messages.push(
        {
            role: "assistant",
            content: null as unknown as string,
            tool_calls: [{ id: toolCallId, type: "function", function: { name: functionName, arguments: "" } }],
        },
        { role: "tool", tool_call_id: toolCallId, content: result },
    );
}

async function finalizeWithModel(
    messages: ChatCompletionMessageParam[],
    toolCallId: string,
    functionName: string,
    content: string,
    fallback: string,
): Promise<string> {
    injectToolResult(messages, toolCallId, functionName, content);
    const response = await callModel(messages);
    return response.choices[0].message.content ?? fallback;
}

function parseToolArgs<T>(raw: string): T {
    return JSON.parse(raw) as T;
}

// ─── Query Sanitization ───────────────────────────────────────────────────────

function sanitizeQuery(query: string): string {
    // Remove null bytes and other control characters, normalize whitespace
    return query.replace(/\x00/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/** Strip all non-ASCII characters, useful as a catalog search fallback */
function toAsciiQuery(query: string): string {
    return query.replace(/[^\x00-\x7F]/g, "").trim();
}

// ─── Message Builder ──────────────────────────────────────────────────────────

function buildMessages(
    promptText: string,
    conversationHistory: Array<{ question: string; answer: string }>,
): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: buildSystemPrompt() },
    ];

    for (const { question, answer } of conversationHistory) {
        messages.push({ role: "user", content: question }, { role: "assistant", content: answer });
    }

    messages.push({ role: "user", content: promptText });
    return messages;
}

// ─── searchWebsite Executor ───────────────────────────────────────────────────

async function executeSearchWebsite(
    query: string,
    maxResults: number | undefined,
): Promise<{ contextText: string; sourcesCount: number }> {
    let similarContent: Awaited<ReturnType<typeof searchSimilarContent>> = [];
    try {
        similarContent = await searchSimilarContent(query, Math.min(maxResults ?? 5, 10));
    } catch (err) {
        LoggerService.warn("ChromaDB unavailable for searchWebsite", { error: (err as Error).message });
    }

    const contextText = similarContent.length
        ? similarContent
              .map((item, idx) => `[Zdroj ${idx + 1}: ${item.section}]\nURL: ${item.url}\n${item.text}`)
              .join("\n\n")
        : "Žádný relevantní obsah nebyl nalezen na webu knihovny.";

    return { contextText, sourcesCount: similarContent.length };
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

const toolHandlers: Record<string, ToolHandler> = {
    async searchCatalog(rawArgs, messages, toolCallId, functionName) {
        const { searchType, query: rawQuery } = rawArgs as unknown as SearchCatalogArgs;
        const query = sanitizeQuery(rawQuery);
        LoggerService.logAIFunctionCall("searchCatalog", { searchType, query });

        if (searchType === "author") {
            let catalogBooks = await queryCatalogService.searchByAuthor(query);

            if (catalogBooks.length === 0) {
                const asciiQuery = toAsciiQuery(query);
                if (asciiQuery && asciiQuery !== query) {
                    LoggerService.warn("Author search retrying with ASCII-stripped query", { original: query, ascii: asciiQuery });
                    catalogBooks = await queryCatalogService.searchByAuthor(asciiQuery);
                }
            }

            if (catalogBooks.length === 0) {
                return "Nenašel jsem žádné knihy od tohoto autora v našem katalogu. Zkuste změnit hledaný výraz, například bez diakritiky.";
            }
            return `V našem katalogu jsme nalezli tyto knihy:\n\n${formatBooks(catalogBooks)}`;
        }

        const books = searchType === "title"
            ? await queryCatalogService.searchByTitle(query)
            : await queryCatalogService.searchGeneral(query);

        if (books.length === 0) {
            return "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.";
        }
        return `V našem katalogu jsme nalezli tyto knihy:\n\n${formatBooks(books)}`;
    },

    async recommendBooks(rawArgs, messages, toolCallId, functionName) {
        const { query: rawQuery } = rawArgs as unknown as RecommendBooksArgs;
        const query = sanitizeQuery(rawQuery);
        LoggerService.logAIFunctionCall("recommendBooks", { query });
        const books = await vectorService.searchBooks(query);
        if (!books.length) {
            return finalizeWithModel(messages, toolCallId, functionName, "Nenašel jsem žádné knihy odpovídající vašemu dotazu.", "Nenašel jsem žádné knihy odpovídající vašemu dotazu.");
        }
        return `Doporučuji tyto knihy:\n\n${formatBooks(books)}`;
    },

    async findBookByPlot(rawArgs, messages, toolCallId, functionName) {
        const { plotDescription: rawPlot } = rawArgs as unknown as FindBookByPlotArgs;
        const plotDescription = sanitizeQuery(rawPlot);
        LoggerService.logAIFunctionCall("findBookByPlot", { plotDescription });
        const books = await vectorService.searchBooks(plotDescription);
        if (!books.length) {
            return finalizeWithModel(messages, toolCallId, functionName, "Nenašel jsem žádné knihy odpovídající vašemu popisu.", "Nenašel jsem žádné knihy odpovídající vašemu popisu.");
        }
        return `Nalezl jsem tyto knihy odpovídající vašemu popisu:\n\n${formatBooks(books)}`;
    },

    async searchWebsite(rawArgs, messages, toolCallId, functionName) {
        const { query: rawQuery, maxResults } = rawArgs as unknown as SearchWebsiteArgs;
        const query = sanitizeQuery(rawQuery);
        LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });
        const { contextText } = await executeSearchWebsite(query, maxResults);
        return finalizeWithModel(messages, toolCallId, functionName, contextText, FALLBACK_ANSWER);
    },
};

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

async function dispatchTool(message: ToolMessage, messages: ChatCompletionMessageParam[]): Promise<string> {
    const anyMsg = message as any;
    const toolCalls: ChatCompletionMessageToolCall[] | undefined = anyMsg.tool_calls;
    const rawToolCall = toolCalls?.[0] ?? (message.function_call ? { id: "legacy", function: message.function_call } : null);

    if (!rawToolCall) {
        return anyMsg.content ?? FALLBACK_ANSWER;
    }

    const toolCall = rawToolCall as { id: string; function: { name: string; arguments: string } };
    const { name, arguments: rawArgs } = toolCall.function;
    const toolCallId: string = toolCall.id ?? "legacy";
    const handler = toolHandlers[name];

    if (!handler) {
        return anyMsg.content ?? FALLBACK_ANSWER;
    }

    const args = parseToolArgs<Record<string, unknown>>(rawArgs);
    return handler(args, messages, toolCallId, name);
}

// ─── Main Orchestration ───────────────────────────────────────────────────────

async function runConversation(
    promptText: string,
    messages: ChatCompletionMessageParam[],
): Promise<string> {
    const firstResponse = await callModel(messages, toolDefinitions);
    const firstMessage = firstResponse.choices[0].message;
    const firstToolCall = firstMessage.tool_calls?.[0] as ToolCallFunction | undefined;

    if (!firstToolCall) {
        LoggerService.info("AI response generated", { promptText, hasFunctionCall: false });
        return firstMessage.content ?? FALLBACK_ANSWER;
    }

    if (firstToolCall.function.name === "searchWebsite") {
        const { query, maxResults } = parseToolArgs<SearchWebsiteArgs>(firstToolCall.function.arguments);
        LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

        const { contextText, sourcesCount } = await executeSearchWebsite(query, maxResults);

        injectToolResult(messages, firstToolCall.id, firstToolCall.function.name, contextText);

        const secondResponse = await callModel(messages, toolDefinitions);
        const secondMessage = secondResponse.choices[0].message;
        const secondToolCall = secondMessage.tool_calls?.[0] as ToolCallFunction | undefined;

        if (secondToolCall) {
            return dispatchTool(secondMessage as unknown as ToolMessage, messages);
        }

        LoggerService.info("AI response generated via searchWebsite", {
            promptText,
            query,
            sourcesCount,
        });

        return secondMessage.content ?? FALLBACK_ANSWER;
    }

    return dispatchTool(firstMessage as unknown as ToolMessage, messages);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const aiService = {
    async generateAnswer({ promptText, conversationHistory = [] }: GenerateAnswerArgs): Promise<string> {
        try {
            const messages = buildMessages(promptText, conversationHistory);
            return await runConversation(promptText, messages);
        } catch (error) {
            LoggerService.logError(error as Error, "generateAnswer", { promptText });
            return "Omlouvám se, došlo k chybě při zpracování vašeho dotazu.";
        }
    },

    async handleFunctionCall(
        message: ToolMessage,
        messages: ChatCompletionMessageParam[],
    ): Promise<string> {
        return dispatchTool(message, messages);
    },
};
