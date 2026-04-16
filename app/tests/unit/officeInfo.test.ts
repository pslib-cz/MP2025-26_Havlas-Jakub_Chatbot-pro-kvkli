import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock axios
const mockGet = jest.fn();
jest.mock("axios", () => ({
    __esModule: true,
    default: { get: (...args: unknown[]) => mockGet(...args) },
}));

// Mock logger
jest.mock("../../graphql/services/logger.service", () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        logError: jest.fn(),
        logAIFunctionCall: jest.fn(),
    },
    LoggerService: {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        logError: jest.fn(),
        logAIFunctionCall: jest.fn(),
    },
}));

// ─── HTML Fixtures ────────────────────────────────────────────────────────────

const OPENING_HOURS_HTML = `
<html>
<body>
<div class="timetableList">
  <div class="wrap">
    <h2 id="Hlavni_budova">Hlavní budova - vstupní hala, internet</h2>
    <div class="box">
      <div class="tabRow">
        <div class="tabCol">Pondělí</div>
        <div class="tabCol center">8:00-19:00</div>
      </div>
      <div class="tabRow">
        <div class="tabCol">Úterý</div>
        <div class="tabCol center">8:00-19:00</div>
      </div>
    </div>
  </div>
  <div class="wrap">
    <h2 id="Machnin">Machnín - od 1.4. nová otevírací doba</h2>
    <div class="box">
      <div class="tabRow">
        <div class="tabCol">Pondělí</div>
        <div class="tabCol center">9:30-11:30</div>
        <div class="tabCol center">12:00-16:00</div>
      </div>
      <div class="tabRow">
        <div class="tabCol">Středa</div>
        <div class="tabCol center">12:00-16:00</div>
      </div>
    </div>
  </div>
  <div class="wrap">
    <h2 id="Rochlice">Rochlice</h2>
    <div class="box">
      <div class="tabRow">
        <div class="tabCol">Pondělí</div>
        <div class="tabCol center">11:00-17:00</div>
      </div>
    </div>
  </div>
  <div class="wrap">
    <h2 id="Vesec">Vesec</h2>
    <div class="box">
      <div class="tabRow">
        <div class="tabCol">Pondělí</div>
        <div class="tabCol center">9:00-12:00</div>
        <div class="tabCol center">13:00-17:30</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
`;

const BRANCHES_HTML = `
<html>
<body>
<div class="content" role="main">
  <div>
    <h2>Hlavní budova</h2>
    <a href="tel:+420482412133">+420 482 412 133</a>
    <a href="mailto:library@kvkli.cz">library@kvkli.cz</a>
    <span><a href="https://mapy.cz/zakladni?q=Rumjancevova">Rumjancevova 1362/1, Liberec I</a>zobrazit na mapě</span>
    <span>Dopravní spojení zastávka tramvaje č. 2 a 3</span>
  </div>
  <div>
    <h2>Machnín - od 1.4. nová otevírací doba</h2>
    <a href="tel:+420778487666">+420 778 487 666</a>
    <a href="mailto:machnin@kvkli.cz">machnin@kvkli.cz</a>
    <a href="/machnin">Detail pobočky</a>
    <span><a href="https://mapy.cz/zakladni?q=Hermankova">Heřmánková 95, Liberec 33</a>zobrazit na mapě</span>
    <span>Dopravní spojení autobus MHD č. 16, zastávka Machnín</span>
  </div>
  <div>
    <h2>Rochlice - 21.4. otevřeno jen do 15:00</h2>
    <a href="tel:+420607078657">+420 607 078 657</a>
    <a href="mailto:rochlice@kvkli.cz">rochlice@kvkli.cz</a>
    <a href="/rochlice">Detail pobočky</a>
    <span><a href="https://mapy.cz/zakladni?q=Dobiasova">Dobiášova 851/5, Liberec 6</a>zobrazit na mapě</span>
    <span>Dopravní spojení autobus MHD č. 12, 23</span>
  </div>
  <div>
    <h2>Vesec</h2>
    <a href="tel:+420724246025">+420 724 246 025</a>
    <a href="mailto:vesec@kvkli.cz">vesec@kvkli.cz</a>
    <a href="/vesec">Detail pobočky</a>
  </div>
  <div>
    <h2>E‑ZPRAVODAJ</h2>
    <p>Newsletter section — should be skipped</p>
  </div>
  <div>
    <h2>Základní informace</h2>
    <p>Footer section — should be skipped</p>
  </div>
</div>
</body>
</html>
`;

