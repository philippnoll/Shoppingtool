"use strict";

const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const KkCatalogSource = require("../scripts/lib/KkCatalogSource");

const VIEWER_URL = KkCatalogSource.DEFAULT_VIEWER_URL;

test("reads the catalog ID from the official viewer configuration", function () {
  assert.equal(
    KkCatalogSource.parseViewerCatalogId('<script>var cfg = { catalog: "kundk_kw45::catalog" };</script>'),
    "kundk_kw45::catalog"
  );
  assert.throws(function () {
    KkCatalogSource.parseViewerCatalogId("<html>no catalog config</html>");
  }, /Could not identify one safe catalog ID/);
});

test("downloads each public text page once and reuses cached bodies after 304", async function (t) {
  const sRawRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-kk-source-"));

  t.after(async function () {
    await fs.rm(sRawRoot, { recursive: true, force: true });
  });

  const mBodies = new Map([
    [VIEWER_URL, '<html><script>catalog: "kundk_kw45::catalog"</script></html>'],
    [VIEWER_URL + "catalogs/kundk_kw45/xml/catalog.xml", '<catalog name="kundk_kw45" nofpages="2"></catalog>'],
    [VIEWER_URL + "catalogs/kundk_kw45/text/bk_1.txt", "page one"],
    [VIEWER_URL + "catalogs/kundk_kw45/text/bk_2.txt", "page two"]
  ]);
  const aFirstRequests = [];
  const oFirstSource = await KkCatalogSource.discover({
    rawRoot: sRawRoot,
    fetchImpl: createFetch(mBodies, aFirstRequests, false),
    pageIntervalMs: 0
  });

  assert.equal(oFirstSource.catalogId, "kundk_kw45");
  assert.equal(oFirstSource.pageCount, 2);
  assert.deepEqual(oFirstSource.pages.map(function (oPage) {
    return oPage.text;
  }), ["page one", "page two"]);
  assert.equal(aFirstRequests.length, 4);
  const sSecondPagePath = path.join(sRawRoot, "kundk_kw45", oFirstSource.manifest.resources.find(function (oResource) {
    return oResource.requestedUrl.endsWith("bk_2.txt");
  }).localPath);
  assert.equal(await fs.readFile(sSecondPagePath, "utf8"), "page two");

  const aSecondRequests = [];
  const oSecondSource = await KkCatalogSource.discover({
    rawRoot: sRawRoot,
    fetchImpl: createFetch(mBodies, aSecondRequests, true),
    pageIntervalMs: 0
  });

  assert.equal(oSecondSource.pages[1].text, "page two");
  assert.equal(oSecondSource.manifest.resources.filter(function (oResource) {
    return oResource.reusedFromCache;
  }).length, 3);
  assert.ok(aSecondRequests.slice(1).every(function (oRequest) {
    return Boolean(oRequest.headers["if-none-match"]);
  }));
});

test("retries one transient 503 but stops immediately on HTTP 429", async function (t) {
  const sRawRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-kk-retry-"));

  t.after(async function () {
    await fs.rm(sRawRoot, { recursive: true, force: true });
  });

  const mBodies = new Map([
    [VIEWER_URL, '<html><script>catalog: "kundk_kw45::catalog"</script></html>'],
    [VIEWER_URL + "catalogs/kundk_kw45/xml/catalog.xml", '<catalog name="kundk_kw45" nofpages="1"></catalog>'],
    [VIEWER_URL + "catalogs/kundk_kw45/text/bk_1.txt", "page one"]
  ]);
  let iViewerAttempts = 0;
  const fnFetch = createFetch(mBodies, [], false);
  const oSource = await KkCatalogSource.discover({
    rawRoot: sRawRoot,
    pageIntervalMs: 0,
    fetchImpl: async function (sUrl, oOptions) {
      if (sUrl === VIEWER_URL && iViewerAttempts++ === 0) {
        return createResponse(sUrl, 503, "temporarily unavailable", {
          "retry-after": "0"
        });
      }

      return fnFetch(sUrl, oOptions);
    }
  });

  assert.equal(oSource.pageCount, 1);
  assert.equal(iViewerAttempts, 2);

  let iRateLimitAttempts = 0;

  await assert.rejects(KkCatalogSource.discover({
    rawRoot: path.join(sRawRoot, "rate-limited"),
    fetchImpl: async function (sUrl) {
      iRateLimitAttempts += 1;
      return createResponse(sUrl, 429, "rate limited", {
        "content-type": "text/html",
        "retry-after": "60"
      });
    }
  }), /HTTP 429/);
  assert.equal(iRateLimitAttempts, 1);
});

