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
