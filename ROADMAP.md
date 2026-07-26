# Shoppingtool: Projektstand Und Roadmap

Stand: 2026-07-26

Dieses Dokument ist die zentrale Uebergabe fuer Menschen und Coding Agents. Es
beschreibt, welches Produkt gebaut wird, was bereits funktioniert, welche
Entscheidungen getroffen wurden und in welcher Reihenfolge weitergebaut werden
soll.

## Produktziel

Shoppingtool soll langfristig eine private, auf der eigenen NAS betriebene
Einkaufsplattform fuer zwei Personen werden.

Der zusammenhaengende Zielprozess ist:

```text
Rezepte fuer die Woche planen
        |
        v
Zutaten in eine gemeinsame Einkaufsliste uebernehmen
        |
        v
Freitext und Tippfehler in bekannte Produkte uebersetzen
        |
        v
Aktuelle lokale Supermarktangebote vergleichen
        |
        v
Einen Laden oder eine sinnvolle Ladenkombination empfehlen
        |
        v
Einkauf, Preise und Preisentwicklung speichern
```

Die App ist ein privates Hobbyprojekt und nicht fuer eine kommerzielle
Veroeffentlichung vorgesehen. Trotzdem sollen Datenquellen respektvoll,
sparsam und nachvollziehbar abgerufen werden.

## Arbeitsweise

- UI5 wird langsam und als Lernprojekt weiterentwickelt. Aenderungen an XML
  Views, Bindings, Controllern, Components und Models werden klein umgesetzt
  und konkret erklaert.
- Scraper, PDF-Parsing, Normalisierung und spaetere Datenbank-Infrastruktur
  duerfen schneller und in groesseren Schritten umgesetzt werden. Wichtig sind
  dort eine dokumentierte Datenkette, Tests und nachvollziehbare Ergebnisse.
- Kleine, thematisch geschlossene Commits sind erwuenscht.
- Der User uebernimmt `git push`.
- Die App soll erst produktiv genutzt werden, wenn mindestens die wesentlichen
  Scraper funktionieren. Zwischenloesungen mit manueller Persistenz sind daher
  kein eigenes Produktziel.

## Was Bereits Gebaut Wurde

### 1. OpenUI5-App

- OpenUI5 Freestyle mit JavaScript, XML View und Standard-Theming.
- Start ueber UI5 Tooling mit `npm run serve`.
- Zentrales, noch nicht persistentes `JSONModel` in `webapp/Component.js`.
- Mobile-taugliche Hauptansicht mit `sap.m` und `sap.f`.
- Bewusst wenig eigenes Styling, damit das Standard-UI5-Erscheinungsbild
  sichtbar bleibt.

### 2. Praktische Einkaufsliste

- Freitexteingabe wie `2x butter, tomatn, milch`.
- Mehrere Trenner und Mengen-/Einheitenangaben werden verarbeitet.
- Erkannte Artikel werden direkt als bearbeitbare Listeneintraege angelegt.
- Name, Menge und Einheit sind editierbar.
- Artikel koennen abgehakt und geloescht werden.
- Erledigte Artikel werden ueber den nativen
  `CustomListItem.highlight`-Zustand hervorgehoben.
- Der fruehere Kandidat-/Bestaetigt-Ablauf und das separate
  Einzelprodukt-Suchfeld wurden entfernt. Sie passten nicht zum echten
  Einkaufsablauf.

### 3. Produkterkennung

- `ProductCatalog.js` enthaelt aktuell einen kleinen internen Produktkatalog.
- Derselbe Katalog kann direkt als UI5-Modul und als Node/CommonJS-Modul geladen
  werden. Es gibt dadurch nur eine Quelle fuer Produktstammdaten, Eingabealiasse
  und konservative Angebots-Matchingregeln.
- `ProductSearch.js` kapselt MiniSearch.
- Prefix- und Fuzzy-Suche erkennen unter anderem Tippfehler.
- `ProductRecognition.js` trennt Freitext, liest Menge und Einheit und erzeugt
  Einkaufslistenobjekte.