test("preserves the last completed snapshot when a later page fetch fails", async function (t) {
  const sRawRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-kk-partial-"));

  t.after(async function () {
    await fs.rm(sRawRoot, { recursive: true, force: true });
  });

  const mBodies = new Map([
    [VIEWER_URL, '<html><script>catalog: "kundk_kw45::catalog"</script></html>'],
    [VIEWER_URL + "catalogs/kundk_kw45/xml/catalog.xml", '<catalog name="kundk_kw45" nofpages="2"></catalog>'],
    [VIEWER_URL + "catalogs/kundk_kw45/text/bk_1.txt", "original page one"],
    [VIEWER_URL + "catalogs/kundk_kw45/text/bk_2.txt", "original page two"]
  ]);
  const oFirst = await KkCatalogSource.discover({
    rawRoot: sRawRoot,
    fetchImpl: createFetch(mBodies, [], false),
    pageIntervalMs: 0
  });
  const sManifestBefore = await fs.readFile(path.join(sRawRoot, "kundk_kw45", "manifest.json"), "utf8");
  const sFirstPagePath = path.join(sRawRoot, "kundk_kw45", oFirst.manifest.resources.find(function (oRecord) {
    return oRecord.requestedUrl.endsWith("bk_1.txt");
  }).localPath);

  mBodies.set(VIEWER_URL + "catalogs/kundk_kw45/text/bk_1.txt", "changed page one");
  await assert.rejects(KkCatalogSource.discover({
    rawRoot: sRawRoot,
    fetchImpl: async function (sUrl, oOptions) {
      if (sUrl.endsWith("bk_2.txt")) {
        return createResponse(sUrl, 503, "page unavailable", { "content-type": "text/plain" });
      }

      return createFetch(mBodies, [], false)(sUrl, oOptions);
    },
    pageIntervalMs: 0
  }), /HTTP 503/);

  assert.equal(await fs.readFile(path.join(sRawRoot, "kundk_kw45", "manifest.json"), "utf8"), sManifestBefore);
  assert.equal(await fs.readFile(sFirstPagePath, "utf8"), "original page one");
  assert.equal(await fs.readFile(oFirst.manifestPath, "utf8"), sManifestBefore);
});

function createFetch(mBodies, aRequests, bReturnNotModified) {
  return async function (sUrl, oOptions) {
    const mHeaders = oOptions.headers;
    aRequests.push({ url: sUrl, headers: mHeaders });

    if (bReturnNotModified && mHeaders["if-none-match"]) {
      return createResponse(sUrl, 304, "", {
        etag: mHeaders["if-none-match"]
      });
    }

    const sBody = mBodies.get(sUrl);

    if (sBody === undefined) {
      return createResponse(sUrl, 404, "not found", {
        "content-type": "text/html"
      });
    }

    let sContentType = "text/plain";

    if (sUrl === VIEWER_URL) {
      sContentType = "text/html";
    } else if (sUrl.endsWith("/catalog.xml")) {
      sContentType = "application/xml";
    }

    return createResponse(sUrl, 200, sBody, {
      "content-type": sContentType,
      etag: '"' + Buffer.from(sBody).length + '"'
    });
  };
}

function createResponse(sUrl, iStatus, sBody, mHeaders) {
  return {
    status: iStatus,
    url: sUrl,
    headers: {
      get: function (sHeaderName) {
        return mHeaders[sHeaderName.toLowerCase()] || null;
      }
    },
    arrayBuffer: async function () {
      return Buffer.from(sBody);
    }
  };
}
