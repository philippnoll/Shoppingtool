"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { publish } = require("../scripts/publish-offers");

const sProjectRoot = fs.mkdtempSync(path.join(__dirname, ".tmp-publish-test-"));
const sFixturePath = path.join(__dirname, "fixtures", "optimizer-ready-offers.json");

fs.mkdirSync(path.join(sProjectRoot, "data"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "..", "data", "stores.json"), path.join(sProjectRoot, "data", "stores.json"));

test.after(function () {
  fs.rmSync(sProjectRoot, { recursive: true, force: true });
});

test("publishes only the optimizer-ready snapshot and store registry to fixed web resources", function () {
  const oResult = publish(sFixturePath, sProjectRoot);
  const oPublished = JSON.parse(fs.readFileSync(path.join(sProjectRoot, "webapp", "data", "offers", "optimizer-ready.json"), "utf8"));
  const aPublishedStores = JSON.parse(fs.readFileSync(path.join(sProjectRoot, "webapp", "data", "stores.json"), "utf8"));

  assert.equal(oResult.offerCount, 8);
  assert.equal(oResult.publicOffersPath, "webapp/data/offers/optimizer-ready.json");
  assert.deepEqual(oPublished, require("./fixtures/optimizer-ready-offers.json"));
  assert.equal(aPublishedStores.length, 5);
});

test("refuses review documents and does not publish raw or review data", function () {
  const sReviewPath = path.join(sProjectRoot, "review.json");
  const sCandidatePath = path.join(sProjectRoot, "candidates.json");
  const sReviewOutput = path.join(sProjectRoot, "webapp", "data", "offers", "optimizer-ready.json");
  fs.writeFileSync(sReviewPath, JSON.stringify({ kind: "lidl-offer-review", entries: [] }));
  fs.writeFileSync(sCandidatePath, JSON.stringify({ source: "lidl-pdf", candidates: [] }));

  [sReviewPath, sCandidatePath].forEach(function (sInputPath) {
    assert.throws(function () {
      publish(sInputPath, sProjectRoot);
    }, /Only an optimizer-ready/);
  });
  assert.equal(fs.existsSync(sReviewOutput), true);
});

test("publishes only bounded public fields and keeps private provenance out of the browser file", function () {
  const oPrivateSnapshot = JSON.parse(fs.readFileSync(sFixturePath, "utf8"));
  const sPrivatePath = path.join(sProjectRoot, "private-snapshot.json");
  const sPublishedPath = path.join(sProjectRoot, "webapp", "data", "offers", "optimizer-ready.json");
  oPrivateSnapshot.provenance = { sourceFile: "/private/data/raw/flyer.json", raw: { token: "private" } };
  oPrivateSnapshot.offers[0].provenance = { sourceFile: "/private/data/raw/page.pdf" };
  oPrivateSnapshot.offers[0].internalNotes = "private metadata";
  fs.writeFileSync(sPrivatePath, JSON.stringify(oPrivateSnapshot));

  publish(sPrivatePath, sProjectRoot);

  const oPublished = JSON.parse(fs.readFileSync(sPublishedPath, "utf8"));
  assert.equal(Object.hasOwn(oPublished, "provenance"), false);
  assert.equal(Object.hasOwn(oPublished.offers[0], "provenance"), false);
  assert.equal(Object.hasOwn(oPublished.offers[0], "internalNotes"), false);
  assert.deepEqual(Object.keys(oPublished.offers[0]), Object.keys(require("./fixtures/optimizer-ready-offers.json").offers[0]));
});