- Beispiel: `buttermann` kann dem Produkt `butter` zugeordnet werden.
- Die Produkterkennung ist als Fachlogik vom UI5-Controller getrennt und wird
  mit Node-Tests ueber einen kleinen UI5-Modul-Loader getestet.

### 4. Einkaufsoptimierung Mit Mock-Daten

- `ShoppingOptimizer.js` vergleicht Angebote anhand von `productKey` und
  kompatiblen Einheiten.
- Gramm/Kilogramm und Milliliter/Liter werden auf Basiseinheiten umgerechnet.
- Benoetigte Packungsanzahlen werden mit `Math.ceil` aufgerundet.
- Einzelne Laeden werden zuerst nach fehlenden Artikeln, danach nach
  Gesamtpreis sortiert.
- Eine Split-Empfehlung kann pro Artikel das guenstigste Angebot aus mehreren
  Laeden kombinieren.
- Jeder zusaetzliche Laden bekommt aktuell standardmaessig eine Strafe von
  7 EUR. Sie repraesentiert Umweg, Fahrzeugkosten, Zeit und Aufwand.
- Die UI zeigt den besten Einzelladen, den Split-Preis, die reine Ersparnis und
  die effektive Ersparnis nach Zusatzladen-Strafe.
- Die Angebote stammen derzeit noch aus `MockOffers.js`.

### 5. Lokale Maerkte

Die erste reale Kohorte ist in `data/stores.json` erfasst:

- Lidl, Gronauer Str. 120
- ALDI Nord Epe
- K+K Epe West
- K+K Epe Ost
- PENNY Epe

Lidl ist die erste implementierte Datenquelle. Die anderen Ketten folgen erst,
wenn die Lidl-Pipeline verlaesslich genug ist.

### 6. Lidl-Datenbeschaffung

Die Untersuchung hat folgenden nutzbaren Weg ergeben:

```text
Lidl Prospekt-Uebersicht
  -> JSON-LD mit Prospekt-Links
  -> Lidl Leaflet JSON-Endpunkt
  -> PDF-URL
  -> PDF mit eingebetteter Textebene
  -> pdftotext -bbox-layout
  -> positionierte Seiten/Bloecke/Woerter
  -> rohe Angebotskandidaten
```

Wichtige Erkenntnisse:

- Die strukturierten Produktobjekte des Flyer-Endpunkts reichen fuer
  Lebensmittelangebote nicht aus. Sie enthalten viele Non-Food-Produkte.
- Das Prospekt-PDF besitzt eine Textebene. Fuer Lidl ist aktuell keine OCR
  erforderlich.
- Positionen aus `pdftotext -bbox-layout` erlauben es, Produktname, Menge,
  Preis und Preishinweise raeumlich einander zuzuordnen.
- Die Roh- und Ergebnisdateien werden lokal erzeugt und sind absichtlich von
  Git ausgeschlossen. Nur kleine Test-Fixtures werden versioniert.

Implementierte Stufen:

1. `discover-lidl-offers.js` findet und analysiert Lidl-Prospekte.
2. `normalize-lidl-flyer.js` erzeugt stabile Flyer-Metadaten.
3. `extract-lidl-pdf-text.js` erzeugt Layout-Text und Positions-XHTML.
4. `LidlPdfLayoutParser.js` uebersetzt XHTML in einfache JavaScript-Objekte.
5. `LidlOfferCandidateParser.js` erzeugt rohe Angebotskandidaten.
6. `LidlOfferPromoter.js` prueft, matcht und promotet nur sichere Kandidaten.
7. `parse-lidl-offers.js` verarbeitet einen kompletten Prospekt und schreibt
   Kandidaten-, Review- und optimizerfaehige Dateien.

Der Kandidatenparser unterstuetzt derzeit:

