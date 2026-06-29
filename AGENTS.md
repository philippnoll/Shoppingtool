# Agent Notes

## Project

Shoppingtool is an OpenUI5 Freestyle learning project for a shopping-list app.
The user wants to learn UI5 step by step, not receive large unexplained changes.
Prefer small commits, short explanations, and frequent UI5 binding checks.

## User Preferences

- Talk in German.
- Explain UI5 concepts slowly and concretely.
- Ask small understanding questions after important UI5 changes.
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
- `docs/ui5-basics.md`: learning notes for the user.

## Current Git State At Handoff

Latest local commit:

```text
7886421 Simplify shopping list purchased state
```

The repo was `ahead 1` after that commit. The user said they handle pushing.

## Verified Commands

Both were green after the latest changes:

```bash
npm run lint
npm run build
```

## Next Useful Steps

- Let the user test the purchased checkbox behavior visually.
- If they confirm the UX, a good next small step is improving the free-text parser for common grocery input:
  - `2 butter`
  - `2x butter`
  - `2 x butter`
  - comma, semicolon, and newline separated entries
- Recipe book, weekly recipe planning, persistence, scraper, supermarket comparison, and NAS hosting are future phases.
