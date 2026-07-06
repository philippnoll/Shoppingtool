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

Erst einen kleinen Scraper-/Importer-Spike bauen:

```text
scripts/fetch-offers.js
        |
        v
data/raw/offers/lidl-sample.json
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
