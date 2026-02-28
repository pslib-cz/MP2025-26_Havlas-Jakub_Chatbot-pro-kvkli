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
- Funkci searchWebsite volej POUZE když potřebuješ konkrétní informace z webu knihovny (služby, akce, kontakty, otevírací doby poboček apod.).
- NEVOLEJ searchWebsite pro běžné pozdravy, testy, nebo otázky které dokážeš zodpovědět sám.

DŮLEŽITÉ PRAVIDLO PRO KONTAKTY:
- Ředitelkou knihovny je PhDr. Dana Petrýdesová (ředitelství)
- "Ředitel" = hledej ředitelku/ředitelství
- Když odpovídáš na dotazy o vedení/ředitelství, vždy uváděj správnou osobu z oddělení "Ředitelství"

KRITICKÉ PRAVIDLO: Pokud NEMÁŠ dostatečné informace k odpovědi na otázku, NIKDY SI NEVYMÝŠLEJ.
Místo toho řekni: "Omlouvám se, ale nemám k této otázce dostatečné informace. Zkuste se zeptat jinak nebo kontaktujte přímo knihovnu."

PRAVIDLO PRO KONTEXT KONVERZACE - VELMI DŮLEŽITÉ:
- VŽDY si pamatuj předchozí otázky a odpovědi v konverzaci
- Když uživatel použije zájmena jako "na ní", "na něj", "mu", "toho", "jejich", "jejím", "jeho" apod., MUSÍŠ se odkázat na předchozí kontext
- Pokud jsi v předchozí odpovědi zmínil osobu, místo, věc nebo službu, a uživatel se ptá na detail pomocí zájmena, rozpoznej k čemu se zájmeno vztahuje
- KRITICKÉ: Pokud předchozí konverzace byla o KNIHÁCH nebo AUTORECH a uživatel se ptá "A nějaké volné?", "Jsou dostupné?", "Máte je?" apod., VŽDY to interpretuj jako dotaz na dostupnost knih k vypůjčení — NIKDY jako dotaz na volná místa nebo pracovní nabídky
- Příklady:
  * Pokud uživatel ptal "Kdo je ředitelkou?" a odpověděl jsi "PhDr. Dana Petrýdesová", pak při otázce "Dáš mi na ní číslo?" víš, že "ní" = Dana Petrýdesová = ředitelka
  * Pokud uživatel ptal "Jaké máte knihy od Jo Nesbø?" a pak se ptá "A nějaké volné?" nebo "Jsou volné?", víš, že "volné" = dostupné k vypůjčení knihy od Jo Nesbø → zavolej searchCatalog nebo recommendBooks pro daného autora
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

PRAVIDLO PRO ODKAZY:
- Přidávej odkazy POUZE pokud jsou skutečně relevantní k odpovědi a pomáhají uživateli.
- U jednoduchých odpovědí (pozdravy, krátké dotazy na otevírací dobu, jednoduché informace) NEPŘIDÁVEJ odkazy.
- Formát odkazů: "📎 Více informací: [Název sekce](URL)"