- feste Packungen wie `Je 500 g`
- Multipacks wie `10x 200 ml`
- Kiloware mit `kg-Preis`
- Beispielgewichte wie `Ca. 250 g`
- regulaere und reduzierte Preise
- Lidl-Plus-Preise
- durch PDF-Trennung zerschnittene Produktnamen
- eine vorsichtige `confidence` fuer unsicherere Zuordnungen

Messstand des getesteten Prospekts vom 20.07.2026 bis 25.07.2026:

- 69 Seiten gelesen
- 200 Angebotskandidaten erzeugt
- 17 Lidl-Plus-Preise erkannt
- 6 vorsichtiger bewertete Kilowaren-Treffer
- keine leeren Namen, ungueltigen Preise oder Mengen
- keine exakten Duplikate
- alle `productKey`-Werte absichtlich noch `null`

Getestete reale Beispiele sind unter anderem Romatomaten, Haferdrink,
Trauben, Gurken, Brot, Wassermelone, Auberginen, Zucchini, Zwetschgen,
Cantaloupemelone und Rinder-Rumpsteak.

### 7. Qualitaetssicherung Und Dokumentation

- Node-Test-Suite fuer Produkterkennung, Optimierung und Lidl-Pipeline.
- ESLint fuer `webapp`, `scripts` und `test`.
- UI5-Produktionsbuild.
- `docs/ui5-basics.md` dokumentiert die bisher besprochenen UI5-Grundlagen.
- `docs/data-sourcing-research.md` dokumentiert Quellen, Befunde und die
  Lidl-Pipeline im Detail.
- Zuletzt waren `npm test`, `npm run lint` und `npm run build` erfolgreich.
- `npm audit --omit=dev` meldete keine produktiven Schwachstellen.

## Aktuelle Datenkette

Die Lidl-Seite reicht jetzt bis zu einem kontrollierten, optimizerfaehigen
Angebotsformat:

```text
Lidl-Prospekt
  -> LidlOfferCandidateParser
  -> rohe Kandidaten mit parser.confidence
  -> ProductMatcher
  -> Match-Typ und match.confidence
  -> LidlOfferPromoter
       -> Review-Report mit Gruenden
       -> nur sichere, gueltige und unbedingte Angebote
  -> optimizer-ready JSON
```

Die UI5-App verwendet weiterhin `MockOffers.js`:

```text
Einkaufsliste
  -> ProductRecognition
  -> item.productKey
  -> ShoppingOptimizer
  -> MockOffers
```

Das optimizer-ready JSON wird erst in Phase 4 kleinschrittig in das UI5-Model
eingebunden. Lidl-Plus-Preise werden bis zu einer expliziten Nutzeroption nicht
an den Optimizer weitergegeben.

## Wichtige Datenvertraege

### Einkaufslistenartikel

```js
{
  id: 1,
  rawText: "2x butter",
  productKey: "butter",
  name: "Butter",
  quantity: 2,
  unit: "Stk",
  category: "Kuehlung",
  purchased: false
}
```

### Roher Lidl-Angebotskandidat

```js
{
  source: "lidl-pdf",
  chain: "Lidl",
  storeId: "lidl-gronauerstrasse-48599",
  validFrom: "2026-07-20",
  validTo: "2026-07-25",
  sourcePage: 3,
  rawName: "Romatomaten",
  productKey: null,
  packageQuantity: 500,
  packageUnit: "g",
  packageCount: 1,
  itemQuantity: 500,
  price: 0.88,
  regularPrice: 1.11,
  basePrice: 1.76,
  basePriceUnit: "kg",
  priceType: "lidl-plus",
  confidence: 0.9,
  sourcePosition: {
    x: 0,
    y: 0
  }
}
```

### Fuer Den Optimizer Verwendbares Angebot

Der Optimizer erwartet derzeit mindestens:

```js
{
  storeId: "lidl-gronauerstrasse-48599",
  storeName: "Lidl Gronauerstrasse",
  chain: "Lidl",
  productKey: "tomaten",
  offerName: "Romatomaten",
  packageQuantity: 500,
  packageUnit: "g",
  price: 0.88
}
```

