"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const LidlOfferPipeline = require("../scripts/lib/LidlOfferPipeline");
const oFlyerFixture = require("./fixtures/lidl-flyer-sample.json");

const NOW = new Date("2026-07-23T12:00:00.000Z");
const DISCOVERY_URL = "https://example.test/lidl-prospekte";
const FLYER_API_URL = "https://example.test/v4/flyer";
const FLYER_IDENTIFIER = "aktionsprospekt-20-07-2026-25-07-2026-test";
const PDF_URL = "https://example.test/flyer.pdf";

async function createTestRoot(oTestContext) {
  const sRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shoppingtool-lidl-pipeline-"));

  oTestContext.after(function () {
    return fs.rm(sRoot, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(sRoot, "data"), { recursive: true });
  await fs.copyFile(
    path.join(__dirname, "..", "data", "stores.json"),
    path.join(sRoot, "data", "stores.json")
  );

  return sRoot;
}

test("orchestrates discovery through promotion and quality reporting", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);
  const aRequests = [];
  const oResult = await LidlOfferPipeline.run(createOptions(sRoot), {
    now: fixedNow,
    sleep: noSleep,
    fetch: createSuccessfulFetch(aRequests),
    extractPdf: copyExtractionFixture
  });
  const oReport = oResult.qualityReport;
  const oCandidates = await readJson(oResult.paths.candidates);
  const oReview = await readJson(oResult.paths.review);
  const oOptimizer = await readJson(oResult.paths.optimizer);

  assert.equal(aRequests.length, 3);
  assert.match(aRequests[1], /flyer_identifier=aktionsprospekt-20-07-2026-25-07-2026-test/);
  assert.equal(oReport.status, "completed");
  assert.equal(oReport.pagesProcessed, 1);
  assert.equal(oReport.candidateCount, 1);
  assert.deepEqual(oReport.matchOutcomes, { "offer-alias-exact": 1 });
  assert.equal(oReport.matchedCount, 1);
  assert.equal(oReport.promotionCount, 1);
  assert.equal(oReport.reviewCount, 0);
  assert.deepEqual(oReport.reviewReasons, {});
  assert.deepEqual(oReport.artifactReuse, {
    discovery: false,
    flyerSource: false,
    pdf: false,
    extraction: false
  });
  assert.equal(oReport.source.flyerId, "lidl-flyer-test-id");
  assert.equal(oReport.source.flyerRetrievedAt, NOW.toISOString());
  assert.match(oReport.source.discoverySourceFile, /discovery-[a-f0-9]{16}\.response\.html$/);
  assert.match(oReport.source.discoverySha256, /^[a-f0-9]{64}$/);
  assert.match(oReport.source.flyerSourceFile, /source-[a-f0-9]{16}\.json$/);
  assert.match(oReport.source.pdfFile, /flyer-[a-f0-9]{16}\.pdf$/);
  assert.equal(oCandidates.candidates[0].productKey, null);
  assert.equal(oCandidates.provenance.flyerIdentifier, FLYER_IDENTIFIER);
  assert.equal(oReview.provenance.pdfUrl, PDF_URL);
  assert.equal(oOptimizer.offerCount, 1);
  assert.equal(oOptimizer.offers[0].productKey, "tomaten");
  assert.equal((await readJson(oResult.paths.qualityReport)).candidateCount, 1);
});

test("safely reuses source, PDF and extraction artifacts on a repeated run", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);

  await LidlOfferPipeline.run(createOptions(sRoot), {
    now: fixedNow,
    sleep: noSleep,
    fetch: createSuccessfulFetch([]),
    extractPdf: copyExtractionFixture
  });

  let iUnexpectedFetches = 0;
  let iUnexpectedExtractions = 0;
  const oSecondResult = await LidlOfferPipeline.run(createOptions(sRoot), {
    now: fixedNow,
    sleep: noSleep,
    fetch: async function () {
      iUnexpectedFetches += 1;
      throw new Error("network should not be used while safe cache is fresh");
    },
    extractPdf: async function () {
      iUnexpectedExtractions += 1;
    }
  });

  assert.equal(iUnexpectedFetches, 0);
  assert.equal(iUnexpectedExtractions, 0);
  assert.deepEqual(oSecondResult.qualityReport.artifactReuse, {
    discovery: true,
    flyerSource: true,
    pdf: true,
    extraction: true
  });
  assert.equal((await readJson(oSecondResult.paths.optimizer)).offerCount, 1);
});

