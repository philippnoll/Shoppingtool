"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const AldiNordOfferSource = require("../scripts/lib/AldiNordOfferSource");

const FIXED_NOW = new Date("2026-11-02T12:10:00.000Z");

function createResponse(sHtml, nStatus) {
  const nResponseStatus = nStatus || 200;

  return {
    ok: nResponseStatus >= 200 && nResponseStatus < 300,
    status: nResponseStatus,
    text: async function () {
      return sHtml;
    }
  };
}

async function withTempDirectory(fTest) {
  const sDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-aldi-test-"));

  try {
    await fTest(sDirectory);
  } finally {
    await fs.rm(sDirectory, { recursive: true, force: true });
  }
}

test("downloads once, validates, preserves provenance and reuses a fresh intact snapshot", async function () {
  await withTempDirectory(async function (sDirectory) {
    let nFetchCount = 0;
    const fValidate = function (sHtml) {
      assert.match(sHtml, /official ALDI offer page/);
    };
    const oFirst = await AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: async function (sUrl, oOptions) {
        nFetchCount += 1;
        assert.equal(sUrl, AldiNordOfferSource.SOURCE_URL);
        assert.match(oOptions.headers["user-agent"], /personal offer research/);
        return createResponse("official ALDI offer page");
      },
      validate: fValidate
    });
    const oSecond = await AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: async function () {
        nFetchCount += 1;
        return createResponse("unexpected second request");
      },
      validate: fValidate
    });

    assert.equal(oFirst.reused, false);
    assert.equal(oSecond.reused, true);
    assert.equal(oSecond.html, "official ALDI offer page");
    assert.equal(oSecond.metadata.fetchedAt, FIXED_NOW.toISOString());
    assert.equal(oSecond.metadata.validation, "passed");
    assert.match(oSecond.metadata.sha256, /^[a-f0-9]{64}$/);
    assert.equal(nFetchCount, 1);
  });
});

test("retries a temporary source failure a bounded number of times", async function () {
  let nAttempts = 0;
  const aDelays = [];
  const sHtml = await AldiNordOfferSource.fetchHtml({
    maxRetries: 2,
    fetchImpl: async function () {
      nAttempts += 1;

      if (nAttempts < 3) {
        return createResponse("", 503);
      }

      return createResponse("eventual offer page");
    },
    sleep: async function (nMilliseconds) {
      aDelays.push(nMilliseconds);
    }
  });

  assert.equal(sHtml, "eventual offer page");
  assert.equal(nAttempts, 3);
  assert.deepEqual(aDelays, [500, 1000]);
});

test("stops after the configured retry limit and does not retry permanent HTTP errors", async function () {
  let nAttempts = 0;

  await assert.rejects(AldiNordOfferSource.fetchHtml({
    maxRetries: 1,
    fetchImpl: async function () {
      nAttempts += 1;
      throw new Error("network unavailable");
    },
    sleep: async function () {}
  }), /after 2 attempt\(s\): network unavailable/);
  assert.equal(nAttempts, 2);

  nAttempts = 0;
  await assert.rejects(AldiNordOfferSource.fetchHtml({
    maxRetries: 3,
    fetchImpl: async function () {
      nAttempts += 1;
      return createResponse("denied", 403);
    },
    sleep: async function () {}
  }), /HTTP 403/);
  assert.equal(nAttempts, 1);
});

test("aborts timed-out requests and still respects the retry ceiling", async function () {
  let nAttempts = 0;

  await assert.rejects(AldiNordOfferSource.fetchHtml({
    timeoutMs: 5,
    maxRetries: 1,
    fetchImpl: function (sUrl, oOptions) {
      nAttempts += 1;

      return new Promise(function (resolve, reject) {
        oOptions.signal.addEventListener("abort", function () {
          const oError = new Error("request aborted");
          oError.name = "AbortError";
          reject(oError);
        }, { once: true });
      });
    },
    sleep: async function () {}
  }), /timed out after 2 attempt\(s\)/);
  assert.equal(nAttempts, 2);
});

test("fetches again rather than trusting stale or hash-mismatched cached evidence", async function () {
  await withTempDirectory(async function (sDirectory) {
    let nFetchCount = 0;
    const fFetch = async function () {
      nFetchCount += 1;
      return createResponse("validated page " + nFetchCount);
    };
    const fValidate = function (sHtml) {
      assert.match(sHtml, /^validated page/);
    };
    const oInitial = await AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: fFetch,
      validate: fValidate
    });
    const sMetadataPath = oInitial.htmlPath.replace(/\.html$/, ".meta.json");
    const oMetadata = JSON.parse(await fs.readFile(sMetadataPath, "utf8"));
    oMetadata.fetchedAt = "2026-11-01T00:00:00.000Z";
    await fs.writeFile(sMetadataPath, JSON.stringify(oMetadata));

    const oFresh = await AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: fFetch,
      validate: fValidate
    });

    assert.equal(oFresh.reused, false);
    assert.equal(nFetchCount, 2);
    assert.equal(oFresh.html, "validated page 2");

    await fs.writeFile(oFresh.htmlPath, "tampered cached content");
    const oRepaired = await AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: fFetch,
      validate: fValidate
    });

    assert.equal(oRepaired.reused, false);
    assert.equal(nFetchCount, 3);
    assert.equal(oRepaired.html, "validated page 3");
  });
});

test("preserves a changed response but will not reuse it as valid data", async function () {
  await withTempDirectory(async function (sDirectory) {
    let nAttempts = 0;

    await assert.rejects(AldiNordOfferSource.getSnapshot({
      directory: sDirectory,
      now: function () {
        return FIXED_NOW;
      },
      fetchImpl: async function () {
        nAttempts += 1;
        return createResponse("changed page shape");
      },
      validate: function () {
        throw new Error("OFFER_GET response is missing");
      }
    }), /raw response preserved at/);

    const aFiles = await fs.readdir(sDirectory);

    assert.equal(aFiles.filter(function (sName) {
      return sName.endsWith(".html");
    }).length, 1);
    assert.equal(aFiles.filter(function (sName) {
      return sName.endsWith(".meta.json");
    }).length, 1);
    assert.equal(nAttempts, 1);
  });
});