Ein Scraper-Kandidat darf dieses Format erst erreichen, wenn sein
`productKey` verlaesslich bestimmt wurde.

## Roadmap

### Phase 1: Produkt-Matcher Fuer Prospektnamen

Status: umgesetzt.

Ziel: Handelsnamen wie `MEGGLE Feine Butter` oder `Romatomaten` einem
internen Produkt zuordnen, ohne aehnlich klingende andere Produkte falsch
zuzuordnen.

Umgesetzte Arbeitspakete:

1. `ProductCatalog.js` stellt UI5 und Node/CommonJS dieselben Stammdaten bereit,
   ohne eine zweite Katalogdatei zu pflegen.
2. Der kleine Katalog enthaelt Eingabealiasse, explizite Angebotsaliasse und
   Ausschlussbegriffe.
3. `ProductMatcher` bleibt vom Lidl-spezifischen PDF-Parsing getrennt.
4. Match-Ergebnisse enthalten `productKey`, Match-Art und Konfidenz.
5. Es gibt absichtlich kein Fuzzy Matching fuer Angebotsnamen. Unsichere oder
   mehrdeutige Treffer bleiben `productKey: null`.
6. Positive, negative und mehrdeutige Faelle sind getestet.

Mindestens zu testende positive Faelle:

```text
Romatomaten                    -> tomaten
MEGGLE Feine Butter            -> butter
WEIHENSTEPHAN Haltbare Milch   -> milch
```

Mindestens zu testende negative Faelle:

```text
KANIA Tomatenketchup           -> nicht tomaten
Buttermilch                    -> nicht automatisch butter
Milchreis                      -> nicht automatisch milch oder reis
```

Akzeptanzkriterien:

- UI5-Produktsuche und Node-Matcher verwenden dieselben Katalogdaten.
- Sichere Treffer erhalten einen `productKey`.
- Unsichere und mehrdeutige Treffer bleiben `null`.
- Kein Scraper-Code kennt UI5-Controls oder Controller.
- Tests, Lint und Build sind gruen.

Messstand des 200-Kandidaten-Prospekts:

- 9 sichere Matches
- 5 explizit ausgeschlossene Namen
- 186 nicht gematchte Namen
- keine mehrdeutigen Matches

### Phase 2: Kandidaten Zu Verwendbaren Lidl-Angeboten Promoten

Status: umgesetzt.

Ziel: Aus einem Prospekt eine gepruefte Angebotsdatei erzeugen, die der
Optimizer technisch verwenden kann.

Umgesetzte Arbeitspakete:

1. `LidlOfferPromoter` wendet den `ProductMatcher` auf alle Kandidaten an.
2. Der Review-Eintrag behaelt den vollstaendigen Kandidaten sowie getrennte
   `parser.confidence`- und `match.confidence`-Werte.
3. Ungematchte, ausgeschlossene, mehrdeutige, unvollstaendige, unbekannte,
   zu unsichere und zeitlich ungueltige Kandidaten erhalten maschinenlesbare
   Gruende.
4. Parser-Konfidenzen unter `0.9` werden nicht automatisch promotet.
5. Lidl-Plus-Preise erhalten eine explizite Kundenprogramm-Bedingung und
   werden nicht in die allgemein verwendbare Optimizer-Datei uebernommen.
6. Exakte Kandidatenduplikate werden ueber stabile Quellfelder erkannt.
7. Store-Namen kommen aus `data/stores.json`.
8. `parse:lidl-offers` schreibt in einem Lauf `.candidates.json`,
   `.review.json` und `.optimizer-ready.json`.
9. `promote:lidl-offers` kann bereits vorhandene Kandidatendateien separat
   erneut pruefen. Standardmaessig gilt das heutige UTC-Datum; `--as-of` ist
   nur fuer reproduzierbare historische Auswertungen gedacht.

Auswertung des 200-Kandidaten-Prospekts fuer den gueltigen Stichtag 23.07.2026:

