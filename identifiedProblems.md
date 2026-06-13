# Identifikované problémy — První den produkce

## Přehled

Všechny problémy vyřešeny ✅

| # | Problém | Stav |
|---|---------|------|
| 1 | Falešné odmítání dotazů na knihy | ✅ VYŘEŠENO |
| 2 | Nefunkční vyhledávání podle tématu | ✅ VYŘEŠENO |
| 3 | Case-sensitive vyhledávání titulů | ✅ VYŘEŠENO |
| 4 | Přehnaně striktní bezpečnostní pravidla | ✅ VYŘEŠENO |
| 5 | Neschopnost najít info o službách | ✅ VYŘEŠENO |
| 6 | Nesprávné odpovědi o umístění služeb | ✅ VYŘEŠENO |
| 7 | Odmítání dotazů na kontroverzní témata | ✅ VYŘEŠENO |

---

## ~~Problém 5: Neschopnost najít informace o službách knihovny~~ ✅ VYŘEŠENO

**Řešení**: Vytvořen nový nástroj `getServiceInfo` — live scraping konkrétních stránek kvkli.cz s hardcoded sitemap (26 stránek pokrývajících registraci, půjčování, poplatky, ceník, všechny služby). Model dostane seznam dostupných stránek přímo v tool description a vybírá relevantní stránku. Eliminuje závislost na ChromaDB pro FAQ dotazy.

---

## ~~Problém 6: Nesprávné odpovědi o umístění služeb~~ ✅ VYŘEŠENO

**Řešení**: Přidána statická tabulka "KDE NAJÍT" do system promptu s přesným mapováním typů dokumentů na oddělení knihovny (data z oficiální stránky kvkli.cz/sluzby/pujcovani-a-cetba-/kde-najit). Model nyní odpovídá okamžitě bez volání nástrojů — DVD → Kreativní knihovna, mapy → Studijní knihovna, audioknihy → Všeobecná knihovna/Knihovna pro děti a mládež atd. Pro detailní info je k dispozici `getServiceInfo` se stránkou `/sluzby/pujcovani-a-cetba-/kde-najit`.
