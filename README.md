# Shoppingtool

OpenUI5 Freestyle MVP for a shopping list with mock product recognition.

## Run Locally

```bash
npm install
npm run serve -- --port 8080
```

Open the app at:

```text
http://localhost:8080/index.html
```

Do not open `webapp/index.html` directly from the filesystem. The UI5 bootstrap expects the UI5 Tooling server to provide `resources/sap-ui-core.js`.

## Current Scope

- OpenUI5 Freestyle app with standard SAPUI5 theming.
- Local `JSONModel`, no persistence.
- Free-text shopping input.
- Mock product recognition, including `buttermann -> Butter`.
- Editable product candidates with name, quantity and unit.
- Confirm and delete actions.

## Next Architecture Direction

- Keep the UI5 frontend standard and Fiori-oriented.
- Move recognition from mock rules toward explainable fuzzy matching.
- Add a CAP backend later, backed by PostgreSQL.
- Persist scraper results in the database.
- Store offer and price history so price trends can be analyzed over time.
- Target deployment on a private NAS after the MVP is stable.
