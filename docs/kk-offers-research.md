# K+K Offer Source Research

Discovery date: 2026-11-02 (UTC)

## Result

K+K's official public website is `https://www.klaas-und-kock.de/`. It links
"Aktueller Prospekt" to
`https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`. The linked page
is reachable and identifies itself as `K+K_KW 45` / "Unsere Angebote für die
KW 45". Its public viewer configuration names the catalog
`kundk_kw45::catalog`.

This establishes the retailer's intended current source. Direct HTTP requests
to the viewer-code-inferred `catalogs/kundk_kw45::catalog/xml/catalog.xml`,
a page XML path, and the complete-PDF path returned K+K 404 HTML. These paths
were inferred from the public viewer configuration; they are not network
requests captured from the normal viewer, so those responses do not establish
that the ordinary viewer itself fails. The viewer's actual runtime payload
remains unverified. Do not treat a successful response containing the site's
404 page as offer data.

An ordinary Chrome check was attempted using `chrome-devtools-axi` in a
separate named session, with normal verified TLS. The tool reported
`pageId: expected number, received undefined`; its `pages` command reported
zero pages. Firstmate reports the same failure on `about:blank` and that the
PENNY lane is checking configuration-only recovery. No further browser calls
were made here. This is a browser-tool limitation, not evidence that K+K's
viewer is unavailable.

K+K's public offers/news index,
`https://www.klaas-und-kock.de/angebote/news/article-435.html`, also exposes
weekly offer artwork and links to individual article pages. One real example
is article `article-826.html`, whose hero image is
`/img_files/xxl/1200/kw/kw45-news-spitze-1_6462_1.jpg`. Visual inspection of
that image reads: Dr. Oetker Ristorante / Piccola Salame pizzas, 280–410 g
packaging, unit-price range 4.85–7.12 EUR/kg, former price 3.49 EUR, offer
price 1.99 EUR. This is a genuine retailer offer example, but the pack size is
a range covering variants, not one unambiguous optimizer package quantity.
The HTML article contains the image rather than structured offer fields.

The article and catalog identify only week number 45; the inspected source
pages do not state the year or exact `validFrom` / `validTo` dates. The image
has no validity dates either. As of the discovery date the ISO week is 45 of
2026, but inferring offer validity dates from that coincidence would invent
source data. OCR of the low-resolution image was also incomplete, so it is not
a safe source of all its text fields. No candidates should be promoted from
this evidence alone.

## Epe applicability and store identity

The official "Nächster K+K" page accepts a public postcode/radius form. A
request for postcode `48599` and radius `10` returns 11 nearby stores,
including three distinct Gronau-Epe locations:

- Gronauer Str. 105a
- Amtsweg 3
- Feldkamp 81

Each of those three Epe result cards showed the same flyer link
`/kataloge/blaetterkatalog2/` and title `45`. This is evidence that the same
week-45 catalog identity is presented to the Epe stores, rather than three
different flyers. It does not reveal the underlying catalog contents, so it
cannot prove individual prices, validity, or offer-level applicability.

`data/stores.json` currently has `kk-epe-west` and `kk-epe-ost`, but neither
record has a street address. The official finder lists three Epe branches, so
there is not enough recorded information to map those two internal IDs to
specific branches. Preserve the shared catalog evidence if the source becomes
usable, but do not silently invent the branch mapping or duplicate offers as
if they were distinct business offers.

## Bounded follow-up: public alternatives

The public MeinProspekt city landing page
`https://www.meinprospekt.de/gronau-westfalen` loads with location Gronau
(Westfalen), postcode 48599. Its current page data contains ten ranked
brochures and twenty offer cards, with explicit `validFrom` / `validUntil`
fields for represented retailers (for example, Penny's brochure record shows
`2026-11-01T23:00:00.000+0000` through `2026-11-07T23:00:00.000+0000`). It
contains no K+K/Klaas & Kock publisher or offer. The directly linked global publisher index also contains no K+K entry. Thus this is not a usable K+K alternative;
its city-level result also does not establish the specific Epe branches.

KaufDA's public homepage reports location 48599 Gronau, but its returned page
and embedded page data contain no K+K/Klaas & Kock publisher or offer. This
was only a bounded local-page check, not proof that the entire service never
carries K+K. Its robots.txt disallows its search and brochure-viewer paths;
those paths were not accessed.

The browser check could not capture the official viewer's actual requests, so
its runtime remains unresolved. The official news image example remains
insufficient for promotion because it has no exact validity dates and has a
variant pack-size range. The two public alternatives checked provide no
current K+K offer records. No safe, generally available optimizer-ready K+K
output can be established from this evidence, and a discovery-only adapter
would not complete the retailer task.

Resume implementation when either the normal K+K viewer can be verified to
provide usable offer data with exact validity and package details, or another
legitimate public source is found that independently establishes current Epe
applicability and those offer fields. Source discovery itself is already
within the task authority; no separate permission decision is needed.

Do not guess calendar-week dates, select one of the three Epe branches for the
West/Ost IDs, convert a package range to a single quantity, or promote
conditional prices without source evidence. The West/Ost mapping is a separate
pending captain decision; no final store-specific output should be emitted
until that mapping is explicit.

## Reproduction URLs

- Retailer: `https://www.klaas-und-kock.de/`
- Current catalog viewer:
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`
- Viewer-code-inferred catalog metadata path (direct GET returned 404; the
  normal viewer request was not captured):
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45::catalog/xml/catalog.xml`
- Viewer-code-inferred catalog page path (direct GET returned 404; the normal
  viewer request was not captured):
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45::catalog/xml/page_0.xml`
- K+K offers/news index: `https://www.klaas-und-kock.de/angebote/news/article-435.html`
- Sample offer article: `https://www.klaas-und-kock.de/angebote/news/article-826.html`
- Sample offer image:
  `https://www.klaas-und-kock.de/img_files/xxl/1200/kw/kw45-news-spitze-1_6462_1.jpg`
- Public store finder: `https://www.klaas-und-kock.de/naechster-kk/`
- MeinProspekt Gronau landing page:
  `https://www.meinprospekt.de/gronau-westfalen`
- MeinProspekt publisher index: `https://www.meinprospekt.de/marken`
- KaufDA local homepage: `https://www.kaufda.de/` (reports `48599 Gronau`)
