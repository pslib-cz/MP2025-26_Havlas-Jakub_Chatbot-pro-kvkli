import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat";
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
    functionCall: ToolFunctionCall,
) => Promise<string>;

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = "gpt-5-mini-2025-08-07";
const FALLBACK_ANSWER = "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
const CATALOG_BASE_URL = "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat";

// ─── Book Formatting ──────────────────────────────────────────────────────────

function formatBook(b: BookItem): string {
    const url = b.url ?? `${CATALOG_BASE_URL}-${b.id}-Arila/?disprec=2&iset=1`;
    const title = b.title.replace(/\s*\/\s*$/, "").trim();
    let result = `📘 **[${title}](${url})** — ${b.author}`;
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

// ─── OpenAI Abstraction ───────────────────────────────────────────────────────

async function callModel(
    messages: ChatCompletionMessageParam[],
    functions?: FunctionDefinition[],
) {
    const body: ChatCompletionCreateParamsNonStreaming = { model: MODEL, messages };
    if (functions) {
        body.functions = functions;
        body.function_call = "auto";
    }
    return openai.chat.completions.create(body);
}

// ─── Message Helpers ──────────────────────────────────────────────────────────

function injectToolResult(
    messages: ChatCompletionMessageParam[],
    functionCall: ToolFunctionCall,
    result: string,
): void {
    messages.push(
        { role: "assistant", content: null as unknown as string, function_call: functionCall },
        { role: "function", name: functionCall.name, content: result },
    );
}

async function finalizeWithModel(
    messages: ChatCompletionMessageParam[],
    functionCall: ToolFunctionCall,
    content: string,
    fallback: string,
): Promise<string> {
    injectToolResult(messages, functionCall, content);
    const response = await callModel(messages);
    return response.choices[0].message.content ?? fallback;
}

function parseToolArgs<T>(raw: string): T {
    return JSON.parse(raw) as T;
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
    async searchCatalog(rawArgs, messages, functionCall) {
        const { searchType, query } = rawArgs as unknown as SearchCatalogArgs;
        LoggerService.logAIFunctionCall("searchCatalog", { searchType, query });

        if (searchType === "author") {
            const catalogBooks = await queryCatalogService.searchByAuthor(query);
            if (catalogBooks.length === 0) {
                LoggerService.warn("Catalog author search returned no results, trying vector fallback", { query });
                const vectorBooks = await vectorService.searchBooks(query);
                if (vectorBooks.length > 0) {
                    return finalizeWithModel(messages, functionCall, formatBooks(vectorBooks), formatBooks(vectorBooks));
                }
            }
            if (catalogBooks.length === 0) {
                return "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.";
            }
            return finalizeWithModel(messages, functionCall, formatBooks(catalogBooks), formatBooks(catalogBooks));
        }

        const books = searchType === "title"
            ? await queryCatalogService.searchByTitle(query)
            : await queryCatalogService.searchGeneral(query);

        if (books.length === 0) {
            return "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.";
        }
        return finalizeWithModel(messages, functionCall, formatBooks(books), formatBooks(books));
    },

    async recommendBooks(rawArgs, messages, functionCall) {
        const { query } = rawArgs as unknown as RecommendBooksArgs;
        LoggerService.logAIFunctionCall("recommendBooks", { query });
        const books = await vectorService.searchBooks(query);
        const content = books.length ? formatBooks(books) : "Nenašel jsem žádné knihy odpovídající vašemu dotazu.";
        return finalizeWithModel(messages, functionCall, content, content);
    },

    async findBookByPlot(rawArgs, messages, functionCall) {
        const { plotDescription } = rawArgs as unknown as FindBookByPlotArgs;
        LoggerService.logAIFunctionCall("findBookByPlot", { plotDescription });
        const books = await vectorService.searchBooks(plotDescription);
        const content = books.length ? formatBooks(books) : "Nenašel jsem žádné knihy odpovídající vašemu popisu.";
        return finalizeWithModel(messages, functionCall, content, content);
    },

    async searchWebsite(rawArgs, messages, functionCall) {
        const { query, maxResults } = rawArgs as unknown as SearchWebsiteArgs;
        LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });
        const { contextText } = await executeSearchWebsite(query, maxResults);
        return finalizeWithModel(messages, functionCall, contextText, FALLBACK_ANSWER);
    },
};

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

async function dispatchTool(message: ToolMessage, messages: ChatCompletionMessageParam[]): Promise<string> {
    if (!message.function_call) {
        return message.content ?? FALLBACK_ANSWER;
    }

    const { name, arguments: rawArgs } = message.function_call;
    const handler = toolHandlers[name];

    if (!handler) {
        return message.content ?? FALLBACK_ANSWER;
    }

    const args = parseToolArgs<Record<string, unknown>>(rawArgs);
    return handler(args, messages, message.function_call);
}

// ─── Main Orchestration ───────────────────────────────────────────────────────

async function runConversation(
    promptText: string,
    messages: ChatCompletionMessageParam[],
): Promise<string> {
    const firstResponse = await callModel(messages, toolDefinitions);
    const firstMessage = firstResponse.choices[0].message;

    if (!firstMessage.function_call) {
        LoggerService.info("AI response generated", { promptText, hasFunctionCall: false });
        return firstMessage.content ?? FALLBACK_ANSWER;
    }

    if (firstMessage.function_call.name === "searchWebsite") {
        const { query, maxResults } = parseToolArgs<SearchWebsiteArgs>(firstMessage.function_call.arguments);
        LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

        const { contextText, sourcesCount } = await executeSearchWebsite(query, maxResults);

        injectToolResult(messages, firstMessage.function_call, contextText);

        const secondResponse = await callModel(messages, toolDefinitions);
        const secondMessage = secondResponse.choices[0].message;

        if (secondMessage.function_call) {
            return dispatchTool(secondMessage, messages);
        }

        LoggerService.info("AI response generated via searchWebsite", {
            promptText,
            query,
            sourcesCount,
        });

        return secondMessage.content ?? FALLBACK_ANSWER;
    }

    return dispatchTool(firstMessage, messages);
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