Pokud čtenář hledá KONKRÉTNÍ knihu (podle názvu nebo autora), použij funkci searchCatalog.
Pokud potřebuješ doporučit knihy podle tématu/žánru, použij funkci recommendBooks.
Pokud čtenář popisuje děj knihy, použij funkci findBookByPlot.
Pokud potřebuješ informace z webu knihovny (služby, akce, kontakty, pobočky apod.), použij funkci searchWebsite.`,
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
                        "Search the library catalog for specific books by title or author. Use this when user asks for a specific book name or author's works. Fast and accurate for known titles. NOTE: For author names with diacritics or variations (e.g. 'Nesbo', 'Nesbø', 'Jo Nesbø'), always use searchType 'author' and provide the best known form of the name.",
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
                        "Recommend books based on themes, genre, literary period, author era, reader age, or similar books. Also use this as a FALLBACK when searching for books by a specific author if catalog search returns no results.",
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
                {
                    name: "searchWebsite",
                    description:
                        "Search the library website for information about services, events, contacts, branches, opening hours, registration, fees, etc. Use this when you need specific information from the library's website to answer the user's question. You can formulate your own search query — use expanded terms and synonyms for better results. Do NOT use this for greetings or trivial questions.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description:
                                    "Search query for the library website. Use expanded terms and synonyms (e.g. 'ředitelka ředitelství vedení kontakt telefon email' instead of just 'ředitel').",
                            },
                            maxResults: {
                                type: "number",
                                description:
                                    "Maximum number of results to return (default 5, max 10)",
                            },
                        },
                        required: ["query"],
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

            // Handle searchWebsite function call
            if (message.function_call?.name === "searchWebsite") {
                const { query, maxResults } = JSON.parse(message.function_call.arguments);
                LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

                let similarContent: Awaited<ReturnType<typeof searchSimilarContent>> = [];
                try {
                    similarContent = await searchSimilarContent(query, Math.min(maxResults || 5, 10));
                } catch (searchError) {
                    LoggerService.warn("ChromaDB unavailable for searchWebsite", {
                        error: (searchError as Error).message,
                    });
                }

                const contextText = similarContent.length
                    ? similarContent
                          .map(
                              (item, idx) =>
                                  `[Zdroj ${idx + 1}: ${item.section}]\nURL: ${item.url}\n${item.text}`,
                          )
                          .join("\n\n")
                    : "Žádný relevantní obsah nebyl nalezen na webu knihovny.";

                // Second pass: let AI formulate answer with the search results
                messages.push(
                    { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                    { role: "function", name: "searchWebsite", content: contextText }
                );

                const secondResponse = await openai.chat.completions.create({
                    model: "gpt-5-mini-2025-08-07",
                    messages,
                    functions,
                    function_call: "auto",
                });

                const secondMessage = secondResponse.choices[0].message;

                // Handle chained function calls after searchWebsite
                if (secondMessage.function_call) {
                    return await this.handleFunctionCall(secondMessage, messages, functions);
                }

                LoggerService.info("AI response generated via searchWebsite", {
                    promptText,
                    query,
                    sourcesCount: similarContent.length,
                });

                return secondMessage.content ?? "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
            }

            // Handle other function calls
            if (message.function_call) {
                return await this.handleFunctionCall(message, messages, functions);
            }

            // Direct response from AI (no function call needed)
            const answer = message.content ?? "Omlouvám se, ale nemohu odpovědět na váš dotaz.";

            LoggerService.info("AI response generated", {
                promptText,
                hasContent: !!message.content,
                hasFunctionCall: false,
            });

            return answer;
        } catch (error) {
            LoggerService.logError(error as Error, "generateAnswer", {
                promptText,
            });
            return "Omlouvám se, došlo k chybě při zpracování vašeho dotazu.";
        }
    },

   async handleFunctionCall(
        message: { function_call?: { name: string; arguments: string } | null; content?: string | null },
        messages: ChatCompletionMessageParam[],
        functions: Array<{ name: string; description: string; parameters: object }>,
    ): Promise<string> {
        if (!message.function_call) {
            return message.content ?? "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
        }

        const { name, arguments: args } = message.function_call;

        if (name === "searchCatalog") {
            const { searchType, query } = JSON.parse(args);
            LoggerService.logAIFunctionCall("searchCatalog", { searchType, query });

            let books;
            if (searchType === "title") {
                books = await queryCatalogService.searchByTitle(query);
            } else if (searchType === "author") {
                books = await queryCatalogService.searchByAuthor(query);
                if (books.length === 0) {
                    LoggerService.warn("Catalog author search returned no results, trying vector fallback", { query });
                    const vectorBooks = await vectorService.searchBooks(query);
                    if (vectorBooks.length > 0) {
                        const bookResults = vectorBooks
                            .map((b: typeof vectorBooks[0]) => {
                                const catalogUrl = `https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-${b.id}-Arila/?disprec=2&iset=1`;
                                const cleanTitle = b.title.replace(/\s*\/\s*$/, '').trim();
                                let result = `📘 **[${cleanTitle}](${catalogUrl})** — ${b.author}`;
                                if (b.subjects) result += `\n**Témata:** ${b.subjects}`;
                                if (b.description) {
                                    const shortDesc = b.description.length > 150
                                        ? b.description.substring(0, 150) + '...'
                                        : b.description;
                                    result += `\n${shortDesc}`;
                                }
                                return result;
                            })
                            .join("\n\n");

                        // Let AI format the response with book results
                        messages.push(
                            { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                            { role: "function", name: "searchCatalog", content: bookResults }
                        );

                        const followUp = await openai.chat.completions.create({
                            model: "gpt-5-mini-2025-08-07",
                            messages,
                        });

                        return followUp.choices[0].message.content ?? bookResults;
                    }
                }
            } else {
                books = await queryCatalogService.searchGeneral(query);
            }

            if (books.length === 0) {
                return "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.";
            }

            const bookResults = books
                .map((b) => {
                    let result = `📘 **[${b.title}](${b.url})** — ${b.author}`;
                    if (b.year) result += ` (${b.year})`;
                    if (b.subjects) result += `\n**Témata:** ${b.subjects}`;
                    if (b.description) {
                        const shortDesc = b.description.length > 150
                            ? b.description.substring(0, 150) + '...'
                            : b.description;
                        result += `\n${shortDesc}`;
                    }
                    return result;
                })
                .join("\n\n");

            // Let AI present the results naturally
            messages.push(
                { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                { role: "function", name: "searchCatalog", content: bookResults }
            );

            const followUp = await openai.chat.completions.create({
                model: "gpt-5-mini-2025-08-07",
                messages,
            });

            return followUp.choices[0].message.content ?? bookResults;
        }

        if (name === "recommendBooks") {
            const { query } = JSON.parse(args);
            LoggerService.logAIFunctionCall("recommendBooks", { query });
            const books = await vectorService.searchBooks(query);

            const bookResults = books.length
                ? books
                      .map((b: typeof books[0]) => {
                          const catalogUrl = `https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-${b.id}-Arila/?disprec=2&iset=1`;
                          const cleanTitle = b.title.replace(/\s*\/\s*$/, '').trim();
                          let result = `📘 **[${cleanTitle}](${catalogUrl})** — ${b.author}`;
                          if (b.subjects) result += `\n**Témata:** ${b.subjects}`;
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

            messages.push(
                { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                { role: "function", name: "recommendBooks", content: bookResults }
            );

            const followUp = await openai.chat.completions.create({
                model: "gpt-5-mini-2025-08-07",
                messages,
            });

            return followUp.choices[0].message.content ?? bookResults;
        }

        if (name === "findBookByPlot") {
            const { plotDescription } = JSON.parse(args);
            LoggerService.logAIFunctionCall("findBookByPlot", { plotDescription });
            const books = await vectorService.searchBooks(plotDescription);

            const bookResults = books.length
                ? books
                      .map((b: typeof books[0]) => {
                          const catalogUrl = `https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-${b.id}-Arila/?disprec=2&iset=1`;
                          const cleanTitle = b.title.replace(/\s*\/\s*$/, '').trim();
                          let result = `📘 **[${cleanTitle}](${catalogUrl})** — ${b.author}`;
                          if (b.subjects) result += `\n**Témata:** ${b.subjects}`;
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

            messages.push(
                { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                { role: "function", name: "findBookByPlot", content: bookResults }
            );

            const followUp = await openai.chat.completions.create({
                model: "gpt-5-mini-2025-08-07",
                messages,
            });

            return followUp.choices[0].message.content ?? bookResults;
        }

        // Handle searchWebsite if chained
        if (name === "searchWebsite") {
            const { query, maxResults } = JSON.parse(args);
            LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

            let similarContent: Awaited<ReturnType<typeof searchSimilarContent>> = [];
            try {
                similarContent = await searchSimilarContent(query, Math.min(maxResults || 5, 10));
            } catch (searchError) {
                LoggerService.warn("ChromaDB unavailable for searchWebsite", {
                    error: (searchError as Error).message,
                });
            }

            const contextText = similarContent.length
                ? similarContent
                      .map((item, idx) => `[Zdroj ${idx + 1}: ${item.section}]\nURL: ${item.url}\n${item.text}`)
                      .join("\n\n")
                : "Žádný relevantní obsah nebyl nalezen na webu knihovny.";

            messages.push(
                { role: "assistant", content: null as unknown as string, function_call: message.function_call },
                { role: "function", name: "searchWebsite", content: contextText }
            );

            const followUp = await openai.chat.completions.create({
                model: "gpt-5-mini-2025-08-07",
                messages,
            });

            return followUp.choices[0].message.content ?? "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
        }

        return message.content ?? "Omlouvám se, ale nemohu odpovědět na váš dotaz.";
    },
};
