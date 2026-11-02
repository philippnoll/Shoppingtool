# Datenbeschaffung: Erste Einschaetzung

Stand: 2026-07-06

## Ziel

Wir brauchen mittelfristig Angebots- und Preisdaten fuer die Optimierung:

```text
Einkaufsliste
  -> Produkt erkennen
  -> aktuelle Angebote laden
  -> Preise vergleichen
  -> sinnvolle Ladenempfehlung bauen
```

Der wichtigste Punkt: Die Daten aus Bons, Prospekten, Apps und Webseiten werden sehr wahrscheinlich unterschiedlich aussehen. Deshalb sollten wir frueh eine eigene Normalisierungsschicht bauen.

## Datenquellen

### 1. Offene Produktdaten

Open Food Facts ist sinnvoll fuer Produkt-Stammdaten:

- Produktnamen
- Marken
- Mengen / Packungsgroessen
- Barcodes
- Kategorien

Quelle:

- https://openfoodfacts.github.io/openfoodfacts-server/api/

Einschraenkung: Das ist keine vollstaendige Angebotsdatenquelle fuer lokale Supermaerkte. Es hilft eher beim Erkennen und Normalisieren von Produkten.

### 2. Offene / Crowdsourcing-Preise

Open Prices ist ein Projekt aus dem Open-Food-Facts-Umfeld fuer beobachtete Preise.

Quelle:

- https://prices.openfoodfacts.org/
- https://prices.openfoodfacts.org/api/docs

Einschraenkung: Das ist nicht automatisch identisch mit aktuellen lokalen Lidl-/Aldi-/Rewe-Angeboten. Es kann aber fuer Preisverlaeufe und Vergleichswerte spannend werden.

### 3. Digitale Prospekte / Angebotsportale

Angebote liegen oft als digitale Prospekte vor. Solche Prospekte werden direkt bei Haendlern oder ueber Portale wie kaufDA, Marktguru, Marktjagd oder MeinProspekt veroeffentlicht.

Quellen:

- https://de.wikipedia.org/wiki/E-Prospekt
- https://de.wikipedia.org/wiki/Kaufda

Einschaetzung: Das ist wahrscheinlich gut fuer menschliches Lesen, aber nicht automatisch gut fuer strukturierte Daten. Wenn Daten nur als PDF/Bild/Prospektseite vorliegen, brauchen wir OCR oder einen speziellen Parser.

### 4. Retailer-Webseiten und Apps

Lidl, Aldi, Rewe, Edeka usw. haben eigene digitale Angebote, Apps und Prospekte. Es kann sein, dass deren Webseiten intern JSON-Endpunkte verwenden. Das waere technisch interessant, aber nicht garantiert stabil und rechtlich/vertraglich zu pruefen.

Einschaetzung:

- Technisch wahrscheinlich moeglich.
- Pflegeaufwand wahrscheinlich hoch.
- Pro Haendler brauchen wir vermutlich einen eigenen Adapter.
- Keine Annahme treffen, dass Lidl-Daten wie Rewe-Daten aussehen.

### 5. Eigene Bons

Die Lidl-App-Bons des Users sind sehr wertvoll:

- echte gekaufte Produkte
- echte Mengen
- echte Preise
- echte Einkaufsfrequenz
- Pfand, Rabatte und Preisvorteile als reale Problemfaelle

Einschraenkung: Bons zeigen vergangene Einkaeufe, nicht zukuenftige Angebote. Aber sie sind sehr gut, um unser Produktmodell und die Normalisierung zu trainieren.

## Einstieg In Die Lidl-Datenkette