- 8 optimizerfaehige, unbedingte Angebote
- 192 Kandidaten im Review
- 186 nicht gematchte Namen
- 5 explizite Ausschluesse
- 17 Lidl-Plus-Preise
- 6 Kandidaten mit zu niedriger Parser-Konfidenz
- kein optimizerfaehiges Angebot mit `productKey: null`

Die Grundzahlen koennen sich ueberschneiden, weil ein Kandidat beispielsweise
zugleich ungematcht und Lidl-Plus-bedingt sein kann. Am 26.07.2026 liefert der
Standardlauf erwartungsgemaess null verwendbare Angebote und markiert alle 200
Kandidaten als abgelaufen.

Visuell geprueft wurden unter anderem die PDF-Seiten mit Aepfeln,
Romatomaten/Vollkornbrot, Express-Reis, GAZI Kaese, Spitzenreis, Butter und
haltbarer Milch. Namen, Packungsmengen, Preise und die Lidl-Plus-Behandlung
stimmen dort mit der Ausgabe ueberein.

### Phase 3: Lidl-Pipeline Robust Und Wiederholbar Machen

Status: als Naechstes umsetzen.

Ziel: Ein neuer Lidl-Prospekt kann ohne manuelle Dateisuche verarbeitet
werden.

Arbeitspakete:

1. Discovery, Download, Extraktion, Parsing und Matching orchestrieren.
2. Schonende Abrufintervalle, Timeout, Retry und aussagekraeftige Fehler
   definieren.
3. Prospekt-ID, Abrufzeit und Quelldatei fuer Reproduzierbarkeit behalten.
4. Parser-Qualitaetsbericht mit Trefferquote und Warnungen erzeugen.
5. Weitere echte Seiten als kleine Fixtures aufnehmen, sobald neue Layouts
   auftreten.
6. Verhalten bei veraendertem oder fehlendem PDF testen.

Akzeptanzkriterien:

- Ein End-to-End-Kommando verarbeitet den aktuellen Prospekt.
- Wiederholte Laeufe erzeugen keine fachlichen Duplikate.
- Ein Quellenwechsel oder Parserproblem ist im Log klar sichtbar.
- Rohdaten bleiben fuer spaetere Fehleranalyse erhalten.

### Phase 4: Echte Angebote In Die UI5-App Einbinden

Ziel: Die bisherige Optimierungsansicht arbeitet mit real normalisierten
Lidl-Daten statt nur mit `MockOffers.js`.

Diese Phase ist wieder eine UI5-Lernphase und wird kleinschrittig umgesetzt.

Arbeitspakete:

1. Festlegen, wie die App Angebotsdaten laedt, bevor das Backend existiert.
2. Angebotsdaten in ein benanntes oder klar abgegrenztes UI5-Model laden.
3. Lade-, Leer- und Fehlerzustand in der XML View anzeigen.
4. Nur aktuell gueltige und fuer den gewaehlten Markt passende Angebote
   optimieren.
5. Mock-Angebote als Testdaten behalten, aber nicht als produktive Quelle
   behandeln.
6. Sichtbar machen, welche Einkaufsartikel nicht durch echte Angebote
   abgedeckt sind.

Akzeptanzkriterien:

- Der Datenweg Quelle -> Model -> Controller -> Optimizer -> View ist
  gemeinsam erklaert und verstanden.
- Die UI behauptet nicht, ein kompletter Warenkorbpreis sei bekannt, wenn nur
  Angebotsartikel vorliegen.
- Abgelaufene Angebote werden nicht angezeigt oder berechnet.

### Phase 5: Weitere Haendler Der Ersten Kohorte

Reihenfolge:

1. ALDI Nord
2. K+K
3. PENNY

Fuer jede Kette zuerst einen Discovery-Spike durchfuehren. Nicht annehmen,
dass PDF, JSON-Endpunkte oder regionale Gueltigkeit wie bei Lidl aufgebaut
sind.

Jeder Adapter soll am Ende denselben internen Angebotsvertrag liefern:

