# Shoppingtool

Private OpenUI5 shopping-list and grocery optimization project.

The current app combines a practical checklist, fuzzy product recognition and
an initial store/split optimizer. The Lidl flyer pipeline extracts raw offer
candidates from positioned PDF text, matches conservative product names and
promotes only valid, unconditional offers into an optimizer-ready format.
Automated end-to-end retrieval and persistence are the next milestones.

The full project status, decisions and ordered implementation plan live in
[ROADMAP.md](ROADMAP.md).

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

`npm run serve` is only a small wrapper around `ui5 serve`. It sets local tool directories for this development environment:

```bash
UI5_DATA_DIR=.ui5-data XDG_CONFIG_HOME=.config ui5 serve
```

On a normal local setup, direct UI5 Tooling usage works as well:

```bash
npx ui5 serve --port 8080
```

## Current Scope

- OpenUI5 Freestyle app with standard SAPUI5 theming.
- Local `JSONModel`, no persistence.
- Free-text shopping input with quantities and fuzzy product recognition.
- Editable checklist items with purchased state.
- Single-store and split-shopping optimization with mock offers.
- Configurable extra-store penalty, currently 7 EUR.
- Lidl flyer discovery, normalization, PDF extraction and raw offer parsing.
- Separate promotion/review stage with validity, confidence and Lidl Plus
  checks.

## Documentation

- [Project status and roadmap](ROADMAP.md)
- [Data sourcing and Lidl research](docs/data-sourcing-research.md)
- [UI5 learning notes](docs/ui5-basics.md)

## Next Milestone

Make the Lidl pipeline repeatable with one end-to-end command for discovery,
download, PDF extraction, parsing and promotion. Preserve raw sources, use
respectful timeout/retry behavior and emit a clear quality report.
