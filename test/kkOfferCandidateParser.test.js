"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const KkOfferCandidateParser = require("../scripts/lib/KkOfferCandidateParser");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "kk");
const VIEWER_URL = "https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/";

test("parses an exact K+K package offer and leaves unquantified apples for review", function () {
  const oDocument = KkOfferCandidateParser.parse(createSource());
  const oPasta = oDocument.candidates.find(function (oCandidate) {
    return oCandidate.sourceOfferId === "kundk_kw45:barilla-la-collezione";
  });
  const oApples = oDocument.candidates.find(function (oCandidate) {
    return oCandidate.sourceOfferId === "kundk_kw45:tafelaepfel";
  });

  assert.equal(oDocument.kind, "kk-offer-candidates");
  assert.equal(oDocument.validFrom, "2026-11-02");
  assert.equal(oDocument.validTo, "2026-11-07");
  assert.equal(oDocument.validityStatus, "explicit");
  assert.equal(oDocument.candidateCount, 2);
  assert.equal(oPasta.source, "kk-catalog-text");
  assert.equal(oPasta.chain, "K+K");
  assert.equal(oPasta.sourcePage, 8);
  assert.equal(oPasta.rawName, "Barilla La Collezione");
  assert.equal(oPasta.packageQuantity, 500);
  assert.equal(oPasta.packageUnit, "g");
  assert.equal(oPasta.price, 1.99);
  assert.equal(oPasta.basePrice, 3.98);
  assert.equal(oPasta.priceDerivation, "explicit-base-price-times-explicit-package-quantity");
  assert.match(oPasta.sourceEvidence.priceDerivation, /3\.98 EUR\/kg × 500 g ÷ 1000 = 1\.99 EUR/);
  assert.match(oPasta.sourceEvidence.imageUrl, /normal\/bk_8\.jpg$/);
  assert.equal(oApples.sourcePage, 4);
  assert.deepEqual(oApples.sourcePages, [1, 4]);
  assert.equal(oApples.packageQuantity, null);
  assert.equal(oApples.price, null);
  assert.equal(oApples.confidence, 0.25);
});

test("does not infer a validity year from the partial cover date", function () {
  const oSource = createSource();
  oSource.pages = [oSource.pages[0]];
  const oDocument = KkOfferCandidateParser.parse(oSource);

  assert.equal(oDocument.validityStatus, "missing");
  assert.equal(oDocument.validFrom, null);
  assert.equal(oDocument.validTo, null);
  assert.equal(oDocument.candidates[0].validFrom, null);
});

test("keeps ranged Barilla package sizes in review without deriving a fixed price", function () {
  const oSource = createSource();
  oSource.pages = oSource.pages.map(function (oPage) {
    return oPage.number === 8
      ? Object.assign({}, oPage, { text: oPage.text.replace("500g Packung", "250g–500g Packung") })
      : oPage;
  });
  const oPasta = KkOfferCandidateParser.parse(oSource).candidates.find(function (oCandidate) {
    return oCandidate.sourceOfferId === "kundk_kw45:barilla-la-collezione";
  });

  assert.equal(oPasta.packageQuantity, null);
  assert.equal(oPasta.price, null);
  assert.equal(oPasta.confidence, 0.35);
});

function createSource() {
  return {
    catalogId: "kundk_kw45",
    viewerCatalogId: "kundk_kw45::catalog",
    viewerUrl: VIEWER_URL,
    catalogXmlUrl: VIEWER_URL + "catalogs/kundk_kw45/xml/catalog.xml",
    fetchedAt: "2026-11-02T12:59:02.640Z",
    pageCount: 12,
    pages: [
      {
        number: 1,
        text: readFixture("kundk_kw45-page-1.txt")
      },
      {
        number: 4,
        text: readFixture("kundk_kw45-page-4.txt")
      },
      {
        number: 8,
        text: readFixture("kundk_kw45-page-8.txt")
      }
    ]
  };
}

function readFixture(sName) {
  return fs.readFileSync(path.join(FIXTURE_DIR, sName), "utf8");
}
