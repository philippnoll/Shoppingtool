# Shoppingtool

Private OpenUI5 shopping-list and grocery optimization project.

The current app combines a practical checklist, fuzzy product recognition,
and a single-store/split optimizer using published, validated offer snapshots.
The Lidl pipeline discovers flyers, preserves source files, extracts positioned
PDF text, matches product names and promotes only valid unconditional offers.
ALDI Nord also has a current-offer retrieval and review pipeline. Persistence
remains planned work.

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
- Single-store and split-shopping optimization using current, validated offer snapshots.
- Separate loading, empty, request-error and retry states for offer data.
- Offer-only subtotals with explicit coverage and missing-unit explanations.
- Configurable extra-store penalty, currently 7 EUR.
- Lidl flyer discovery, normalization, PDF extraction and raw offer parsing.
- One end-to-end Lidl command with bounded retries, safe artifact reuse,
  provenance and a quality report.
- ALDI Nord current-offer acquisition, conservative normalization, review and
  optimizer-ready output for the ALDI Nord Epe store entry.
- Separate retailer promotion/review stages with validity, confidence and
  conditional-price checks, including Lidl Plus; ALDI Nord chain offers do not
  claim store-level stock.

Retrieve ALDI Nord offers with `npm run fetch:aldi-nord-offers`. Output files,
options and the limits of the local store mapping are documented in
[data sourcing research](docs/data-sourcing-research.md#aldi-nord-discovery-und-adapter).
The UI consumes locally published optimizer-ready snapshots.

## Lidl Offer Pipeline

`pdftotext` from `poppler-utils` must be installed. Then run:

```bash
npm run pipeline:lidl
```

The command discovers the active Lidl `Aktionsprospekt` (or the nearest
upcoming one when none is active), retrieves or safely reuses its source JSON
and PDF, extracts text, parses candidates, matches and promotes them, and
writes a quality report. `--as-of YYYY-MM-DD` sets the reference date for
selection and validity checks; the default is today's UTC date. It uses the
available discovery response, so it does not retrieve historical flyers that
are no longer listed. For historical checks on saved candidates, use
[the separate promotion command](docs/data-sourcing-research.md#promotion-und-review).
`--force` deliberately refreshes otherwise reusable artifacts:

```bash
npm run pipeline:lidl -- --as-of YYYY-MM-DD
npm run pipeline:lidl -- --force
```

Outputs stay outside Git:

- `data/raw/offers/lidl/`: discovery response, flyer-specific source JSON,
  metadata, PDF and extracted text;
- `data/normalized/flyers/lidl/`: normalized flyer metadata;
- `data/normalized/offers/lidl/`: separate `.candidates.json`, `.review.json`,
  `.optimizer-ready.json` and `.quality-report.json` files.

For artifact identity, provenance, reuse rules and failure handling, see
[the pipeline reference](docs/data-sourcing-research.md#wiederholbare-end-to-end-pipeline).

## Documentation

- [Project status and roadmap](ROADMAP.md)
- [Data sourcing and retailer research](docs/data-sourcing-research.md)
- [UI5 learning notes](docs/ui5-basics.md)

## Publish Local Offer Snapshots

Before a backend exists, publish generated optimizer-ready JSON into the fixed
same-origin resources consumed by the app. Candidate and review documents are
refused; generated app data is ignored by Git.

```bash
npm run promote:lidl-offers -- \
  data/normalized/offers/lidl/<prospekt>.candidates.json
npm run publish:offers -- \
  data/normalized/offers/lidl/<prospekt>.optimizer-ready.json
```

The publisher exposes only the browser contract fields and omits private source
provenance. Publish before `npm run build` for static builds. See [the offer data
flow and limitations](docs/data-sourcing-research.md#ui5-angebotssnapshots-ohne-backend).