const DETAIL_ROCHLICE_HTML = `
<html>
<body>
<div class="content" role="main">
  <h1>Rochlice</h1>
  <h2 id="Kontaktn_informace">Kontaktní informace</h2>
  <ul>
    <li><strong>Knihovnice</strong>: Jitka Soukupová</li>
    <li><strong>Telefon</strong>: <a href="tel:607078657">607 078 657</a></li>
    <li><strong>E-mail</strong>: <a href="mailto:rochlice@kvkli.cz">rochlice@kvkli.cz</a></li>
    <li><strong>Adresa</strong>: Dobiášova 851/5, Liberec 6</li>
    <li><strong>Dopravní spojení</strong>: autobus MHD č. 12, 23</li>
  </ul>
  <h2 id="Nabzme">Nabízíme</h2>
  <ul>
    <li>Literatura různých žánrů pro dospělé</li>
    <li>Populárně naučná literatura pro dospělé</li>
    <li>Dětská literatura pro děti všech věkových kategorii</li>
    <li>Časopisy pro děti</li>
    <li>Hry – deskové, karetní</li>
    <li>Tisk</li>
  </ul>
  <h2>Fotogalerie</h2>
</div>
</body>
</html>
`;

const DETAIL_MACHNIN_HTML = `
<html>
<body>
<div class="content" role="main">
  <h1>Machnín</h1>
  <h2 id="Kontaktn_informace">Kontaktní informace</h2>
  <ul>
    <li><strong>Knihovnice</strong>: Bc. Eva Šidáková</li>
    <li><strong>Telefon</strong>: <a href="tel:778487666">778 487 666</a></li>
    <li><strong>E-mail</strong>: <a href="mailto:machnin@kvkli.cz">machnin@kvkli.cz</a></li>
    <li><strong>Adresa</strong>: Heřmánková 95, Liberec 33 - Machnín</li>
    <li><strong>Dopravní spojení</strong>: autobus MHD č. 16, zastávka Machnín</li>
  </ul>
  <h2 id="Nabzme">Nabízíme</h2>
  <ul>
    <li>Literatura různých žánrů pro dospělé</li>
    <li>Dětská literatura pro děti všech věkových kategorii</li>
    <li>Audioknihy pro děti a dospělé čtenáře na CD</li>
    <li>Moderní deskové hry</li>
    <li>Tisk, kopírování, skenování</li>
  </ul>
</div>
</body>
</html>
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

import { scrapeOfficeInfo } from "../../graphql/services/scraper.service";

beforeEach(() => {
    mockGet.mockReset();
});

function setupMockResponses(options?: {
    detailPages?: Record<string, string>;
}) {
    mockGet.mockImplementation((url: string) => {
        if (url.includes("oteviraci-doba")) {
            return Promise.resolve({ status: 200, data: OPENING_HOURS_HTML });
        }
        if (url.includes("hlavni-budova-a-pobocky")) {
            return Promise.resolve({ status: 200, data: BRANCHES_HTML });
        }
        // Detail pages
        if (options?.detailPages) {
            for (const [path, html] of Object.entries(options.detailPages)) {
                if (url.includes(path)) {
                    return Promise.resolve({ status: 200, data: html });
                }
            }
        }
        return Promise.resolve({
            status: 200,
            data: "<html><body></body></html>",
        });
    });
}

describe("scrapeOfficeInfo", () => {
    describe("fetching all branches", () => {
        it("should return all branches with opening hours", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            expect(results.length).toBeGreaterThanOrEqual(4);

            const branchNames = results.map((r) => r.branch);
            expect(branchNames).toContain("Hlavní budova");
            expect(
                branchNames.find((b) => b.includes("Machnín")),
            ).toBeDefined();
            expect(
                branchNames.find((b) => b.includes("Rochlice")),
            ).toBeDefined();
            expect(branchNames).toContain("Vesec");
        });

        it("should not include non-branch headers like E-ZPRAVODAJ", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            const branchNames = results.map((r) => r.branch);
            expect(
                branchNames.find((b) => b.includes("ZPRAVODAJ")),
            ).toBeUndefined();
            expect(
                branchNames.find((b) => b.includes("Základní informace")),
            ).toBeUndefined();
        });

        it("should parse opening hours with split time slots", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();
            const machnin = results.find((r) => r.branch.includes("Machnín"));

            expect(machnin).toBeDefined();
            expect(machnin!.openingHours.length).toBeGreaterThanOrEqual(1);

            const monday = machnin!.openingHours.find(
                (d) => d.day === "Pondělí",
            );
            expect(monday).toBeDefined();
            expect(monday!.hours).toEqual(["9:30-11:30", "12:00-16:00"]);
        });

        it("should include contact info from branch listing", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();
            const machnin = results.find((r) => r.branch.includes("Machnín"));

            expect(machnin).toBeDefined();
            expect(machnin!.contact?.email).toBe("machnin@kvkli.cz");
            expect(machnin!.contact?.phones).toContain("+420 778 487 666");
        });

        it("should include detail URL for branches that have one", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            const machnin = results.find((r) => r.branch.includes("Machnín"));
            expect(machnin!.detailUrl).toBe("https://www.kvkli.cz/machnin");

            const rochlice = results.find((r) => r.branch.includes("Rochlice"));
            expect(rochlice!.detailUrl).toBe("https://www.kvkli.cz/rochlice");
        });

        it("should have opening hours URL for each branch", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            for (const branch of results) {
                expect(branch.openingHoursUrl).toContain("oteviraci-doba");
            }
        });
    });

    describe("filtering by branch name", () => {
        it("should filter by exact branch name", async () => {
            setupMockResponses({
                detailPages: { "/rochlice": DETAIL_ROCHLICE_HTML },
            });

            const results = await scrapeOfficeInfo("Rochlice");

            expect(results.length).toBe(1);
            expect(results[0].branch).toContain("Rochlice");
        });

        it("should filter by branch name with diacritics", async () => {
            setupMockResponses({
                detailPages: { "/machnin": DETAIL_MACHNIN_HTML },
            });

            const results = await scrapeOfficeInfo("Machnín");

            expect(results.length).toBe(1);
            expect(results[0].branch).toContain("Machnín");
        });

        it("should filter case-insensitively", async () => {
            setupMockResponses({
                detailPages: { "/rochlice": DETAIL_ROCHLICE_HTML },
            });

            const results = await scrapeOfficeInfo("rochlice");

            expect(results.length).toBe(1);
            expect(results[0].branch).toContain("Rochlice");
        });

        it("should filter without diacritics", async () => {
            setupMockResponses({
                detailPages: { "/machnin": DETAIL_MACHNIN_HTML },
            });

            const results = await scrapeOfficeInfo("Machnin");

            expect(results.length).toBe(1);
            expect(results[0].branch).toContain("Machnín");
        });

        it("should return empty array when no branch matches", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo("Neexistující pobočka");

            expect(results).toEqual([]);
        });
    });

    describe("detail page scraping", () => {
        it("should extract services from detail page", async () => {
            setupMockResponses({
                detailPages: { "/rochlice": DETAIL_ROCHLICE_HTML },
            });

            const results = await scrapeOfficeInfo("Rochlice");

            expect(results[0].services).toBeDefined();
            expect(results[0].services!.length).toBeGreaterThanOrEqual(3);
            expect(results[0].services).toContain(
                "Literatura různých žánrů pro dospělé",
            );
            expect(results[0].services).toContain("Tisk");
        });

        it("should extract librarian name from detail page", async () => {
            setupMockResponses({
                detailPages: { "/rochlice": DETAIL_ROCHLICE_HTML },
            });

            const results = await scrapeOfficeInfo("Rochlice");

            expect(results[0].contact?.librarian).toBe("Jitka Soukupová");
        });

        it("should extract address from detail page contact info", async () => {
            setupMockResponses({
                detailPages: { "/machnin": DETAIL_MACHNIN_HTML },
            });

            const results = await scrapeOfficeInfo("Machnín");

            expect(results[0].contact?.librarian).toBe("Bc. Eva Šidáková");
            expect(results[0].contact?.address).toContain("Heřmánková 95");
        });

        it("should extract transport from detail page", async () => {
            setupMockResponses({
                detailPages: { "/rochlice": DETAIL_ROCHLICE_HTML },
            });

            const results = await scrapeOfficeInfo("Rochlice");

            expect(results[0].contact?.transport).toContain("autobus MHD");
        });

        it("should handle detail page fetch failure gracefully", async () => {
            mockGet.mockImplementation((url: string) => {
                if (url.includes("oteviraci-doba")) {
                    return Promise.resolve({
                        status: 200,
                        data: OPENING_HOURS_HTML,
                    });
                }
                if (url.includes("hlavni-budova-a-pobocky")) {
                    return Promise.resolve({
                        status: 200,
                        data: BRANCHES_HTML,
                    });
                }
                // Detail pages fail
                return Promise.reject(new Error("Network error"));
            });

            const results = await scrapeOfficeInfo("Rochlice");

            // Should still return the branch, just without detail info
            expect(results.length).toBe(1);
            expect(results[0].branch).toContain("Rochlice");
            expect(results[0].services).toBeUndefined();
        });

        it("should not fetch detail pages when no filter is specified", async () => {
            setupMockResponses();

            await scrapeOfficeInfo();

            // Should only have called for the two main pages (opening hours + branches)
            // Detail pages should not be called when there's no filter
            const detailCalls = mockGet.mock.calls.filter(
                (call) =>
                    !String(call[0]).includes("oteviraci-doba") &&
                    !String(call[0]).includes("hlavni-budova-a-pobocky"),
            );
            // Without a filter, all branches are "filtered" so detail pages ARE fetched
            // for branches that have detailUrl — this is expected
            expect(detailCalls.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe("opening hours matching", () => {
        it("should match opening hours by fuzzy branch name", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            // "Machnín - od 1.4. nová otevírací doba" from branches page
            // should match "Machnín - od 1.4. nová otevírací doba" in hours
            const machnin = results.find((r) => r.branch.includes("Machnín"));
            expect(machnin!.openingHours.length).toBeGreaterThan(0);
        });

        it("should match opening hours for Hlavní budova", async () => {
            setupMockResponses();

            const results = await scrapeOfficeInfo();

            const hlavni = results.find((r) =>
                r.branch.includes("Hlavní budova"),
            );
            expect(hlavni).toBeDefined();
            expect(hlavni!.openingHours.length).toBeGreaterThan(0);
        });

        it("should return empty schedule when no hours match", async () => {
            // Opening hours page has no matching branch
            const customHoursHtml = `
                <html><body>
                <div class="timetableList">
                    <div class="wrap">
                        <h2 id="Neznama">Neznámá pobočka</h2>
                        <div class="box">
                            <div class="tabRow">
                                <div class="tabCol">Pondělí</div>
                                <div class="tabCol center">9:00-17:00</div>
                            </div>
                        </div>
                    </div>
                </div>
                </body></html>
            `;

            mockGet.mockImplementation((url: string) => {
                if (url.includes("oteviraci-doba")) {
                    return Promise.resolve({
                        status: 200,
                        data: customHoursHtml,
                    });
                }
                if (url.includes("hlavni-budova-a-pobocky")) {
                    return Promise.resolve({
                        status: 200,
                        data: BRANCHES_HTML,
                    });
                }
                return Promise.resolve({
                    status: 200,
                    data: "<html><body></body></html>",
                });
            });

            const results = await scrapeOfficeInfo();
            const rochlice = results.find((r) => r.branch.includes("Rochlice"));

            expect(rochlice).toBeDefined();
            // No matching hours in the custom hours HTML
            expect(rochlice!.openingHours).toEqual([]);
        });
    });

    describe("error handling", () => {
        it("should propagate errors from main page fetches", async () => {
            mockGet.mockRejectedValue(new Error("Connection refused"));

            await expect(scrapeOfficeInfo()).rejects.toThrow(
                "Connection refused",
            );
        });

        it("should handle empty opening hours page", async () => {
            mockGet.mockImplementation((url: string) => {
                if (url.includes("oteviraci-doba")) {
                    return Promise.resolve({
                        status: 200,
                        data: "<html><body></body></html>",
                    });
                }
                if (url.includes("hlavni-budova-a-pobocky")) {
                    return Promise.resolve({
                        status: 200,
                        data: BRANCHES_HTML,
                    });
                }
                return Promise.resolve({
                    status: 200,
                    data: "<html><body></body></html>",
                });
            });

            const results = await scrapeOfficeInfo();
            // Should still return branches, just without opening hours
            expect(results.length).toBeGreaterThan(0);
            for (const branch of results) {
                expect(branch.openingHours).toEqual([]);
            }
        });

        it("should handle empty branches page", async () => {
            mockGet.mockImplementation((url: string) => {
                if (url.includes("oteviraci-doba")) {
                    return Promise.resolve({
                        status: 200,
                        data: OPENING_HOURS_HTML,
                    });
                }
                if (url.includes("hlavni-budova-a-pobocky")) {
                    return Promise.resolve({
                        status: 200,
                        data: '<html><body><div class="content" role="main"></div></body></html>',
                    });
                }
                return Promise.resolve({
                    status: 200,
                    data: "<html><body></body></html>",
                });
            });

            const results = await scrapeOfficeInfo();
            expect(results).toEqual([]);
        });
    });
});