test("preserves content-addressed discovery responses across refreshed runs", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);
  const oFirstResult = await LidlOfferPipeline.run(createOptions(sRoot), {
    now: fixedNow,
    sleep: noSleep,
    fetch: createSuccessfulFetch([]),
    extractPdf: copyExtractionFixture
  });
  const sFirstRelativePath = oFirstResult.qualityReport.source.discoverySourceFile;
  const sFirstPath = path.join(sRoot, sFirstRelativePath);
  const sFirstBody = await fs.readFile(sFirstPath, "utf8");
  const sChangedDiscovery = createDiscoveryHtml().replace("</head>", " </head>");
  const fnSuccessfulFetch = createSuccessfulFetch([]);
  const oSecondResult = await LidlOfferPipeline.run(Object.assign(createOptions(sRoot), {
    force: true
  }), {
    now: fixedNow,
    sleep: noSleep,
    fetch: async function (sUrl) {
      return sUrl === DISCOVERY_URL
        ? response(sChangedDiscovery, 200, "text/html")
        : fnSuccessfulFetch(sUrl);
    },
    extractPdf: copyExtractionFixture
  });
  const sSecondRelativePath = oSecondResult.qualityReport.source.discoverySourceFile;

  assert.notEqual(sSecondRelativePath, sFirstRelativePath);
  assert.equal(await fs.readFile(sFirstPath, "utf8"), sFirstBody);
  assert.equal(await fs.readFile(path.join(sRoot, sSecondRelativePath), "utf8"), sChangedDiscovery);
});

test("rejects discovery pages that contain only expired flyers", function () {
  assert.throws(function () {
    LidlOfferPipeline.selectFlyerSource(createDiscoveryHtml(), "text/html", "2026-07-26");
  }, function (oError) {
    assert.equal(oError.code, "no-current-flyer");
    assert.match(oError.message, /no active or upcoming dated Aktionsprospekt/);
    assert.match(oError.message, /2026-07-26/);
    return true;
  });
});

test("rejects expired flyer documents from every discovery path", async function (oTestContext) {
  const aCases = ["direct JSON", "selected endpoint"];

  for (const sCase of aCases) {
    const sRoot = await createTestRoot(oTestContext);
    const oExpiredSource = createFlyerSource();
    const aRequests = [];

    oExpiredSource.flyer.offerEndDate = "2026-07-22";
    oExpiredSource.flyer.endDate = "2026-07-22";

    await assert.rejects(function () {
      return LidlOfferPipeline.run(createOptions(sRoot), {
        now: fixedNow,
        sleep: noSleep,
        fetch: async function (sUrl) {
          aRequests.push(sUrl);

          if (sUrl === DISCOVERY_URL) {
            return response(
              sCase === "direct JSON" ? JSON.stringify(oExpiredSource) : createDiscoveryHtml(),
              200,
              sCase === "direct JSON" ? "application/json" : "text/html"
            );
          }

          return response(JSON.stringify(oExpiredSource), 200, "application/json");
        }
      });
    }, function (oError) {
      assert.equal(oError.code, "no-current-flyer", sCase);
      assert.match(oError.message, /expired on 2026-07-22 before reference date 2026-07-23/);
      assert.match(oError.message, /inspect preserved source at/);
      return true;
    });
    assert.equal(aRequests.length, sCase === "direct JSON" ? 1 : 2, sCase);
  }
});

test("rejects a flyer source whose dates differ from the selected event", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);
  const oMismatchedSource = createFlyerSource();
  const aRequests = [];

  oMismatchedSource.flyer.offerStartDate = "2026-07-27";
  oMismatchedSource.flyer.offerEndDate = "2026-08-01";
  oMismatchedSource.flyer.startDate = "2026-07-27";
  oMismatchedSource.flyer.endDate = "2026-08-01";

  await assert.rejects(function () {
    return LidlOfferPipeline.run(createOptions(sRoot), {
      now: fixedNow,
      sleep: noSleep,
      fetch: async function (sUrl) {
        aRequests.push(sUrl);

        if (sUrl === DISCOVERY_URL) {
          return response(createDiscoveryHtml(), 200, "text/html");
        }

        return response(JSON.stringify(oMismatchedSource), 200, "application/json");
      }
    });
  }, function (oError) {
    assert.equal(oError.code, "selected-flyer-date-mismatch");
    assert.match(oError.message, /selected active Aktionsprospekt/);
    assert.match(oError.message, /valid from 2026-07-20 to 2026-07-25/);
    assert.match(oError.message, /source flyer lidl-flyer-test-id is valid from 2026-07-27 to 2026-08-01/);
    assert.match(oError.message, /inspect preserved source at/);
    return true;
  });
  assert.equal(aRequests.length, 2);
});

