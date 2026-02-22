import { openai } from "../../lib/openAI";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import { vectorService } from "./book.service";
import { searchSimilarContent } from "./site.service";
import { queryCatalogService } from "./queryCatalog.service";
import LoggerService from "./logger.service";

export const aiService = {
    async generateAnswer({ 
        promptText, 
        conversationHistory = [] 
    }: { 
        promptText: string;
        conversationHistory?: Array<{ question: string; answer: string }>;
    }) {
        try {
            let similarContent: Awaited<
                ReturnType<typeof searchSimilarContent>
            > = [];
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

            // Get current date and time
            const now = new Date();
            const currentDateTime = now.toLocaleString("cs-CZ", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZone: "Europe/Prague",
            });
            const dayOfWeek = now.toLocaleString("cs-CZ", {
                weekday: "long",
                timeZone: "Europe/Prague",
            });

            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: `Aktuální datum a čas: ${currentDateTime} (${dayOfWeek})

Jsi knihovník Alda z Krajské vědecké knihovny v Liberci.
Odpovídáš na otázky čtenářů o knihovně, službách, akcích a doporučuješ knihy.
Vždy odpovídej přátelsky a profesionálně v češtině.

DŮLEŽITÉ PRAVIDLO PRO OTEVÍRACÍ DOBY:
- Pokud se uživatel ptá na otevírací dobu BEZ upřesnění pobočky, VŽDY odpovídej ohledně HLAVNÍ BUDOVY (náměstí Dr. E. Beneše 634/27, Liberec).
- Vesec, Ruprechtice, Machnín a ostatní jsou POBOČKY — ne hlavní budova.
- Otevírací doba hlavní budovy (přesné hodnoty):
  * Vstupní hala a internet: Po–Pá 8:00–19:00, So 9:00–13:00, Ne zavřeno
  * Všeobecná, Studijní a Kreativní knihovna: Po 9:00–19:00, Út 12:00–19:00, St 9:00–19:00, Čt 9:00–19:00, Pá 9:00–19:00, So 9:00–13:00, Ne zavřeno
- Při odpovědi na "má knihovna otevřeno?" uveď aktuální čas, den a zda je hlavní budova otevřená.

DŮLEŽITÉ PRAVIDLO PRO FORMATOVÁNÍ KNIH:
- Každou knihu vždy umísti na NOVÝ ŘÁDEK
- Používej následující formát: 📘 **[Název](URL)** — Autor
- Přidej témata: "\n**Témata:** ..."
- ZKRÁCENÉ POPISY: Skrátit popis na max 150 znaků s "..." na konci, pokud uživatel VÝSLOVNĚ neřekl, aby byly popisy delší
- Zachovej čitelnost: odděluj knihy prázdnými řádky
- Nikdy nezkresluj informace z katalogu

DŮLEŽITÉ PRAVIDLO PRO FUNKCE:
- Můžeš zavolat více funkcí nachází-li se relevantní. Volej všechny relevantní funkce v jedné odpovědi.
- Z výsledků vyber ten s NEJVĚTŠÍM SMYSLEM a RELEVANCÍ pro uživatele.
- Když je výsledek nejednoznačný, zkombinuj výsledky z více funkcí.

DŮLEŽITÉ PRAVIDLO PRO KONTAKTY:
- Ředitelkou knihovny je PhDr. Dana Petrýdesová (ředitelství)
- "Ředitel" = hledej ředitelku/ředitelství
- Když odpovídáš na dotazy o vedení/ředitelství, vždy uváděj správnou osobu z oddělení "Ředitelství"

KRITICKÉ PRAVIDLO: Pokud NEMÁŠ dostatečné informace k odpovědi na otázku, NIKDY SI NEVYMÝŠLEJ.
Místo toho řekni: "Omlouvám se, ale nemám k této otázce dostatečné informace. Zkuste se zeptat jinak nebo kontaktujte přímo knihovnu."

PRAVIDLO PRO KONTEXT KONVERZACE - VELMI DŮLEŽITÉ:
- VŽDY si pamatuj předchozí otázky a odpovědi v konverzaci
- Když uživatel použije zájmena jako "na ní", "na něj", "mu", "toho", "její", "jeho" apod., MUSÍŠ se odkázat na předchozí kontext
- Pokud jsi v předchozí odpovědi zmínil osobu, místo, věc nebo službu, a uživatel se ptá na detail pomocí zájmena, rozpoznej k čemu se zájmeno vztahuje
- Příklady:
  * Pokud uživatel ptal "Kdo je ředitelkou?" a odpověděl jsi "PhDr. Dana Petrýdesová", pak při otázce "Dáš mi na ní číslo?" víš, že "ní" = Dana Petrýdesová = ředitelka
  * Pokud uživatel ptal "Kde je dětské oddělení?" a pak se ptá "Jaké mají číslo?", víš, že "mají" = dětské oddělení

PRAVIDLO PRO VYHLEDÁVÁNÍ S KONTEXTEM:
Když ti uživatel položí následnou otázku s zájmenem nebo odkazem na předchozí kontext:
1. NEJDŘÍVE zkontroluj předchozí konverzaci a identifikuj na co se zájmeno odkazuje
2. Rozšiř dotaz o konkrétní osobu/věc z předchozího kontextu (např. "na ní číslo" + kontext "Dana Petrýdesová" → vyhledej "Dana Petrýdesová telefonní číslo kontakt email ředitelka")
3. Použij rozšířený dotaz pro vyhledání relevantních informací

PRAVIDLO PRO VYHLEDÁVÁNÍ:
Když ti uživatel položí otázku, která vyžaduje vyhledání informací na webu knihovny:
1. Rozšiř dotaz o související termíny a synonyma (např. "ředitel" → "ředitelka, ředitelství, vedení, management")
2. Použij rozšířený dotaz pro lepší nalezení relevantních informací
3. Primárně vyhledávej formální/oficiální termíny místo hovorových

Příklady rozšíření dotazů:
- "ředitel/ředitelka" → "ředitelka + ředitelství + vedení knihovny + management + Dana Petrýdesová"
- "kontakt" → "kontakty + telefonní čísla + emaily + spojení"
- "číslo na ředitelku" → "Dana Petrýdesová + telefon + telefonní číslo + kontakt + email + ředitelství"
- "půjčování" → "výpůjčky + půjčování + jak si půjčit + výpůjční lhůta + borrowing"
- "vrácení" → "návrat + vrácení dokumentů + returning + jak vrátit"

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
                    content: contextText === "Žádný relevantní obsah nebyl nalezen."
                        ? `VAROVÁNÍ: Nebyl nalezen žádný relevantní obsah z webových stránek knihovny. Odpověz pouze pokud máš JISTOTU o správnosti informace, jinak řekni, že nemáš dostatečné informace.`
                        : `Následující informace jsou z webových stránek knihovny a JSOU RELEVANTNÍ pro odpověď:\n\n${contextText}\n\nPoužij PŘESNĚ tyto informace k odpovědi na otázku uživatele. Pokud informace obsahují data, termíny nebo události, VŽDY je zahrň do odpovědi. Přidej odkazy na relevantní stránky.`,
                },
            ];

            // Add conversation history for context
            conversationHistory.forEach(({ question, answer }) => {
                messages.push(
                    { role: "user", content: question },
                    { role: "assistant", content: answer }
                );
            });

            // Add current question
            messages.push({ role: "user", content: promptText });

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
                model: "gpt-5-mini-2025-08-07",
                messages,
                functions,
                function_call: "auto",
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
            return "Omlouvám se, došlo k chybě při zpracování vašeho dotazu.";
        }
    },
};
