# K+K Offer Source Research

Discovery date: 2026-11-02 (UTC)

## Result

K+K's official public website is `https://www.klaas-und-kock.de/`. It links
"Aktueller Prospekt" to
`https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`. The linked page
is reachable and identifies itself as `K+K_KW 45` / "Unsere Angebote für die
KW 45". Its public viewer configuration names the catalog
`kundk_kw45::catalog`.

This establishes the retailer's intended current source, but its offer
payload was not publicly retrievable during discovery. The viewer's expected
`catalogs/kundk_kw45::catalog/xml/catalog.xml`, a page XML request, and the
complete-PDF path all returned the K+K site's 404 HTML page. The catalog
cannot currently supply source pages or an extractable PDF. Do not treat a
successful response containing that site's 404 page as offer data.

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

## Blocker and safe next step

The official source supplies the current-week label and real image offers, but
not currently retrievable full catalog data or exact validity dates. The
available image sample also has a variant pack-size range and does not parse
reliably by local OCR. Consequently there is no safe, generally available
optimizer-ready output yet. A discovery-only adapter would not complete the
K+K retailer task.

Resume implementation only after one of these unblocks the source contract:

1. K+K's linked catalog resources become available and include usable offer
   validity and package details; or
2. the project authority explicitly approves a different public offer source
   that independently establishes the Epe stores, offers, and validity.

Do not guess calendar-week dates, select one of the three Epe branches for the
West/Ost IDs, convert a package range to a single quantity, or promote
conditional prices without source evidence.

## Reproduction URLs

- Retailer: `https://www.klaas-und-kock.de/`
- Current catalog viewer:
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/`
- Expected catalog metadata (returned 404 during discovery):
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45::catalog/xml/catalog.xml`
- Expected catalog page data (returned 404 during discovery):
  `https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45::catalog/xml/page_0.xml`
- K+K offers/news index: `https://www.klaas-und-kock.de/angebote/news/article-435.html`
- Sample offer article: `https://www.klaas-und-kock.de/angebote/news/article-826.html`
- Sample offer image:
  `https://www.klaas-und-kock.de/img_files/xxl/1200/kw/kw45-news-spitze-1_6462_1.jpg`
- Public store finder: `https://www.klaas-und-kock.de/naechster-kk/`