test("bounds retries and reports the final network cause", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);
  let iAttempts = 0;

  await assert.rejects(function () {
    return LidlOfferPipeline.run(Object.assign(createOptions(sRoot), {
      maxAttempts: 3,
      retryDelayMs: 0
    }), {
      now: fixedNow,
      sleep: noSleep,
      fetch: async function () {
        iAttempts += 1;
        return response("temporarily unavailable", 503, "text/plain", "Service Unavailable");
      }
    });
  }, function (oError) {
    assert.equal(oError.code, "discovery-request-failed");
    assert.match(oError.message, /after 3 attempts/);
    assert.match(oError.message, /HTTP 503 Service Unavailable/);
    return true;
  });
  assert.equal(iAttempts, 3);
});

test("applies the timeout and retry bound while reading a response body", async function (oTestContext) {
  const sRoot = await createTestRoot(oTestContext);
  let iAttempts = 0;

  await assert.rejects(function () {
    return LidlOfferPipeline.run(Object.assign(createOptions(sRoot), {
      timeoutMs: 5,
      maxAttempts: 2,
      retryDelayMs: 0
    }), {
      now: fixedNow,
      sleep: noSleep,
      fetch: async function (sUrl, oOptions) {
        iAttempts += 1;

        return {
          ok: true,
          status: 200,
          url: sUrl,
          headers: { get: function () { return "text/html"; } },
          text: function () {
            return new Promise(function (fnResolve) {
              oOptions.signal.addEventListener("abort", function () {
                const oError = new Error("aborted");

                oError.name = "AbortError";
                fnResolve(Promise.reject(oError));
              }, { once: true });
            });
          }
        };
      }
    });
  }, function (oError) {
    assert.equal(oError.code, "discovery-request-failed");
    assert.match(oError.message, /timed out after 5 ms/);
    return true;
  });
  assert.equal(iAttempts, 2);
});

test("makes a missing PDF URL and changed flyer source shape actionable", async function (oTestContext) {
  const aCases = [
    {
      name: "missing PDF",
      change: function (oSource) {
        delete oSource.flyer.pdfUrl;
      },
      code: "missing-pdf-url",
      message: /no usable pdfUrl/
    },
    {
      name: "changed pages shape",
      change: function (oSource) {
        oSource.flyer.pages = {};
      },
      code: "changed-source-shape",
      message: /flyer\.pages must be a non-empty array/
    }
  ];

  for (const oCase of aCases) {
    const sRoot = await createTestRoot(oTestContext);
    const oSource = createFlyerSource();

    oCase.change(oSource);

    await assert.rejects(function () {
      return LidlOfferPipeline.run(createOptions(sRoot), {
        now: fixedNow,
        sleep: noSleep,
        fetch: createSourceFetch(oSource)
      });
    }, function (oError) {
      assert.equal(oError.code, oCase.code, oCase.name);
      assert.match(oError.message, oCase.message);
      assert.match(oError.message, /raw response preserved at/);
      return true;
    });
  }
});

test("rejects changed PDF content and explains extraction failures", async function (oTestContext) {
  const sInvalidPdfRoot = await createTestRoot(oTestContext);

  await assert.rejects(function () {
    return LidlOfferPipeline.run(createOptions(sInvalidPdfRoot), {
      now: fixedNow,
      sleep: noSleep,
      fetch: createSuccessfulFetch([], "<html>not a PDF</html>")
    });
  }, function (oError) {
    assert.equal(oError.code, "invalid-pdf");
    assert.match(oError.message, /is not a PDF/);
    assert.match(oError.message, /raw response preserved at/);
    return true;
  });

  const sExtractionRoot = await createTestRoot(oTestContext);

  await assert.rejects(function () {
    return LidlOfferPipeline.run(createOptions(sExtractionRoot), {
      now: fixedNow,
      sleep: noSleep,
      fetch: createSuccessfulFetch([]),
      extractPdf: async function () {
        throw new Error("synthetic pdftotext failure");
      }
    });
  }, function (oError) {
    assert.equal(oError.code, "extraction-failed");
    assert.match(oError.message, /poppler-utils/);
    assert.match(oError.message, /synthetic pdftotext failure/);
    return true;
  });
});