Der Discovery-Spike ist inzwischen Teil der
[wiederholbaren End-to-End-Pipeline](#wiederholbare-end-to-end-pipeline).
Die Anbindung ihrer Ergebnisse an den `ShoppingOptimizer` ist der naechste
Schritt in [Phase 4 der Roadmap](../ROADMAP.md#phase-4-echte-angebote-in-die-ui5-app-einbinden).

## Erste Lokale Markt-Kohorte

Die erste Kohorte ist nicht "Supermaerkte allgemein", sondern die wirklich relevanten Maerkte im Stadtteil Epe:

- Lidl
- ALDI Nord
- K+K
- PENNY

Diese Maerkte sind in `data/stores.json` als Arbeitsstand erfasst. Die genauen Adressen koennen spaeter korrigiert werden.

Wichtig fuer die Architektur: Wir werden sehr wahrscheinlich pro Kette einen eigenen Adapter brauchen.

```text
LidlAdapter
AldiNordAdapter
KkAdapter
PennyAdapter
```

Alle Adapter sollen spaeter trotzdem dasselbe interne Angebotsformat liefern.

## Lidl Discovery: Erster Befund

Lidl ist ein guter erster Kandidat, weil die Prospektseite maschinenlesbare Hinweise auf aktuelle Prospekte enthaelt.

Aktueller technischer Pfad:

```text
https://www.lidl.de/c/online-prospekte/s10005610
        |
        v
JSON-LD OfferCatalog mit Prospekt-URLs
        |
        v
Lidl Leaflet App auf lidl.leaflets.schwarz
        |
        v
https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=...&region_id=0
```

Der interne Flyer-Endpunkt liefert JSON. Ein Testabruf fuer den Aktionsprospekt `06.07.2026 - 11.07.2026` ergab:

- 62 Prospektseiten
- 136 strukturierte Produktobjekte
- 202 Links auf Prospektseiten
- 50 Rezeptlinks
- PDF-URL fuer den Prospekt

Wichtig: Die strukturierten Produktobjekte sind nicht automatisch eine perfekte Lebensmittelliste. Viele klassische Lebensmittelangebote stehen eher in `pages[].keyWords` und `pages[].altText`, zum Beispiel Tomaten, Kartoffeln, Butter oder Maggi Fix.

Die daraus entstandene Lidl-spezifische Verarbeitung ist in der
[End-to-End-Pipeline](#wiederholbare-end-to-end-pipeline) umgesetzt.

## Zieldatenformat Fuer Angebote

Das normalisierte Format sollte nah an unserem aktuellen `MockOffers.js` bleiben:

```js
{
  source: "lidl-web",
  storeId: "lidl-gronauerstrasse-48599",
  storeName: "Lidl Gronauerstrasse",
  chain: "Lidl",
  productKey: "butter",
  offerName: "Milbona Deutsche Markenbutter",
  packageQuantity: 250,
  packageUnit: "g",
  price: 1.49,
  validFrom: "2026-07-06",
  validTo: "2026-07-12",
  fetchedAt: "2026-07-06T12:00:00.000Z"
}
```

Wichtig: `rawName` und `rawData` sollten wir spaeter zusaetzlich speichern, damit wir bei Parserfehlern nachvollziehen koennen, was die Quelle wirklich geliefert hat.

## Architekturidee

```text
source adapter
  -> raw source data
  -> normalizer
  -> normalized offers
  -> optimizer
```

Jeder Haendler bekommt spaeter seinen eigenen Adapter:

```text
LidlAdapter
AldiAdapter
ReweAdapter
ReceiptImporter
OpenFoodFactsAdapter
```

Aber alle Adapter liefern am Ende dasselbe interne Format.

## Lidl Normalizer: Erster Schritt

Stand: 2026-07-21

Der aktuelle Lidl-Aktionsprospekt `20.07.2026 - 25.07.2026` wurde erneut abgerufen. Der Flyer-Endpunkt lieferte:

- 69 Prospektseiten
- 142 strukturierte Produktobjekte
- Seitentexte in `pages[].keyWords`
- Seitenbeschreibungen in `pages[].altText`
- Bild- und Zoom-URLs pro Prospektseite

Die strukturierten Produktobjekte enthalten weiterhin ueberwiegend Non-Food-/Online-Produkte. Klassische Lebensmittel wie Romatomaten stehen im Seitentext, aber Preis und Packungsgroesse sind dort nicht verlaesslich als zusammengehoeriges Produktobjekt vorhanden.

Der erste `LidlNormalizer` erzeugt deshalb noch keine fertigen Angebote. Er uebersetzt zunaechst nur Flyer-Metadaten und Seiten in eine stabile Zwischenstruktur:

```text
Lidl JSON
  -> source, storeId, Zeitraum
  -> sourcePage, rawKeywords, rawDescription, imageUrl
```

Ausfuehren mit:

```bash
npm run normalize:lidl -- data/raw/offers/lidl/<timestamp>.json
```

Das Ergebnis wird unter `data/normalized/flyers/lidl/` erzeugt und nicht versioniert. Fuer automatisierte Tests liegt nur ein kleiner, versionierter Ausschnitt echter Lidl-Felder unter `test/fixtures/`.

Die Zuordnung von Produkt, Preis und Packungsgroesse uebernimmt inzwischen der
[Kandidatenparser](#lidl-angebotskandidaten); die
[Promotion](#promotion-und-review) prueft die Verwendbarkeit fuer den Optimizer.

## Lidl PDF Statt OCR

Der Flyer liefert zusaetzlich eine PDF mit eingebetteter Textebene. Ein Test mit `pdftotext -layout` auf Seite 3 konnte unter anderem diesen Zusammenhang erhalten:

```text
Romatomaten
Je 500 g
1 kg = 1.76
0.88
```

Damit ist fuer Lidl vorerst keine Bild-OCR notwendig. Der PDF-Verarbeitungspfad ist:

```text
Flyer JSON -> PDF-URL -> PDF -> Layout-Text -> Lidl-Angebotsparser
```

Der lokale Rechner beziehungsweise spaeter die NAS braucht dafuer `pdftotext` aus dem Paket `poppler-utils`. Eine bereits heruntergeladene PDF wird so extrahiert:

```bash
npm run extract:lidl-pdf -- /pfad/zum/lidl-prospekt.pdf
```

Der erzeugte Text liegt unter `data/raw/offers/lidl/pdf-text/` und bleibt als Rohdatum von Git ausgeschlossen. Der Angebotsparser nutzt fuer seine Tests kleine, gezielte Fixtures.

### Textpositionen Aus Der PDF

`pdftotext -bbox-layout` erzeugt neben dem Wortinhalt auch Koordinaten. Der erweiterte PDF-Extractor schreibt deshalb zwei Dateien:

```text
<prospekt>.txt        menschenlesbarer Layout-Text
<prospekt>.bbox.html  Woerter und ihre x/y-Koordinaten
```

`LidlPdfLayoutParser` uebersetzt das XHTML mit `fast-xml-parser` in einfache JavaScript-Seiten und Textbloecke. Ein Block besitzt danach nur noch die fuer uns relevanten Daten:

```js
{
  text: "Romatomaten",
  xMin: 209.9662,
  yMin: 87.561,
  xMax: 265.2662,
  yMax: 99.521
}
```

Der Angebotsparser muss dadurch kein XML kennen. Er konzentriert sich auf die fachliche Heuristik: Welche Mengen-, Preis- und Hinweisbloecke liegen nahe bei einem Produktnamen?

## Lidl Angebotskandidaten

`LidlOfferCandidateParser` erzeugt aus positionierten Textbloecken rohe Angebotskandidaten. Die aktuelle Heuristik unterstuetzt:

- feste Packungen wie `Je 500 g`
- Multipacks wie `10x 200 ml`
- Kiloware mit `kg-Preis`
- Beispielgewichte wie `Ca. 250 g`
- Angebotspreis und hoeheren Vergleichspreis
- Lidl-Plus-Preise als eigene Preisart
- Produktnamen, die durch PDF-Wortumbrueche getrennt wurden

Die Zuordnung basiert auf Spalten, Abstaenden und Lesereihenfolge. Unsichere Kiloware bekommt eine niedrigere `confidence` als ein vollstaendiger Block aus Produktname, Menge und Preis.

Seitenkoepfe im oberen Zehntel der PDF-Seite wie `Ab Do. 5.11. bis Sa. 7.11.`
schraenken die Kandidatengueltigkeit vor der Promotion ein. Das fehlende Jahr
wird aus dem Prospektzeitraum bestimmt, auch ueber den Jahreswechsel. Bei einem
reinen `Ab`-Datum bleibt das Prospektende erhalten; ohne erkannten Datumskopf
gilt weiterhin der Prospektzeitraum. Nicht aufloesbare Kopfdaten werden `null`
und damit vom Promoter ins Review gelegt. So bleiben etwa Romatomaten von
PDF-Seite 60 des Novemberprospekts am 02.11.2026 mit `not-yet-valid` im Review
und werden erst ab 05.11. freigegeben. Beide Parser-Einstiege (Einzelaufruf und
Pipeline) nutzen dieselbe Regel, auch bei wiederverwendeter PDF-Extraktion.

Getestet sind unter anderem zwei echte, unterschiedlich aufgebaute Seiten:

- Seite 3 mit Romatomaten, Multipack, Brot und Wassermelone
- Seite 53 mit mehreren nebeneinanderliegenden Kilopreisen, Lidl Plus und Rumpsteak-Beispielgewicht

Die komplette Pipeline ab positioniertem PDF-Text wird so ausgefuehrt:

```bash
npm run parse:lidl-offers -- \
  data/raw/offers/lidl/pdf-text/<prospekt>.bbox.html \
  data/normalized/flyers/lidl/<prospekt>.normalized.json
```

Sie erzeugt unter `data/normalized/offers/lidl/` drei von Git ausgeschlossene
Dateien:

- `<prospekt>.candidates.json` mit unveraenderten Rohkandidaten und
  `productKey: null`
- `<prospekt>.review.json` mit Match-Ergebnissen und Review-Gruenden
- `<prospekt>.optimizer-ready.json` nur mit automatisch freigegebenen
  Angeboten

Kandidaten ohne verlaessliches Produktmatching duerfen nicht an den
`ShoppingOptimizer` weitergereicht werden.

Messstand fuer den Aktionsprospekt `20.07.2026 - 25.07.2026`:

- 69 gelesene PDF-Seiten
- 200 Angebotskandidaten
- 17 erkannte Lidl-Plus-Preise
- 6 vorsichtiger bewertete Kilowaren-Treffer
- keine leeren Namen, ungueltigen Preise oder Mengen
- keine exakten Duplikate
- noch keine gesetzten `productKey`-Werte

## Konservatives Produktmatching

Stand: 2026-07-25

`ProductMatcher` ist bewusst vom Lidl-PDF-Parser getrennt. Der PDF-Parser
beschreibt nur, was raeumlich im Prospekt erkannt wurde. Der Matcher ordnet
danach einen Handelsnamen einem Eintrag aus dem gemeinsamen
`ProductCatalog.js` zu.

Die erste Version verwendet kein Fuzzy Matching fuer Angebotsnamen. Sie
arbeitet nachvollziehbar mit:

- kanonischen Produktnamen als eigenstaendigen Begriffen
- expliziten Angebotsaliasen wie `Romatomaten` oder `Markenbutter`
- Ausschluessen fuer irrefuehrende Namen wie `Tomatenketchup`, `Buttermilch`
  oder `Milchreis`
- einem Match-Typ und einer Konfidenz pro sicherem Treffer
- einem `ambiguous`-Ergebnis, sobald mehrere Produkte passen

Der kleine Katalog bleibt die einzige Stammdatenquelle. UI5 laedt ihn als
UI5-Modul, Node-Skripte laden dieselbe Datei ueber CommonJS.

Auswertung des vorhandenen 200-Kandidaten-Prospekts:

- 9 konservative Treffer
- 5 durch explizite Regeln ausgeschlossene Namen
- 186 nicht gematchte Namen
- keine mehrdeutigen Treffer

Zu den Treffern gehoeren Romatomaten, Vollkornbrot, Reis, Kaese, Butter, Milch
und Aepfel. Die niedrige Trefferquote ist in dieser Stufe beabsichtigt: Der
Produktkatalog enthaelt erst zehn generische Produkte, und ein falsches Angebot
waere fuer die Optimierung schaedlicher als ein vorerst fehlendes Angebot.

Der Matcher veraendert die rohen Kandidaten nicht. Diese Trennung bleibt auch
nach Einfuehrung der folgenden Promotion-Stufe bestehen.

## Promotion Und Review

Stand: 2026-07-26

`LidlOfferPromoter` ist die fachliche Schranke zwischen PDF-Kandidaten und dem
`ShoppingOptimizer`. Fuer jeden Kandidaten entsteht ein Review-Eintrag mit:

- dem unveraenderten Rohkandidaten
- `parser.confidence` aus dem PDF-Parser
- dem vollstaendigen Match-Ergebnis inklusive `match.confidence`
- einem Status `optimizer-ready` oder `review`
- maschinenlesbaren Gruenden fuer jede nicht automatische Promotion

Aktuelle Review-Gruende sind unter anderem:

```text
unmatched-product
excluded-product
ambiguous-product
low-parser-confidence
invalid-price
unknown-store
expired
not-yet-valid
lidl-plus-required
duplicate-candidate
```

Ein Kandidat wird nur promotet, wenn Quelle, Markt, Zeitraum, Seite, Menge,
Einheit, Preis, Position und Parser-Konfidenz valide sind. Die derzeitige
Mindestkonfidenz des Parsers ist `0.9`. Produktmatches muessen mindestens
`0.9` erreichen. Der Marktname wird ueber die `storeId` aus
`data/stores.json` ergaenzt.

Lidl-Plus-Preise erhalten im Review explizit diese Bedingung:

```js
{
  type: "loyalty-program",
  program: "Lidl Plus",
  required: true
}
```

Sie werden noch nicht in die optimizer-ready Datei uebernommen, weil der
bestehende Optimizer Preisbedingungen nicht auswertet. Damit kann ein
Kundenkartenpreis nicht versehentlich als allgemein verfuegbar erscheinen.

Bereits vorhandene Kandidatendateien lassen sich separat erneut pruefen:

```bash
npm run promote:lidl-offers -- \
  data/normalized/offers/lidl/<prospekt>.candidates.json
```

Standardmaessig wird das heutige UTC-Datum verwendet. Fuer reproduzierbare
historische Auswertungen akzeptieren sowohl `parse:lidl-offers` als auch
`promote:lidl-offers` optional:

```bash
--as-of YYYY-MM-DD
```

Der 200-Kandidaten-Prospekt ergab fuer den historischen Stichtag 23.07.2026:

- 8 optimizerfaehige Angebote
- 192 Review-Eintraege
- 186 ungematchte Namen
- 5 explizite Ausschluesse
- 17 Lidl-Plus-Bedingungen
- 6 zu niedrige Parser-Konfidenzen

Die Gruende koennen sich pro Kandidat ueberschneiden. Mit dem Referenzdatum
26.07.2026 werden korrekt alle 200 Kandidaten als abgelaufen und kein Angebot
als optimizerfaehig bewertet.

Visuell mit den Prospektbildern geprueft wurden Aepfel auf PDF-Seite 2,
Romatomaten und Vollkornbrot auf Seite 3, Express-Reis auf Seite 15, GAZI Kaese
auf Seite 16, Spitzenreis auf Seite 23, Butter auf Seite 65 und haltbare Milch
auf Seite 68. Produktname, Packungsmenge, Preis und Bedingung stimmen in diesen
Stichproben mit der Ausgabe ueberein.

Bekannte Grenze: Das Format ist technisch fuer den `ShoppingOptimizer`
verwendbar, aber einige Katalogprodukte haben noch die Standardmenge `Stk`,
waehrend reale Angebote in `g` vorliegen. Das betrifft derzeit beispielsweise
Butter, Brot und Kaese. Die Promotion darf die echte Angebotsmenge nicht in
`Stk` umdeuten. Vor der UI-Anbindung muss deshalb entschieden werden, wie
stueckbasierte Listeneingaben mit gewichtsbezogenen Packungen kompatibel
gemacht werden.

## Wiederholbare End-to-End-Pipeline

Stand: 2026-07-27

Phase 3 verbindet die vorhandenen, bewusst getrennten Stufen:

```text
Prospekt-Uebersicht
  -> Aktionsprospekt aus JSON-LD waehlen
  -> Flyer-Endpunkt und PDF als Rohdaten sichern
  -> pdftotext Layout + bbox
  -> unveraenderte Kandidaten
  -> konservatives ProductMatcher-Ergebnis
  -> Review oder Promotion
  -> Qualitaetsbericht
```

Aufruf, Voraussetzungen, Datumsoption und Ausgabeverzeichnisse stehen in der
[README](../README.md#lidl-offer-pipeline).

### Konfiguration

`scripts/run-lidl-offer-pipeline.js` liest optionale Umgebungsvariablen:

- `LIDL_OFFERS_URL` ersetzt die Discovery-URL. Neben der Prospekt-Uebersicht
  wird direktes Flyer-JSON mit einem `flyer`-Objekt akzeptiert; auch dessen
  Struktur und Gueltigkeit werden geprueft.
- `LIDL_FLYER_API_URL` ersetzt den Flyer-Endpunkt. Bei Auswahl ueber JSON-LD
  ergaenzt die Pipeline `flyer_identifier` und setzt `region_id=0`.
- `LIDL_STORE_ID` ordnet die erzeugten Angebote einem Eintrag in
  `data/stores.json` zu. Es waehlt keine regionale Lidl-Quelle; unbekannte
  Markt-IDs fuehren zu Review-Eintraegen statt zu freigegebenen Angeboten.
- `LIDL_REQUEST_TIMEOUT_MS`, `LIDL_REQUEST_MAX_ATTEMPTS` und
  `LIDL_RETRY_DELAY_MS` steuern Netzwerk-Timeout, Versuchszahl und die Basis
  der zwischen Versuchen steigenden Wartezeit.
- `LIDL_DISCOVERY_CACHE_MS` steuert die maximale Wiederverwendungsdauer der
  Discovery-Antwort.

Die Standardwerte und numerischen Fallback-Regeln stehen in
`scripts/lib/LidlOfferPipeline.js` (`createConfig`, `numberOption`) und
`scripts/lib/HttpClient.js`.

### Artefakte Und Provenienz

Die Pipeline verwendet einen stabilen Prospekt-Identifier fuer fachliche
Ausgabedateien. Ein erneuter Lauf schreibt deshalb denselben Prospekt-Snapshot
neu und haengt nicht dieselben Angebote als Duplikate an. Discovery-Antworten,
rohe Flyer-Quellen und PDFs werden mit ihrem Inhalts-Hash abgelegt;
Extraktionen tragen den Hash des zugehoerigen PDFs. Eine spaetere
Quellenaenderung ueberschreibt dadurch nicht die Belege eines frueheren Laufs.
Discovery-, Quell- und Extraktionsmetadateien werden dagegen aktualisiert;
auch normalisierte Ausgaben und Qualitaetsberichte sind ersetzbare Snapshots,
kein Archiv aller Laeufe.
Lokal erhalten bleiben:

- die Discovery-Antwort und ihre Abrufmetadaten;
- pro Prospekt die unveraenderte Flyer-JSON, Quell-URL, Abrufzeit und PDF;
- PDF-Hash, Layout-Text, Positions-XHTML und Extraktionszeit;
- normalisierte Flyer-Metadaten;
- getrennte Kandidaten-, Review-, optimizer-ready- und Quality-Dateien.

Die von der Pipeline erzeugten Flyer-, Kandidaten-, Review- und
Optimizer-Dateien enthalten Prospekt-ID und Gueltigkeitszeitraum. Ihr
`provenance`-Objekt auf Dokumentebene verweist auf Quell-Dateien, URLs,
Abrufzeiten und PDF-Hash. Damit kann
ein spaeterer Parserfehler gegen die damalige Quelle untersucht werden. Diese
laufzeitgenerierten Dateien bleiben ueber `.gitignore` ausserhalb von Git;
versioniert werden nur kleine Fixtures.

### Schonende Wiederverwendung Und Netzwerkfehler

Eine frische Discovery-Antwort wird fuer einen begrenzten Zeitraum
wiederverwendet, wenn die gespeicherte Datei weiterhin ihren SHA-256-Hash hat.
Die prospektspezifische Quelle gilt bei derselben stabilen Identitaet und
Quell-URL als wiederverwendbar, wenn ihr gespeicherter Hash passt und Struktur
sowie ausgewaehlter Gueltigkeitszeitraum validiert wurden. Abgelehnte Antworten
bleiben als inhaltsadressierte Rohdaten erhalten, werden aber nicht als
aktueller Cache veroeffentlicht. Eine PDF wird nur zusammen mit passender URL
und gespeichertem SHA-256-Hash verwendet; extrahierter Text nur, wenn sein
PDF-Hash passt, der Layout-Text mehr als Leerraum enthaelt und das lesbare
Positionsdokument mindestens ein nichtleeres Wort enthaelt. Dieselbe
Inhaltspruefung erfolgt vor der Cache-Freigabe neuer Extraktionen. Bild-PDFs
ohne Textebene brechen damit als Extraktionsfehler ab, bevor vorhandene
Angebotsausgaben ersetzt werden; einzelne leere Seiten bleiben erlaubt.
Flyer-Quelle und PDF haben keine eigene zeitliche Ablaufgrenze. Aenderungen
beim Anbieter unter unveraenderter URL werden bei Wiederverwendung nicht
abgerufen; dafuer dient `--force`. Bei direktem Flyer-JSON als Discovery-Quelle
muss zusaetzlich der Quell-Hash zur verwendeten Discovery-Antwort passen.

Netzwerkabrufe haben einen Timeout, standardmaessig maximal drei Versuche und
eine steigende kurze Wartezeit. Nur typische temporaere Statuscodes sowie
Netzwerk- und Timeoutfehler werden erneut versucht. Permanente HTTP-Fehler
werden sofort, temporaere Fehler nach dem letzten Versuch mit ihrer
eigentlichen Ursache gemeldet. Es gibt keine unbegrenzten Retries.

### Explizite Fehler Und Qualitaetsbericht

Der Lauf stoppt mit benannter Pipeline-Stufe bei:

- nicht mehr erkennbarem JSON-LD oder veraenderter Flyer-JSON-Struktur;
- keinem aktiven oder kommenden Aktionsprospekt fuer das Referenzdatum;
- vom ausgewaehlten JSON-LD-Ereignis abweichenden Flyer-Gueltigkeitsdaten;
- fehlender `pdfUrl`;
- einer Antwort ohne PDF-Signatur;
- fehlendem `pdftotext`, leerer oder unlesbarer Extraktion;
- unlesbaren Marktstammdaten oder einem Promotionfehler.

Die bereits gespeicherten Rohartefakte werden dabei nicht geloescht. Der
Lauf ersetzt die normalisierte Flyer-Datei und die Kandidatendatei erst nach
erfolgreicher Extraktion und erfolgreichem Parsing. Dabei werden vorherige Review-,
Optimizer- und Quality-Dateien entfernt, bevor die Marktstammdaten gelesen
und die Kandidaten promotet werden. Scheitert diese spaetere Stufe, bleiben
die neuen Kandidaten erhalten, aber die drei Ergebnisdateien fehlen. Ein
Abbruch ist daher kein vollstaendiger neuer Snapshot; die Dateien werden
einzeln atomar geschrieben, nicht als gemeinsamer Satz.

Der Erfolgslauf erzeugt `<prospekt>.quality-report.json` mit Seitenzahl,
Kandidatenzahl, Match-Arten, Trefferzahl, Promotionszahl, Review-Gruenden,
Warnungen, Wiederverwendungsstatus sowie den wichtigsten Quell- und
Ausgabepfaden. Abweichende Seitenzahlen, keine Kandidaten oder keine
freigegebenen Angebote werden als Warnungen im erfolgreichen Bericht
gemeldet; `status: "completed"` garantiert somit keine nutzbaren Angebote.
Die automatisierten Tests verwenden lokale Fixtures und ein
injiziertes Fake-Netzwerk; `npm test` braucht daher keine Lidl-Verfuegbarkeit.

## ALDI Nord: Discovery Und Adapter

Stand: 2026-11-02

### Quelle Und Regionalitaet

Der legitime direkte Quellenweg ist ein normaler GET der oeffentlichen
ALDI-Nord-Seite `https://www.aldi-nord.de/angebote.html`. Ein Test der alten
Route `/angebote/angebote.html` ergab 404; die kanonische Offers-Seite ist
`/angebote.html`. Ihre Next.js-Seitendaten enthalten eine `apiData`-Eigenschaft
mit einem `OFFER_GET`-Datensatz. Die beobachtete Anfrage ist
`{ locale: "de", week: "current" }`; die Antwort enthielt am 02.11.2026
284 eindeutige Angebotsobjekte.

Die offizielle Angebotsseite bezeichnet die Eintraege als aktuelle ALDI-Nord-
Angebote und wirbt mit Angeboten "in deiner Filiale". Der Datenabruf enthaelt
aber **keine** Postleitzahl, Filial-ID oder Region-Auswahl. Der offizielle
Filialfinder nutzt separat `STORE_UBERALL_LOCATIONS_GET`. Sein Snapshot hatte
2.234 Standorte und vier ALDI-Nord-Eintraege mit PLZ 48599. Die bestehende
Projektzeile `aldi-nord-epe` nennt keine Strasse; der offizielle Finder markiert
keinen dieser vier Eintraege ausdruecklich als Epe. Die exakte Filialadresse
bleibt deshalb unbestaetigt.

Der Adapter ordnet die feste Projektzeile `aldi-nord-epe` / `ALDI Nord Epe`
dem **ALDI-Nord-Kettenangebot** zu und prueft die Kettenzugehoerigkeit.
Die PLZ wird als Projektmetadatum ausgegeben, ist aber kein Filter oder
Regionalitaetsnachweis der Angebotsquelle. Er behauptet weder filialspezifische
Verfuegbarkeit noch Lagerbestand. `sourceScope: "aldi-nord-chain"` und
`localApplicability.storeLevelStockKnown: false` bleiben in den Dateien
sichtbar. Es ist ein ALDI-Nord-Kettenpreis, der anhand der bestehenden
Projektzuordnung dem lokalen Vergleichsmarkt zugeordnet wird; andere Filial-IDs
werden vom Adapter verworfen. Es ist keine Zusage, dass der konkrete Artikel
in der nicht adressgenau identifizierten Epe-Filiale noch vorrätig ist. Bei einem kuenftigen
ALDI-seitigen Filialfilter muss die Zuordnung enger werden; eine deutschland-
oder haendleruebergreifende Preis-Uebertragung findet nicht statt.

Die Roh-Snapshots und `evidence.json` des Discovery-Spikes liegen lokal unter
`data/raw/offers/aldi-nord/discovery/` und sind von Git ausgeschlossen. Die
kleine versionierte Fixture `test/fixtures/aldi-nord-current-offers.json`
enthaelt nur die fuer Parsing und Pruefung noetigen, aus diesem echten Abruf
sanitisierten Felder.

### Felder Und Sichere Promotion

Die Quelle liefert pro Produkt unter anderem `objectID`, `name`, `salesUnit`,
`isAvailable`, `isComingSoon`, `isRecall`, `currentPrice.priceValue`,
`currentPrice.strikePrice`, `priceTagLabels` und `promotionPrices`. Die
lokalen Angebotsdaten `validFromLocalDate` und `validUntilLocalDate` stammen
ausschliesslich aus `promotionPrices`; es wird kein Datum aus der Abrufzeit
oder Kategorie erfunden. Die Preislabels werden unveraendert im Rohkandidaten
behalten. Preislabels und offizielle Kurz-/Langtexte werden auf Hinweise wie
`4 kaufen +1 gratis`, Mindestabnahmen (`ab 2 Stueck`, `beim Kauf von 2
Packungen`) und Mehrkaufpreise (`2 fuer 3,00 EUR`) geprueft; diese fuehren zu
`conditional-price` und werden nicht als normaler Einzelpreis ausgegeben.

`AldiNordOfferAdapter` verwendet den gemeinsamen `ProductMatcher`, prueft
aber zusaetzlich eine bekannte Fehlzuordnung: `Djuvec-Reis-Gericht` enthaelt
den Begriff `Reis`, ist aber kein Angebot von plain Reis. Unbekannte Namen,
ambige/ausgeschlossene Matches, bedingte Preise, nicht unterstuetzte oder
fehlende Packungsgroessen, fehlende Preis-/Zeitfelder, nicht verfuegbare,
zukuenftige oder zurueckgerufene Produkte bleiben im Review. Die aktuell
unterstuetzten eindeutigen Verkaufseinheiten enthalten z.B. `250-g-Packung`,
`650-g-Schale`, `1-L-Packung`, Multipacks mit expliziter Menge, zaehlbare
`n-er-Packung` und das eindeutige `Stueck`. `Packung`, `kg-Preis`, `Dose`
ohne Mengenangabe, `Stueck/2er-Packung` und andere mehrdeutige Einheiten
werden nicht geraten. Der Mengenparser prueft die gesamte Verkaufseinheit;
nach einer Masseinheit sind nur bekannte Verpackungsnamen (Pack/Packung,
Beutel, Schale, Dose, Flasche, Becher, Glas, Netz) erlaubt. Alternativen wie
`250-g-Packung/500-g-Packung` und weitere Mengen-/Textzusaetze bleiben mit
fehlender Menge und niedriger Parser-Konfidenz im Review.

Reale Stichproben gegen die normalisierte Ausgabe (Abruf 02.11.2026):

| Quell-ID / Name | Originaleinheit | Preis | Quellgueltigkeit | Ergebnis am 02.11. |
| --- | --- | ---: | --- | --- |
| `4704` Butter | `250-g-Packung` | 1,49 EUR | 02.11.–07.11.2026 | optimizer-ready: 250 g, `butter`, ALDI Nord Epe |
| `6766` Rispentomaten | `650-g-Schale` | 1,69 EUR | 05.11.–07.11.2026 | Review: `not-yet-valid` bis 05.11.; Preis/Packung unveraendert |
| `1021924` Frische Milch | `1-L-Packung` | 0,99 EUR | 05.11.–11.11.2026 | Review: `not-yet-valid` bis 05.11. |
| `1037558` Weihnachtskarte | `Stueck/2er-Packung` | 3,96 EUR | 02.11.–07.11.2026 | Review: `conditional-price`, unklare Packung und kein Produktmatch |
| `1015587` Djuvec-Reis-Gericht | `800-g-Dose` | 2,49 EUR | 02.11.–07.11.2026 | Review: `source-product-variant`, kein plain-Reis-Match |

Die akzeptierte Butter-Ausgabe behaelt Quelle, Quell-ID, Abrufzeit, Store-ID,
Paketmenge, Originalnamen und lokale Gueltigkeitsdaten. Vergleichs-/Basispreise
werden nicht als Regalpreis missverstanden.

Der komplette Live-Lauf desselben Tages erzeugte 284 Kandidaten, 1
optimizer-ready Angebot und 283 Review-Eintraege. Haeufige, sich ueberlappende
Review-Gruende waren 277 ungematchte Namen, 120 noch nicht gueltige Angebote,
62 nicht unterstuetzte Verkaufseinheiten und 4 bedingte Preise. Die niedrige
Promotionsquote ist angesichts des kleinen gemeinsamen Produktkatalogs und der
strengen Packungs-/Bedingungspruefung beabsichtigt.

### Ausfuehrung Und Tests

Der Standardaufruf steht in [README.md](../README.md#current-scope).
Zusaetzliche Optionen:

```bash
npm run fetch:aldi-nord-offers -- --refresh
npm run fetch:aldi-nord-offers -- --as-of 2026-11-02
```

Ohne `--refresh` wird ein intakter, validierter Rohabruf bis zu sechs Stunden
wiederverwendet. `--refresh` umgeht den Cache; auch dann gelten die
Retry-Grenzen. `--as-of` setzt nur den Pruefstichtag fuer den verwendeten
Snapshot, laedt aber keine historischen Angebote. Ohne diese Option gilt das
heutige Datum in `Europe/Berlin`.

Netzwerkanfragen haben 15 Sekunden Timeout, maximal zwei Retries mit begrenztem
Backoff; 4xx ausser 429 werden nicht wiederholt. Roh-HTML und SHA-256-Metadaten
bleiben unter `data/raw/offers/aldi-nord/` fuer Reproduzierbarkeit erhalten.
Jede Ergebnisdatei verweist mit `sourceSnapshot` auf Rohdateipfad, Hash und
Cache-Wiederverwendung. Kandidaten-, Review- und
optimizer-ready JSON liegen unter `data/normalized/offers/aldi-nord/` und
werden nicht versioniert. Die Review-Datei enthaelt den Status und die
Pruefgruende aller Kandidaten, einschliesslich der freigegebenen Eintraege;
nur die optimizer-ready Datei enthaelt ausschliesslich sichere Angebote.
Geaenderte Seitenstrukturen enden mit einer konkreten Fehlermeldung; die
Rohantwort bleibt zur Analyse erhalten.

Die ALDI-Tests verwenden nur die kleine Fixture beziehungsweise injizierte
HTTP-Antworten. Sie decken Quellenform, Packungsparser, Netzwerkfehler,
Timeout/Retry-Grenzen, Cache-Wiederverwendung, Duplikate, Gueltigkeitsfenster,
Ketten-/Filial-Mismatch, bedingte Preise und konservative Produktzuordnung ab.
## K+K Discovery
## K+K Discovery und Adapter

Die K+K-Quellenpruefung vom 02.11.2026 ist in
[`docs/kk-offers-research.md`](kk-offers-research.md) dokumentiert. Der
normale oeffentliche Viewer laedt den Katalog `kundk_kw45` mit 12 Seiten und
Textdateien `bk_1.txt` bis `bk_12.txt`. Die Gueltigkeit 02.11.2026 bis
07.11.2026 steht explizit auf den Prospektseiten. Der Adapter
`scripts/parse-kk-offers.js` liest die Textseiten, parst eine eindeutig
quantifizierbare Barilla-Pasta-Offerte und haelt Tafel-Aepfel ohne sicher
zugeordnete Menge/Preis in Review. Der Textstrom ist nicht generell
positionsstrukturiert; nicht unterstuetzte Artikel werden nicht geraten.

Ohne explizite `--store-id`-Option erzeugt der Lauf keine filialgebundenen
Optimizer-Angebote. Der offizielle Filialfinder zeigt drei Epe-Filialen mit
demselben Prospektlink, waehrend `data/stores.json` zwei interne K+K-IDs ohne
Strassenadresse fuehrt. Die bevorzugte Store-Auswahl und die Zuordnung West/
Ost zu konkreten Filialen bleiben eine separate Captain-Entscheidung.
