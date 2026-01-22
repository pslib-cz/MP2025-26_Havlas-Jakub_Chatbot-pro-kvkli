import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { vectorService } from "./book.service";
import { searchSimilarContent } from "./site.service";

export const aiService = {
    async generateWithFaq({ promptText }: { promptText: string }) {
        const similarContent = await searchSimilarContent(promptText, 5);

        const contextText = similarContent.length
            ? similarContent
                  .map(
                      (item) => `[${item.section}] (${item.url})\n${item.text}`,
                  )
                  .join("\n\n")
            : "Žádný relevantní obsah nebyl nalezen.";

        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: `
        Jsi knihovník Alda...
        `,
            },
            {
                role: "system",
                content: `Použij následující informace z webových stránek:\n${contextText}`,
            },
            { role: "user", content: promptText },
        ];

        const functions = [
            {
                name: "recommendBooks",
                description:
                    "Recommend books based on themes, genre, literary period, author era, reader age, or similar books",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description:
                                "User request for book recommendations (themes, era, authors, genre, etc.)",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "findBookByPlot",
                description:
                    "Identify a specific book when the user describes its story or plot",
                parameters: {
                    type: "object",
                    properties: {
                        plotDescription: { type: "string" },
                    },
                    required: ["plotDescription"],
                },
            },
            {
                name: "getContextFromStaticSite",
                description:
                    "Retrieve non-book information from the library website such as opening hours, events, news, FAQs, and schedules",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string" },
                    },
                    required: ["query"],
                },
            },
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            functions,
            function_call: "auto",
            temperature: 0.4,
        });

        const message = response.choices[0].message;

        if (message.function_call?.name === "recommendBooks") {
            const { query } = JSON.parse(message.function_call.arguments);
            console.log("Searching books for plot:", query);
            const books = await vectorService.searchBooks(query);

            return books.length
                ? books.map((b) => `📘 ${b.title} — ${b.author}`).join("\n\n")
                : "Nenašel jsem žádné knihy.";
        }
        if (message.function_call?.name === "findBookByPlot") {
            const { query } = JSON.parse(message.function_call.arguments);
            console.log("Searching books for plot:", query);
            const books = await vectorService.searchBooks(query);

            return books.length
                ? books.map((b) => `📘 ${b.title} — ${b.author}`).join("\n\n")
                : "Nenašel jsem žádné knihy.";
        }

        if (message.function_call?.name === "searchSimilarContent") {
            const { query, limit = 5 } = JSON.parse(
                message.function_call.arguments,
            );
            const content = await searchSimilarContent(query, limit);

            return content.length
                ? content
                      .map(
                          (item) =>
                              `**${item.section}** (${item.url})\n${item.text}`,
                      )
                      .join("\n\n---\n\n")
                : "Nenašel jsem žádný relevantní obsah.";
        }

        return message.content ?? "Žádná odpověď";
    },
};
