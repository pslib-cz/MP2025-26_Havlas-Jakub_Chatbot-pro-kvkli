import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { vectorService } from "./book.service";
import { searchSimilarContent } from "./site.service";
import LoggerService from "./logger.service";

export const aiService = {
    async generateWithFaq({ promptText }: { promptText: string }) {
        try {
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
                    content: `Jsi knihovník Alda z Krajské vědecké knihovny v Liberci.
Odpovídáš na otázky čtenářů o knihovně, službách, akcích a doporučuješ knihy.
Vždy odpovídej přátelsky a profesionálně v češtině.
Pokud máš k dispozici relevantní informace z webu knihovny, využij je pro odpověď.
Pokud potřebuješ doporučit knihy, použij funkci recommendBooks.
Pokud čtenář popisuje děj knihy, použij funkci findBookByPlot.`,
                },
                {
                    role: "system",
                    content: `Následující informace jsou z webových stránek knihovny:\n\n${contextText}\n\nPoužij tyto informace k odpovědi na otázku uživatele.`,
                },
                { role: "user", content: promptText },
            ];

            const functions = [
                {
                    name: "recommendBooks",
                    description:
                        "Recommend books based on themes, genre, literary period, author era, reader age, or similar books. Use this when user asks for book recommendations.",
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
                        "Identify a specific book when the user describes its story or plot. Use this when user describes a book's content or story.",
                    parameters: {
                        type: "object",
                        properties: {
                            plotDescription: { 
                                type: "string",
                                description: "Description of the book's plot or story"
                            },
                        },
                        required: ["plotDescription"],
                    },
                },
            ];

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
                functions,
                function_call: "auto",
                temperature: 0.7,
            });

            const message = response.choices[0].message;

            // Handle function calls
            if (message.function_call?.name === "recommendBooks") {
                const { query } = JSON.parse(message.function_call.arguments);
                LoggerService.logAIFunctionCall("recommendBooks", { query });
                const books = await vectorService.searchBooks(query);

                return books.length
                    ? books.map((b) => `📘 ${b.title} — ${b.author}`).join("\n\n")
                    : "Nenašel jsem žádné knihy odpovídající vašemu dotazu.";
            }

            if (message.function_call?.name === "findBookByPlot") {
                const { plotDescription } = JSON.parse(message.function_call.arguments);
                LoggerService.logAIFunctionCall("findBookByPlot", { plotDescription });
                const books = await vectorService.searchBooks(plotDescription);

                return books.length
                    ? books.map((b) => `📘 ${b.title} — ${b.author}`).join("\n\n")
                    : "Nenašel jsem žádné knihy odpovídající vašemu popisu.";
            }

            // Return direct response from AI
            const answer = message.content ?? "Omlouám se, ale nemohu odpovědět na váš dotaz.";

            LoggerService.info("AI response generated", { 
                promptText, 
                hasContent: !!message.content,
                hasFunctionCall: !!message.function_call 
            });

            return answer;
        } catch (error) {
            LoggerService.logError(error as Error, "generateWithFaq", { promptText });
            return "Omlouám se, došlo k chybě při zpracování vašeho dotazu.";
        }
    },
};
