# Agent Notes

## Project

Shoppingtool is an OpenUI5 Freestyle learning project for a shopping-list app.
The user wants to learn UI5 step by step, not receive large unexplained changes.
Prefer small commits, short explanations, and frequent UI5 binding checks.

## User Preferences

- Talk in German.
- Explain UI5 concepts slowly and concretely.
- Ask small understanding questions after important UI5 changes.
- Detailed teaching, exercises, and understanding questions are primarily for UI5 topics such as XML views, bindings, controllers, components, and models.
- Scraper, PDF parsing, normalization, database, and other infrastructure may be implemented in larger/faster iterations. Explain their purpose, data flow, important decisions, and results at a high level, but do not quiz the user on implementation details unless requested.
- Document scraper and infrastructure decisions in the project so later agents can continue without repeating the discovery work.
- Keep implementation steps small and commit them as separate learning units.
- Do not run `git push`; the user handles pushes.
- Tell the user when pushing is possible.
- Do not start or inspect the dev server unless needed for the current task.

## Current App Direction

The app should first be a practical grocery list, similar to an iOS Notes checklist.
The main flow is:

1. Enter free text such as `2x butter, tomatn, milch`.
2. Recognize products with fuzzy matching.
3. Show editable list items.
4. Use a checkbox to mark purchased items.
5. Delete and recreate items if something is wrong.

The previous "candidate/confirmed" workflow was removed because it is not needed for the intended daily shopping-list usage.

## Product Vision

The long-term app is more than a shopping-list frontend. It should become a private grocery planning and optimization tool:

- Daily use as a shared shopping list.
- Persist shopping lists, purchased items, quantities, prices, and timestamps.
- Store scraped supermarket offer data over time.
- Track historical prices and price trends.
- Compare current offers and recommend the best supermarket or supermarket combination for a shopping list.
- Split recommendations should consider real-world friction, not only item prices. Current heuristic: each additional store has a default penalty of 7 EUR, based on the user's ID.Buzz/time/nerv factor discussion.
- Run on the user's NAS eventually.
- Also become a recipe book and weekly meal-planning tool.
- Recipes should be saved because the user currently plans weekly recipes but loses that planning history.
- Later, recipe ingredients should be proposed directly as shopping-list items, making weekly shopping faster.

Important product idea: recipes, shopping lists, scraped offers, and historical prices should not become separate isolated features. They should feed into each other.

Example future flow:

```text
Plan recipes for the week
        |
        v
Generate ingredient shopping list
        |
        v
Match products with fuzzy recognition
        |
        v
Compare scraped supermarket offers
        |
        v
Suggest cheapest practical shopping route
        |
        v
Save final purchase list and prices
```

## Technical Stack

- OpenUI5 Freestyle app.
- JavaScript and XML views.
- `JSONModel` only, no persistence yet.
- MiniSearch is used for fuzzy product suggestions and recognition.
- SAP/OpenUI5 standard theming should stay visible; avoid custom design-heavy UI.

## Important Files

- `webapp/Component.js`: creates the default `JSONModel`.
- `webapp/view/App.view.xml`: main UI and bindings.
- `webapp/controller/App.controller.js`: event handlers.
- `webapp/model/ProductCatalog.js`: product catalog.
- `webapp/model/ProductSearch.js`: MiniSearch wrapper.
- `webapp/model/ProductRecognition.js`: free-text recognition.
- `webapp/model/ShoppingOptimizer.js`: offer matching, single-store comparison, split recommendation, and extra-store heuristic.
- `docs/ui5-basics.md`: learning notes for the user.
- `docs/data-sourcing-research.md`: scraper research, data flow, source limitations, and normalization decisions.
- `scripts/discover-lidl-offers.js`: downloads and analyzes Lidl source data.
- `scripts/normalize-lidl-flyer.js`: converts raw Lidl flyer JSON into the stable intermediate flyer format.
- `scripts/extract-lidl-pdf-text.js`: extracts readable and positioned PDF text with `pdftotext`.
- `scripts/lib/LidlPdfLayoutParser.js`: converts positioned PDF XHTML into JavaScript pages and text blocks.
- `scripts/lib/LidlOfferCandidateParser.js`: turns positioned blocks into raw offer candidates.
- `scripts/parse-lidl-offers.js`: parses a complete positioned flyer into candidate JSON.
- `ROADMAP.md`: central project handoff, completed work, decisions, data contracts, and ordered next phases.

## Current Scraper State

Current scraper milestone commits:

```text
c098682 Parse Lidl offer candidates
c7f81f9 Parse Lidl PDF text positions
0c7d8b7 Add Lidl PDF text extraction
f92ab35 Add first Lidl flyer normalizer
b590bae Add Lidl offer discovery spike
```

The Lidl source investigation established:

- The leaflet endpoint provides flyer JSON, metadata, page text, images, and a PDF URL.
- Structured JSON products are mostly non-food/online products and are not enough for grocery offers.
- The PDF has an embedded text layer, so Lidl does not currently require OCR.
- `pdftotext -bbox-layout` provides words and coordinates that can be used to associate product names, quantities, prices, and conditions spatially.
- `LidlOfferCandidateParser` now parses fixed packs, multipacks, variable-weight goods, regular prices, Lidl Plus prices, and PDF word breaks.
- The full 20.07.2026-25.07.2026 flyer produced 200 candidates from 69 pages without empty names, invalid prices/quantities, or exact duplicates.
- Every candidate still has `productKey: null` by design. The pipeline stops before optimizer-ready offers.
- The next infrastructure step is a separate, conservative product matcher. It must not be folded into the Lidl PDF parser.

## Verified Commands

These were green after the latest scraper changes:

```bash
npm test
npm run lint
npm run build
```

`npm audit --omit=dev` reported zero production vulnerabilities after adding `fast-xml-parser`.

## Next Useful Steps

- Continue the Lidl infrastructure without detailed teaching questions:
  - share one product catalog between UI5 and Node without duplicating catalog data;
  - map raw product names to `productKey` in a separate product-matching step;
  - preserve match type/confidence and leave uncertain matches as `null`;
  - explicitly test false positives such as `Tomatenketchup`, `Buttermilch`, and `Milchreis`;
  - produce a review report before handing optimizer-ready offers to `ShoppingOptimizer`.
- Return to slow, interactive teaching when the normalized offers are connected to the UI5 `JSONModel`, controller, XML view, and bindings.
- Recipe book, weekly recipe planning, persistence, and NAS hosting remain later phases.
- Treat `ROADMAP.md` as the authoritative ordered handoff for future work.