```text
Haendlerquelle
  -> haendlerspezifischer Adapter
  -> rohe Daten
  -> haendlerspezifischer Parser
  -> gemeinsamer ProductMatcher
  -> gemeinsames Angebotsformat
```

Akzeptanzkriterien je Haendler:

- Lokale beziehungsweise regional relevante Angebote sind identifizierbar.
- Quelle und Gueltigkeitszeitraum werden gespeichert.
- Reale Stichproben sind getestet.
- Ausgabe kann ohne Sonderfall im `ShoppingOptimizer` verwendet werden.

### Phase 6: Persistenz, Historie Und NAS-Backend

Ziel: Angebots-Snapshots, Preisverlaeufe und gemeinsame Einkaufslisten
dauerhaft speichern.

Geplante Richtung:

- CAP-Backend
- PostgreSQL
- Betrieb auf der privaten NAS

Vor der Implementierung muss geprueft werden, welche Container- und
Deployment-Moeglichkeiten die konkrete NAS bietet. Das Datenmodell soll erst
nach stabilen Lidl- und mindestens einem weiteren Haendlerdatensatz finalisiert
werden.

Voraussichtliche Entitaeten:

- `Products`
- `ProductAliases`
- `Stores`
- `OfferSnapshots`
- `Offers`
- `ShoppingLists`
- `ShoppingListItems`
- `Purchases`
- `Receipts`

Wichtige Regeln:

- Historische Angebote nicht ueberschreiben.
- Rohname, Quelle und Abrufzeit neben normalisierten Feldern behalten.
- Preise als Dezimalwerte, nicht als binaere Gleitkommazahlen persistieren.
- Gueltigkeitszeitraum und beobachteter Zeitpunkt sind verschiedene Felder.
- Migrationen und Backups gehoeren zum NAS-Betrieb.

### Phase 7: Realistischere Routen- Und Split-Optimierung

Ziel: Nicht nur den billigsten Warenkorb, sondern den praktisch sinnvollsten
Einkauf empfehlen.

Die bestehende 7-EUR-Zusatzladen-Strafe bleibt vorerst die solide Basis.
Spaeter koennen einfliessen:

- frei waehlbarer Suchradius
- Startpunkt und reale Zusatzkilometer
- ID.Buzz-Verbrauch und Strompreis
- Fahrzeit und persoenlicher Zeitwert
- Ladenanzahl
- fehlende Artikel
- Lidl-Plus- oder andere Kundenkarten-Verfuegbarkeit
- Ladenoeffnungszeiten

Die Optimierung sollte dann mehrere Szenarien ausgeben:

```text
bequemster Einkauf
guenstigster Einkauf
bester Kompromiss
```

### Phase 8: Bon-Import Und Reale Preisgeschichte

Die vorhandenen digitalen Lidl-Bons sind wertvolle Test- und Lerndaten fuer:

- reale Produktnamen
- Marken und Packungsgroessen
- tatsaechlich gezahlte Preise
- Rabatte und Pfand
- Kaufhaeufigkeit
- persoenlich relevante Produktsortimente

Bon-Daten werden als eigene Beobachtungsquelle importiert und nicht mit
Prospektangeboten verwechselt. OCR beziehungsweise Bildanalyse kommt erst
dann hinzu, wenn ausreichend Beispielbons fuer ein belastbares Format
vorliegen.

### Phase 9: Rezepte Und Wochenplanung

Erst nach Einkaufsliste, echten Angeboten, Optimierung und Persistenz:

- Rezepte speichern und bearbeiten
- Wochenplan erstellen
- Zutaten skalieren
- vorhandene Vorratsartikel auslassen
- Zutaten als Einkaufslistenartikel vorschlagen
- vergangene Wochen und Lieblingsrezepte wiederverwenden

Rezepte muessen dieselben `productKey`-Stammdaten verwenden wie
Einkaufsliste, Angebote und Bons.

## Bewusste Nicht-Ziele Fuer Die Naechsten Schritte

