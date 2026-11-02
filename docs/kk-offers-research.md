# K+K Offer Source and Adapter

Research/resume date: 2026-11-02 (UTC)

## Result

The official K+K catalog viewer is a usable public source. The ordinary viewer
was opened in an isolated Chrome profile with verified TLS and no account or
access-control bypass. Its visible title is `K+K_KW 45`; the page renders real
flyer content and makes successful requests for the catalog XML, text pages,
page maps, and images.

The two earlier 404 checks used guessed URLs containing
`kundk_kw45::catalog`. They were not requests made by the ordinary viewer and
do not describe its behavior. The actual viewer configuration contains
`kundk_kw45::catalog`, while its observed asset path uses the directory name
`kundk_kw45` (without the `::catalog` suffix).

The first K+K adapter now downloads and caches the viewer source, parses one
well-supported package offer, and routes an item without an explicit quantity
or safely associated price to review. A common optimizer-ready output is
available when store IDs are explicitly supplied. The default command does
not supply store IDs, so it emits no store-specific offers while the captain's
store-selection decision remains open.

## Verified public source contract

The live viewer loaded these actual resources successfully:

- Viewer: `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`
- Catalog XML: `/catalogs/kundk_kw45/xml/catalog.xml` — HTTP 200,
  `name="kundk_kw45"`, `nofpages="12"`.
- Page text: `/catalogs/kundk_kw45/text/bk_1.txt` and `bk_2.txt` — HTTP 200
  in the ordinary viewer. A bounded source capture then fetched all 12 text
  pages, each as `text/plain` with HTTP 200.
- Page map: `/catalogs/kundk_kw45/maps/bk_8.xml` — HTTP 200 and an empty
  `<page/>`. The captured page-1 map contains only the retailer website link.
  Maps are not structured offer records.
- Page image: `/catalogs/kundk_kw45/normal/bk_8.jpg` — HTTP 200. It was
  inspected in the viewer and retained as an ignored raw research artifact.

The catalog XML declares image detail levels and page count, but no structured
product, package, price, or validity fields. The text files expose flyer text
without reliable product-card coordinates; text from adjacent columns can be
interleaved. The parser therefore supports a deliberately narrow pattern
instead of guessing associations for every item.

The flyer states exact validity as `02.11.2026–07.11.2026`. Page 1 prints the
start date without its year, while pages 2–12 independently print both full
dates. The adapter takes only the full explicit ranges and rejects missing or
conflicting dates; it does not infer a year from the week number.

## Verified offer samples and parser boundaries

### Barilla La Collezione pasta — supported candidate

Page 8 contains the product label `Barilla La Collezione`, an explicit
`500g Packung`, and `1kg = 3.98`. The normal viewer image visibly confirms the
sale price `1.99 EUR`; the printed base price and explicit package amount also
produce that exact amount (`3.98 EUR/kg × 500g ÷ 1000`). The candidate records
that transparent calculation, page 8, source text URL, and source image URL.
The shared product catalog has the explicit offer alias
`barilla la collezione` → `nudeln`. The shared matcher also recognizes
`tafelaepfel` as apples and excludes `passierte tomaten` from fresh-tomato
matches, preventing a processed tomato product from being misclassified.

The text stream interleaves adjacent offer fields, so the parser requires the
known package/base-price pairing in the page's short section and declines the
offer if those fields are missing or ambiguous. This is not a general claim
that all items on page 8—or all items in the flyer—are parsed.

### Tafeläpfel — review only

Tafeläpfel appear on pages 1 and 4; the page image shows a price, but the
source does not state an explicitly associated package quantity. The text
layer also does not safely associate that price with the product. One shared
source candidate records both page references and stays in review with no
quantity or price. It is not promoted.

The front-page Dr. Oetker pizza example remains unsupported as a catalog item
and has a `280g–410g` variant range rather than one package size. It is not
converted into an invented quantity.

## Epe applicability and store identity

The official store finder returned three nearby Epe branches for postcode
48599:

- Gronauer Str. 105a
- Amtsweg 3
- Feldkamp 81

Each result showed the same week-45 catalog link and title. This is source
evidence for a shared Epe flyer. It does not identify which physical branch is
represented by internal IDs `kk-epe-west` and `kk-epe-ost`; both current records
still lack street addresses. `data/stores.json` and the preferred-store set
were not changed.

The candidate document is store-neutral. `KkOfferPromoter` accepts explicit
store IDs, validates that they are K+K stores in the verified 48599 Epe area,
and fans the one source offer out with the same stable `sourceOfferId`. No IDs
are selected by default. The final West/Ost-versus-three-branches choice is
still pending; do not add a third preferred store or map either internal ID to
a street address without the captain's decision.

## Adapter and reproducibility

Run the bounded source-to-output pipeline with:

```bash
npm run parse:kk-offers -- --as-of YYYY-MM-DD
```

The optional `--store-id <id>` argument is repeatable, but it must be supplied
explicitly. Without it, the optimizer document has `offers: []`, while the
review document reports `store-selection-pending` for the otherwise complete
Barilla candidate. The current run parsed two candidates: one exact Barilla
pasta candidate and one incomplete Tafeläpfel review entry.

The source client:

- discovers the catalog ID from the official viewer HTML, then validates it
  against `catalog.xml`;
- downloads all declared text pages sequentially with a short interval;
- stores original viewer/XML/text responses, ETags, timestamps, hashes, and
  request status under ignored `data/raw/offers/kk/<catalogId>/`;
- reuses cached bodies with `If-None-Match`/HTTP 304, uses normal TLS
  verification, applies request timeouts and one bounded retry for transient
  failures, and stops on HTTP 429;
- writes candidates, review, and optimizer-ready JSON under ignored
  `data/normalized/offers/kk/`.

A small sanitized set of public page-text excerpts is versioned under
`test/fixtures/kk/`; full source payloads and page images remain outside Git.
The source-page maps, captured page-8 image, and complete 12-page text capture
are retained in the ignored raw research directory.

## Previously checked alternatives

The public MeinProspekt Gronau (Westfalen), postcode 48599 page and KaufDA's
local homepage showed no K+K offers. KaufDA's robots.txt disallows its search
and brochure-viewer paths; those paths were not accessed. The prior K+K news
image example also lacked exact validity and had a variant package range, so
it was not sufficient for optimizer output on its own.

## Source URLs

- Official retailer: `https://www.klaas-und-kock.de/`
- Current viewer: `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`
- Store finder: `https://www.klaas-und-kock.de/naechster-kk/`
- Sample article index: `https://www.klaas-und-kock.de/angebote/news/article-435.html`
- Earlier pizza article: `https://www.klaas-und-kock.de/angebote/news/article-826.html`
- Earlier pizza image: `https://www.klaas-und-kock.de/img_files/xxl/1200/kw/kw45-news-spitze-1_6462_1.jpg`
- MeinProspekt Gronau: `https://www.meinprospekt.de/gronau-westfalen`
- KaufDA local homepage: `https://www.kaufda.de/`
