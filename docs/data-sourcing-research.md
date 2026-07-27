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

## Empfohlener Naechster Schritt

Nicht direkt Datenbank bauen.

Erst einen kleinen Scraper-/Importer-Spike bauen. Wir starten mit Lidl, weil Lidl in der ersten echten Markt-Kohorte des Users liegt.

```text
scripts/discover-lidl-offers.js
        |
        v
data/raw/offers/lidl/*.html
        |
        v
data/raw/offers/lidl/*.analysis.json
        |
        v
data/normalized/offers.json
        |
        v
ShoppingOptimizer bekommt normalized offers
```

Der Spike darf erstmal nur ein JSON-File erzeugen. Ziel ist nicht Perfektion, sondern herauszufinden:

1. Kommen wir ueberhaupt an strukturierte Angebotsdaten?
2. Welche Felder bekommen wir wirklich?
3. Wie stark unterscheiden sich die Haendler?
4. Was muessen wir normalisieren?

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

Das heisst: Lidl ist technisch erreichbar, aber wir brauchen sehr wahrscheinlich noch einen Lidl-spezifischen Normalizer, der aus Flyer-JSON, Seiten-Texten und eventuell PDF/Bilddaten unsere internen Angebote baut.

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

Naechster Untersuchungsschritt: Produkt, Preis und Packungsgroesse auf einer Lebensmittel-Prospektseite korrekt einander zuordnen. Erst daraus entstehen Objekte, die der `ShoppingOptimizer` verwenden darf.

## Lidl PDF Statt OCR

Der Flyer liefert zusaetzlich eine PDF mit eingebetteter Textebene. Ein Test mit `pdftotext -layout` auf Seite 3 konnte unter anderem diesen Zusammenhang erhalten:

```text
Romatomaten
Je 500 g
1 kg = 1.76
0.88
```

Damit ist fuer Lidl vorerst keine Bild-OCR notwendig. Die neue Pipeline kann so aussehen:

```text
Flyer JSON -> PDF-URL -> PDF -> Layout-Text -> Lidl-Angebotsparser
```

Der lokale Rechner beziehungsweise spaeter die NAS braucht dafuer `pdftotext` aus dem Paket `poppler-utils`. Eine bereits heruntergeladene PDF wird so extrahiert:

```bash
npm run extract:lidl-pdf -- /pfad/zum/lidl-prospekt.pdf
```

Der erzeugte Text liegt unter `data/raw/offers/lidl/pdf-text/` und bleibt als Rohdatum von Git ausgeschlossen. Der spaetere Angebotsparser bekommt fuer seine Tests nur kleine, gezielte Textausschnitte.

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

Der spaetere Angebotsparser muss dadurch kein XML kennen. Er kann sich auf die fachliche Heuristik konzentrieren: Welche Mengen-, Preis- und Hinweisbloecke liegen nahe bei einem Produktnamen?

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

Die Gruende koennen sich pro Kandidat ueberschneiden. Mit dem aktuellen Datum
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

Der normale Lauf braucht nur ein Kommando:

```bash
npm run pipeline:lidl
```

`--as-of YYYY-MM-DD` reproduziert Auswahl und Gueltigkeitspruefung fuer einen
bestimmten Tag. `--force` umgeht die sichere Wiederverwendung, wenn eine Quelle
bewusst erneut untersucht werden soll.

### Artefakte Und Provenienz

Die Pipeline verwendet einen stabilen Prospekt-Identifier fuer fachliche
Ausgabedateien. Ein erneuter Lauf schreibt deshalb denselben Prospekt-Snapshot
neu und haengt nicht dieselben Angebote als Duplikate an. Rohe Flyer-Quellen,
PDFs und Extraktionen tragen zusaetzlich einen Inhalts-Hash; eine spaetere
Quellenaenderung ueberschreibt dadurch nicht die Belege eines frueheren Laufs.
Lokal erhalten bleiben:

- die Discovery-Antwort und ihre Abrufmetadaten;
- pro Prospekt die unveraenderte Flyer-JSON, Quell-URL, Abrufzeit und PDF;
- PDF-Hash, Layout-Text, Positions-XHTML und Extraktionszeit;
- normalisierte Flyer-Metadaten;
- getrennte Kandidaten-, Review-, optimizer-ready- und Quality-Dateien.

Die Provenienz in den erzeugten Dokumenten verweist auf Prospekt-ID,
Quell-Dateien, URLs, Abrufzeiten, Gueltigkeitszeitraum und PDF-Hash. Damit kann
ein spaeterer Parserfehler gegen die damalige Quelle untersucht werden. Diese
laufzeitgenerierten Dateien bleiben ueber `.gitignore` ausserhalb von Git;
versioniert werden nur kleine Fixtures.

### Schonende Wiederverwendung Und Netzwerkfehler

Eine frische Discovery-Antwort wird fuer einen begrenzten Zeitraum
wiederverwendet. Die prospektspezifische Quelle gilt bei derselben stabilen
Identitaet als wiederverwendbar. Eine PDF wird nur zusammen mit passender URL
und gespeichertem SHA-256-Hash verwendet; extrahierter Text nur, wenn sein
PDF-Hash passt und das Positionsdokument weiterhin lesbar ist.

Netzwerkabrufe haben einen Timeout, maximal drei Versuche und eine steigende
kurze Wartezeit. Nur typische temporaere Statuscodes sowie Netzwerk- und
Timeoutfehler werden erneut versucht. Permanente HTTP-Fehler werden sofort,
temporaere Fehler nach dem letzten Versuch mit ihrer eigentlichen Ursache
gemeldet. Es gibt keine unbegrenzten Retries.

### Explizite Fehler Und Qualitaetsbericht

Der Lauf stoppt mit benannter Pipeline-Stufe bei:

- nicht mehr erkennbarem JSON-LD oder veraenderter Flyer-JSON-Struktur;
- fehlender `pdfUrl`;
- einer Antwort ohne PDF-Signatur;
- fehlendem `pdftotext`, leerer oder unlesbarer Extraktion;
- unlesbaren Marktstammdaten oder einem Promotionfehler.

Die bereits gespeicherten Rohartefakte werden dabei nicht geloescht. Der
Erfolgslauf erzeugt `<prospekt>.quality-report.json` mit Seitenzahl,
Kandidatenzahl, Match-Arten, Trefferzahl, Promotionszahl, Review-Gruenden,
Warnungen, Wiederverwendungsstatus sowie den wichtigsten Quell- und
Ausgabepfaden. Die automatisierten Tests verwenden lokale Fixtures und ein
injiziertes Fake-Netzwerk; `npm test` braucht daher keine Lidl-Verfuegbarkeit.