- Noch kein KI-Modell auf dem Edge-Geraet. Ein erklaerbarer Matcher und echte
  Fehlerdaten kommen zuerst.
- Noch keine Datenbank, bevor die Angebotsformate ausreichend verstanden sind.
- Noch keine aufwendige Rezeptoberflaeche.
- Noch keine generische Einheits-Scraperplattform. Jeder Haendler braucht
  voraussichtlich einen eigenen Adapter.
- Keine Optimierung mit ungematchten oder abgelaufenen Angeboten.
- Keine Behauptung, Prospektpreise seien vollstaendige Regalpreise.

## Naechste Konkrete Arbeitssession

Die naechste Harness sollte genau hier beginnen:

1. `git status --short --branch` und die letzten Commits pruefen.
2. Discovery-, Download-, Extraktions-, Parser- und Promotion-Skripte samt
   Tests lesen.
3. Tests fuer eine gemeinsame Lidl-Orchestrierung zuerst schreiben.
4. Discovery, PDF-Download, Extraktion, Parsing und Promotion in einem
   End-to-End-Kommando verbinden.
5. Schonende Timeouts, begrenzte Retries und die Wiederverwendung vorhandener
   Rohdaten definieren.
6. Prospekt-ID, Abrufzeit und Quelldateien fuer reproduzierbare Laeufe
   beibehalten.
7. Einen Qualitaetsbericht mit Seitenzahl, Kandidatenzahl, Match-Arten,
   Review-Gruenden und Warnungen erzeugen.
8. Verhalten bei fehlendem oder veraendertem PDF testen.
9. `npm test`, `npm run lint` und `npm run build` ausfuehren.
10. Einen kleinen lokalen Commit erstellen und dem User sagen, dass gepusht
    werden kann. Nicht selbst pushen.

## Wichtige Offene Entscheidungen

- Wie detailliert wird der interne Produktkatalog: generische Produkte,
  konkrete Varianten oder beides mit Hierarchie?
- Wie werden Katalogprodukte mit Standardmenge `Stk` behandelt, wenn reale
  Angebote in `g` vorliegen, zum Beispiel Butter, Brot und Kaese? Der aktuelle
  Optimizer betrachtet diese Einheiten noch als inkompatibel.
- Soll `Romatomaten` direkt `tomaten` sein oder spaeter eine Unterart mit
  Elternprodukt?
- Welche Preise gelten ohne Kundenkarte und welche nur mit Lidl Plus?
- Sind Prospekte fuer alle lokalen Filialen gleich oder muss die Region pro
  Markt aufgeloest werden?
- Wie werden regulaere Regalpreise erfasst, wenn ein Artikel nicht im Angebot
  ist?
- Welche NAS und welche Container-/Datenbankfunktionen stehen konkret zur
  Verfuegung?
- Wie werden zwei Personen spaeter authentifiziert und synchronisiert?

Diese Entscheidungen muessen nicht vor dem ProductMatcher beantwortet werden.
Der Matcher soll Match-Metadaten behalten, damit der Produktkatalog spaeter
verfeinert werden kann.

## Befehle

```bash
npm install
npm run serve -- --port 8080
npm test
npm run lint
npm run build
```

Lidl-Einzelschritte:

```bash
npm run discover:lidl
npm run normalize:lidl -- data/raw/offers/lidl/<timestamp>.json
npm run extract:lidl-pdf -- /pfad/zum/prospekt.pdf
npm run parse:lidl-offers -- \
  data/raw/offers/lidl/pdf-text/<prospekt>.bbox.html \
  data/normalized/flyers/lidl/<prospekt>.normalized.json

npm run promote:lidl-offers -- \
  data/normalized/offers/lidl/<prospekt>.candidates.json
```

Beide Befehle akzeptieren optional `--as-of YYYY-MM-DD` fuer reproduzierbare
historische Pruefungen. Ohne diese Option werden abgelaufene Angebote anhand
des heutigen UTC-Datums verworfen.

`pdftotext` aus `poppler-utils` ist fuer die PDF-Schritte erforderlich.
