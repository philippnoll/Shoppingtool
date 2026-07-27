# Shoppingtool

Private OpenUI5 shopping-list and grocery optimization project.

The current app combines a practical checklist, fuzzy product recognition and
an initial store/split optimizer. The repeatable Lidl flyer pipeline discovers
the relevant action flyer, preserves its raw source and PDF, extracts positioned
text, matches conservative product names and promotes only valid,
unconditional offers into an optimizer-ready format.

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
- One end-to-end Lidl command with bounded retries, safe artifact reuse,
  provenance and a quality report.

## Lidl Offer Pipeline

`pdftotext` from `poppler-utils` must be installed. Then run:

```bash
npm run pipeline:lidl
```

The command discovers the active Lidl `Aktionsprospekt` (or the nearest
upcoming one when there is no Sunday flyer), downloads its source JSON and PDF,
extracts text, parses candidates, matches and promotes them, and writes a
quality report. `--as-of YYYY-MM-DD` makes selection and validity checks
reproducible; `--force` deliberately refreshes otherwise reusable artifacts:

```bash
npm run pipeline:lidl -- --as-of 2026-07-23
npm run pipeline:lidl -- --force
```

Outputs stay outside Git:

- `data/raw/offers/lidl/`: discovery response, flyer-specific source JSON,
  metadata, PDF and extracted text;
- `data/normalized/flyers/lidl/`: normalized flyer metadata;
- `data/normalized/offers/lidl/`: separate `.candidates.json`, `.review.json`,
  `.optimizer-ready.json` and `.quality-report.json` files.

Business outputs are named by stable flyer identity, so repeated runs replace
the same snapshot rather than append duplicate offers. Raw flyer sources, PDFs
and extracted text also include content hashes, so a changed artifact does not
overwrite the evidence behind an older run. Fresh discovery data and validated
flyer/PDF/extraction artifacts are reused when safe. Network
requests use finite timeouts and retries; source-shape, missing-PDF, invalid-PDF,
extraction and promotion failures stop the command with an explicit step and
cause. Raw files remain available for diagnosis.

## Documentation

- [Project status and roadmap](ROADMAP.md)
- [Data sourcing and Lidl research](docs/data-sourcing-research.md)
- [UI5 learning notes](docs/ui5-basics.md)

## Next Milestone

Connect the optimizer-ready Lidl output to the UI5 model and view in small,
explained learning steps, without treating flyer offers as complete shelf
prices.
