import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { vectorService } from "./book.service";
import { searchSimilarContent } from "./site.service";
import { queryCatalogService } from "./queryCatalog.service";
import LoggerService from "./logger.service";

export const aiService = {
    async generateAnswer({ promptText }: { promptText: string }) {
        try {
            let similarContent: Awaited<
                ReturnType<typeof searchSimilarContent>
            > = [];

            // Try to get context, but don't fail if unavailable
            try {
                similarContent = await searchSimilarContent(promptText, 5);
            } catch (searchError) {
                LoggerService.warn(
                    "ChromaDB unavailable, proceeding without context",
                    {
                        error: (searchError as Error).message,
                    },
                );
                // Continue without similar content
            }

            const contextText = similarContent.length
                ? similarContent
                      .map(
                          (item, idx) =>
                              `[Zdroj ${idx + 1}: ${item.section}]\nURL: ${item.url}\n${item.text}`,
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
DŮLEŽITÉ: Když odpovídáš na dotaz pomocí informací z webu, vždy přidej na konec odpovědi odkazy ve formátu:
"📎 Více informací: [Název sekce](URL)"
Můžeš uvést více odkazů, pokud jsou relevantní.
Pokud čtenář hledá KONKRÉTNÍ knihu (podle názvu nebo autora), použij funkci searchCatalog.
Pokud potřebuješ doporučit knihy podle tématu/žánru, použij funkci recommendBooks.
Pokud čtenář popisuje děj knihy, použij funkci findBookByPlot.`,
                },
                {
                    role: "system",
                    content: `Následující informace jsou z webových stránek knihovny a JSOU RELEVANTNÍ pro odpověď:\n\n${contextText}\n\nPoužij PŘESNĚ tyto informace k odpovědi na otázku uživatele. Pokud informace obsahují data, termíny nebo události, VŽDY je zahrň do odpovědi. Přidej odkazy na relevantní stránky.`,
                },
                { role: "user", content: promptText },
            ];

            const functions = [
                {
                    name: "searchCatalog",
                    description:
                        "Search the library catalog for specific books by title or author. Use this when user asks for a specific book name or author's works. Fast and accurate for known titles.",
                    parameters: {
                        type: "object",
                        properties: {
                            searchType: {
                                type: "string",
                                enum: ["title", "author", "general"],
                                description:
                                    "Type of search: 'title' for book titles, 'author' for author names, 'general' for general search",
                            },
                            query: {
                                type: "string",
                                description:
                                    "The book title, author name, or search term",
                            },
                        },
                        required: ["searchType", "query"],
                    },
                },
                {
                    name: "recommendBooks",
                    description:
                        "Recommend books based on themes, genre, literary period, author era, reader age, or similar books. Use this when user asks for book recommendations by topic/theme.",
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
                                description:
                                    "Description of the book's plot or story",
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
            if (message.function_call?.name === "searchCatalog") {
                const { searchType, query } = JSON.parse(message.function_call.arguments);
                LoggerService.logAIFunctionCall("searchCatalog", { searchType, query });

                let books;
                if (searchType === "title") {
                    books = await queryCatalogService.searchByTitle(query);
                } else if (searchType === "author") {
                    books = await queryCatalogService.searchByAuthor(query);
                } else {
                    books = await queryCatalogService.searchGeneral(query);
                }

                if (books.length === 0) {
                    return "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.";
                }

                return books
                    .map((b) => {
                        let result = `📘 **[${b.title}](${b.url})** — ${b.author}`;
                        if (b.year) {
                            result += ` (${b.year})`;
                        }
                        if (b.subjects) {
                            result += `\n**Témata:** ${b.subjects}`;
                        }
                        if (b.description) {
                            const shortDesc = b.description.length > 150 
                                ? b.description.substring(0, 150) + '...' 
                                : b.description;
                            result += `\n${shortDesc}`;
                        }
                        return result;
                    })
                    .join("\n\n");
            }

            if (message.function_call?.name === "recommendBooks") {
                const { query } = JSON.parse(message.function_call.arguments);
                LoggerService.logAIFunctionCall("recommendBooks", { query });
                const books = await vectorService.searchBooks(query);

                return books.length
                    ? books
                          .map((b: typeof books[0]) => {
                              const catalogUrl = `https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-${b.id}-Arila/?disprec=2&iset=1`;
                              const cleanTitle = b.title.replace(/\s*\/\s*$/, '').trim();
                              let result = `📘 **[${cleanTitle}](${catalogUrl})** — ${b.author}`;
                              if (b.subjects) {
                                  result += `\n**Témata:** ${b.subjects}`;
                              }
                              if (b.description) {
                                  const shortDesc = b.description.length > 150 
                                      ? b.description.substring(0, 150) + '...' 
                                      : b.description;
                                  result += `\n${shortDesc}`;
                              }
                              return result;
                          })
                          .join("\n\n")
                    : "Nenašel jsem žádné knihy odpovídající vašemu dotazu.";
            }

            if (message.function_call?.name === "findBookByPlot") {
                const { plotDescription } = JSON.parse(
                    message.function_call.arguments,
                );
                LoggerService.logAIFunctionCall("findBookByPlot", {
                    plotDescription,
                });
                const books = await vectorService.searchBooks(plotDescription);

                return books.length
                    ? books
                          .map((b: typeof books[0]) => {
                              const catalogUrl = `https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-${b.id}-Arila/?disprec=2&iset=1`;
                              const cleanTitle = b.title.replace(/\s*\/\s*$/, '').trim();
                              let result = `📘 **[${cleanTitle}](${catalogUrl})** — ${b.author}`;
                              if (b.subjects) {
                                  result += `\n**Témata:** ${b.subjects}`;
                              }
                              if (b.description) {
                                  const shortDesc = b.description.length > 150 
                                      ? b.description.substring(0, 150) + '...' 
                                      : b.description;
                                  result += `\n${shortDesc}`;
                              }
                              return result;
                          })
                          .join("\n\n")
                    : "Nenašel jsem žádné knihy odpovídající vašemu popisu.";
            }

            // Return direct response from AI with sources
            let answer =
                message.content ??
                "Omlouvám se, ale nemohu odpovědět na váš dotaz.";

            // If AI didn't include links and we have similar content, append them
            if (similarContent.length > 0 && !answer.includes("http")) {
                const uniqueUrls = new Map<
                    string,
                    { section: string; url: string }
                >();

                similarContent.forEach((item) => {
                    if (!uniqueUrls.has(item.url)) {
                        uniqueUrls.set(item.url, {
                            section: item.section,
                            url: item.url,
                        });
                    }
                });

                const links = Array.from(uniqueUrls.values())
                    .slice(0, 3) // Max 3 links
                    .map((item) => `[${item.section}](${item.url})`)
                    .join("\n");

                answer += `\n\n📎 Více informací:\n${links}`;
            }

            LoggerService.info("AI response generated", {
                promptText,
                hasContent: !!message.content,
                hasFunctionCall: !!message.function_call,
                sourcesCount: similarContent.length,
            });

            return answer;
        } catch (error) {
            LoggerService.logError(error as Error, "generateAnswer", {
                promptText,
            });
            return "Omlouám se, došlo k chybě při zpracování vašeho dotazu.";
        }
    },
};