test("aggregates quality warnings, match outcomes and review reasons", function () {
  const oReport = LidlOfferPipeline.createQualityReport({
    generatedAt: NOW.toISOString(),
    rootDir: "/tmp/project",
    discovery: {
      retrievedAt: NOW.toISOString(),
      sourceFile: "/tmp/project/data/raw/discovery.html",
      sha256: "def",
      reused: true
    },
    selection: {
      flyerIdentifier: "flyer-1",
      selection: "active"
    },
    source: {
      sourceUrl: "https://example.test/source",
      sourceFile: "/tmp/project/data/raw/source.json",
      retrievedAt: NOW.toISOString(),
      reused: true,
      document: { warnings: ["upstream warning"] }
    },
    flyer: {
      flyerId: "flyer-1",
      validFrom: "2026-07-20",
      validTo: "2026-07-25",
      pages: [{}, {}],
      provenance: {
        discoveryUrl: DISCOVERY_URL,
        discoverySourceFile: "data/raw/discovery.html"
      }
    },
    pdf: {
      url: PDF_URL,
      path: "/tmp/project/data/raw/flyer.pdf",
      retrievedAt: NOW.toISOString(),
      sha256: "abc",
      reused: true
    },
    extraction: { reused: true },
    pages: [{}],
    candidateDocument: { candidateCount: 2 },
    promotionDocuments: {
      review: {
        referenceDate: "2026-07-23",
        summary: {
          reviewCount: 2,
          matchTypeCounts: { excluded: 1, none: 1 },
          reasonCounts: { "excluded-product": 1, "unmatched-product": 1 }
        },
        entries: [
          { match: { productKey: null } },
          { match: { productKey: null } }
        ]
      },
      optimizer: { offerCount: 0 }
    },
    outputPaths: {
      normalizedFlyer: "/tmp/project/data/normalized/flyer.json",
      candidates: "/tmp/project/data/normalized/candidates.json",
      review: "/tmp/project/data/normalized/review.json",
      optimizer: "/tmp/project/data/normalized/optimizer.json",
      qualityReport: "/tmp/project/data/normalized/quality.json"
    }
  });

  assert.deepEqual(oReport.matchOutcomes, { excluded: 1, none: 1 });
  assert.deepEqual(oReport.reviewReasons, {
    "excluded-product": 1,
    "unmatched-product": 1
  });
  assert.equal(oReport.matchedCount, 0);
  assert.equal(oReport.source.discoverySha256, "def");
  assert.equal(oReport.warnings.length, 3);
  assert.match(oReport.warnings[1], /Source lists 2 pages/);
  assert.match(oReport.warnings[2], /No candidates were promoted/);
});

function createOptions(sRoot) {
  return {
    rootDir: sRoot,
    discoveryUrl: DISCOVERY_URL,
    flyerApiUrl: FLYER_API_URL,
    referenceDate: "2026-07-23",
    timeoutMs: 100,
    retryDelayMs: 0
  };
}

function createSuccessfulFetch(aRequests, vPdfBody) {
  const oSource = createFlyerSource();

  return async function (sUrl) {
    aRequests.push(sUrl);

    if (sUrl === DISCOVERY_URL) {
      return response(createDiscoveryHtml(), 200, "text/html");
    }

    if (sUrl.startsWith(FLYER_API_URL)) {
      return response(JSON.stringify(oSource), 200, "application/json");
    }

    if (sUrl === PDF_URL) {
      return response(vPdfBody || "%PDF-1.7 synthetic fixture", 200, "application/pdf");
    }

    return response("not found", 404, "text/plain", "Not Found");
  };
}

function createSourceFetch(oSource) {
  return async function (sUrl) {
    if (sUrl === DISCOVERY_URL) {
      return response(createDiscoveryHtml(), 200, "text/html");
    }

    return response(JSON.stringify(oSource), 200, "application/json");
  };
}

function createFlyerSource() {
  const oSource = JSON.parse(JSON.stringify(oFlyerFixture));

  oSource.flyer.pdfUrl = PDF_URL;
  return oSource;
}

function createDiscoveryHtml() {
  return "<!doctype html><html><head><script type=\"application/ld+json\">" + JSON.stringify({
    "@type": "OfferCatalog",
    itemListElement: [{
      "@type": "SaleEvent",
      name: "Aktionsprospekt (20.07.2026 – 25.07.2026)",
      url: "https://www.lidl.de/l/prospekte/" + FLYER_IDENTIFIER + "/ar/0",
      startDate: "2026-07-20T00:00:00+00:00",
      endDate: "2026-07-25T23:59:59+00:00"
    }]
  }) + "</script></head></html>";
}

async function copyExtractionFixture(oInput) {
  await fs.writeFile(oInput.textPath, "Romatomaten Je 500 g 0.88\n", "utf8");
  await fs.copyFile(
    path.join(__dirname, "fixtures", "lidl-page-bbox-sample.html"),
    oInput.bboxPath
  );
}

function response(sBody, iStatus, sContentType, sStatusText) {
  return new global.Response(sBody, {
    status: iStatus,
    statusText: sStatusText,
    headers: {
      "content-type": sContentType
    }
  });
}

async function readJson(sFilePath) {
  return JSON.parse(await fs.readFile(sFilePath, "utf8"));
}

function fixedNow() {
  return new Date(NOW);
}

async function noSleep() {}
