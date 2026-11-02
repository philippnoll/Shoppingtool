"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");
const oFixture = require("./fixtures/aldi-nord-current-offers.json");
const aStores = require("../data/stores.json");

test("CLI downloads, persists and reuses chain offers consumable by the existing optimizer", async function () {
  const sDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-aldi-cli-"));

  try {
    await fs.mkdir(path.join(sDirectory, "data"));
    await fs.writeFile(path.join(sDirectory, "data/stores.json"), JSON.stringify(aStores));
    const oProducts = Object.fromEntries(oFixture.products.map(function (oProduct) {
      return [oProduct.objectID, oProduct];
    }));
    const sHtml = "<script id=\"__NEXT_DATA__\">" + JSON.stringify({
      props: {
        pageProps: {
          page: { "@name": oFixture.page.name, "@path": oFixture.page.path },
          locale: oFixture.page.locale,
          apiData: JSON.stringify([["OFFER_GET", {
            req: oFixture.page.request,
            res: { algoliaDataMap: oProducts }
          }]])
        }
      }
    }) + "</script>";
    await fs.writeFile(path.join(sDirectory, "page.html"), sHtml);
    const sPreload = path.join(sDirectory, "network.cjs");
    await fs.writeFile(sPreload, [
      "const fs = require('node:fs');",
      "globalThis.fetch = async function (url) {",
      "  if (process.env.ALDI_TEST_OFFLINE) throw new Error('unexpected network request');",
      "  fs.appendFileSync('requests.txt', url + '\\n');",
      "  return { ok: true, text: async () => fs.readFileSync('page.html', 'utf8') };",
      "};"
    ].join("\n"));
    const sCli = path.resolve(__dirname, "../scripts/fetch-aldi-nord-offers.js");
    const fRun = function (sDate, bOffline) {
      return execFileSync(process.execPath, ["--require", sPreload, sCli, "--as-of", sDate], {
        cwd: sDirectory,
        env: Object.assign({}, process.env, { ALDI_TEST_OFFLINE: bOffline ? "1" : "" }),
        encoding: "utf8",
        timeout: 10000
      });
    };

    const sFirst = fRun("2026-11-02", false);
    assert.match(sFirst, /\(downloaded\)/);
    assert.match(sFirst, /Scope: ALDI Nord chain offers; not a live stock or individual-store claim/);
    const sSecond = fRun("2026-11-02", true);
    assert.match(sSecond, /\(reused\)/);
    assert.equal(await fs.readFile(path.join(sDirectory, "requests.txt"), "utf8"),
      "https://www.aldi-nord.de/angebote.html\n");

    const sOutputDirectory = path.join(sDirectory, "data/normalized/offers/aldi-nord");
    const aFiles = await fs.readdir(sOutputDirectory);
    const fRead = async function (sSuffix) {
      const sFile = aFiles.find(function (sName) {
        return sName.endsWith(sSuffix);
      });
      return JSON.parse(await fs.readFile(path.join(sOutputDirectory, sFile), "utf8"));
    };
    const oCandidates = await fRead(".candidates.json");
    const oReview = await fRead(".review.json");
    const oOptimizer = await fRead(".optimizer-ready.json");
    assert.equal(oCandidates.candidateCount, 5);
    assert.equal(oReview.summary.reviewCount, 4);
    assert.equal(oOptimizer.offerCount, 1);
    assert.deepEqual(oCandidates.candidates[0].rawOffer, oFixture.products[0]);
    assert.ok(oReview.entries.find(function (oEntry) {
      return oEntry.candidate.sourceProductId === "1037558";
    }).reasons.includes("conditional-price"));
    [oCandidates, oReview, oOptimizer].forEach(function (oDocument) {
      assert.equal(oDocument.sourceSnapshot.reused, true);
      assert.equal(oDocument.sourceSnapshot.sha256,
        crypto.createHash("sha256").update(sHtml).digest("hex"));
      assert.equal(oDocument.localApplicability.scope, "aldi-nord-chain");
      assert.equal(oDocument.localApplicability.storeLevelStockKnown, false);
    });
    assert.equal(await fs.readFile(path.join(sDirectory, oOptimizer.sourceSnapshot.path), "utf8"), sHtml);
    const oLoader = createUi5ModuleLoader();
    const ShoppingOptimizer = oLoader.load("shoppingtool/model/ShoppingOptimizer", "webapp/model/ShoppingOptimizer.js");
    const oResult = ShoppingOptimizer.optimize([
      { id: 1, productKey: "butter", name: "Butter", quantity: 500, unit: "g" }
    ], oOptimizer.offers);
    assert.equal(oResult.bestStore.storeId, "aldi-nord-epe");
    assert.equal(oResult.bestStore.missingItems.length, 0);
    assert.equal(oResult.bestStore.matchedItems[0].packages, 2);
    assert.equal(oResult.bestStore.totalPrice, 2.98);

    assert.match(fRun("2026-11-12", true), /Optimizer-ready: 0/);
    const aExpiredFiles = await fs.readdir(sOutputDirectory);
    const sExpiredFile = aExpiredFiles.find(function (sName) {
      return sName.endsWith("as-of-2026-11-12.optimizer-ready.json");
    });
    const oExpired = JSON.parse(await fs.readFile(path.join(sOutputDirectory, sExpiredFile), "utf8"));
    assert.deepEqual(oExpired.offers, []);
  } finally {
    await fs.rm(sDirectory, { recursive: true, force: true });
  }
});
