# UI5 Basics Spickzettel

Dieser Spickzettel beschreibt nur die UI5-Konzepte, die in dieser App bereits vorkommen.

## Wer Laedt Wen?

```text
Browser oeffnet index.html
        |
        v
index.html laedt UI5
resources/sap-ui-core.js
        |
        v
index.html startet die Component
data-name="shoppingtool"
        |
        v
UI5 laedt Component.js
shoppingtool.Component
        |
        v
Component.js sagt:
metadata: { manifest: "json" }
        |
        v
UI5 liest manifest.json
        |
        v
manifest.json sagt:
rootView = shoppingtool.view.App
        |
        v
UI5 laedt App.view.xml
        |
        v
App.view.xml sagt:
controllerName = shoppingtool.controller.App
        |
        v
UI5 laedt App.controller.js
```

Kurz:

```text
index.html -> Component.js -> manifest.json -> App.view.xml -> App.controller.js
```

## Component, View, Controller

`Component.js` ist die App-Huelle. Hier setzen wir aktuell das zentrale `JSONModel`.

```js
this.setModel(new JSONModel({
  inputText: "",
  filter: "all",
  items: [],
  nextId: 1
}));
```

`manifest.json` ist die App-Konfiguration. Dort steht unter anderem, welche View die Haupt-View ist.

```json
"rootView": {
  "viewName": "shoppingtool.view.App",
  "type": "XML",
  "id": "app"
}
```

`App.view.xml` beschreibt die Oberflaeche und bindet Controls an Modeldaten.

```xml
<TextArea value="{/inputText}" />
<List items="{/items}">
```

`App.controller.js` reagiert auf Events und aendert das Model.

```js
var oModel = this.getView().getModel();
var sInput = oModel.getProperty("/inputText");
oModel.setProperty("/inputText", "");
```

## Wo Haengt Das Model?

```text
Component
  |
  +-- Default Model
  |
  +-- View
        |
        +-- Controller
        |
        +-- Controls
```

Die Component setzt das Default Model. Die View und ihre Controls koennen dieses Model verwenden. Der Controller holt es ueber die View.

```js
var oModel = this.getView().getModel();
```

## Binding: Absolut Und Relativ

Mit Slash bedeutet: absolut ab Model-Wurzel.

```xml
value="{/inputText}"
items="{/items}"
selectedKey="{/filter}"
```

Ohne Slash bedeutet: relativ zum aktuellen Binding-Kontext.

```xml
value="{name}"
selectedKey="{unit}"
```

Beispiel:

```js
items: [
  { name: "Butter" },
  { name: "Milch" },
  { name: "Brot" }
]
```

Die List ist an `/items` gebunden:

```xml
<List items="{/items}">
```

UI5 erzeugt fuer jedes Objekt im Array eine Zeile:

```text
Zeile 1: Kontext /items/0
Zeile 2: Kontext /items/1
Zeile 3: Kontext /items/2
```

Innerhalb einer Zeile bedeutet:

```xml
<Input value="{name}" />
```

je nach Zeile:

```text
/items/0/name
/items/1/name
/items/2/name
```

## Suggestions Sind Auch Binding

Das schnelle Produktfeld nutzt `sap.m.Input` mit UI5-Suggestions.

```xml
<Input
  value="{/quickProductText}"
  showSuggestion="true"
  suggestionItems="{/productCatalog}">
  <suggestionItems>
    <core:Item
      key="{key}"
      text="{name}" />
  </suggestionItems>
</Input>
```

Die wichtigen Teile:

```xml
value="{/quickProductText}"
```

bindet den aktuell getippten Wert an das Model.

```xml
suggestionItems="{/productCatalog}"
```

sagt UI5: Erzeuge Vorschlaege aus dem Array `/productCatalog`.

```xml
text="{name}"
```

ist wieder relativ zum jeweiligen Katalogeintrag.

Beispiel:

```js
productCatalog: [
  { key: "butter", name: "Butter" },
  { key: "milch", name: "Milch" }
]
```

Dann erzeugt UI5 intern Vorschlaege fuer `Butter` und `Milch`.

Der Katalog selbst liegt nicht direkt in der View. Er wird als UI5-Modul geladen.

```js
sap.ui.define([
  "shoppingtool/model/ProductCatalog"
], function (ProductCatalog) {
  // ProductCatalog ist der Rueckgabewert aus ProductCatalog.js
});
```

`ProductCatalog.js` gibt ein Array zurueck:

```js
return [
  { key: "butter", name: "Butter" },
  { key: "milch", name: "Milch" }
];
```

`Component.js` schreibt dieses Array ins Model:

```js
productCatalog: ProductCatalog
```

Danach kann die View es ueber einen Model-Pfad verwenden:

```xml
suggestionItems="{/productSuggestions}"
```

`/productCatalog` ist der komplette Katalog. `/productSuggestions` ist die aktuell angezeigte Trefferliste. Beim Tippen ruft das Input-Control das `suggest`-Event aus:

```xml
suggest=".onSuggestProduct"
```

Der Controller setzt dann neue Vorschlaege:

```js
oModel.setProperty("/productSuggestions", ProductSearch.search(aProductCatalog, sValue));
```

Die View muss nicht wissen, ob dahinter MiniSearch oder eine andere Suchlogik steckt.

Wichtig bei eigener Suchlogik:

```xml
filterSuggests="false"
```

Ohne diese Einstellung filtert `sap.m.Input` die Vorschlaege nach dem Tippen nochmal selbst. Das ist fuer Prefix-Suche okay, wuerde aber Fuzzy-Treffer wie `tomatn -> Tomaten` wieder ausblenden.

## Unser Datenfluss Beim Erkennen

```text
User tippt in TextArea
        |
        v
Model /inputText wird aktualisiert
        |
        v
User klickt "Erkennen"
        |
        v
Controller liest /inputText
        |
        v
ProductRecognition.parse(...)
        |
        v
Controller schreibt erkannte Artikel nach /items
        |
        v
List zeigt neue Zeilen
```

Wichtig:

```text
/inputText = roher Text aus der Eingabe
/items     = erkannte Einkaufsartikel
```

## UI5 Vokabeln

```js
this.setModel(oModel)
```

Setzt ein Model an eine Component, View oder ein Control.

```js
this.getView()
```

Controller holt seine View.

```js
this.getView().getModel()
```

Controller holt das Model der View.

```js
oModel.getProperty("/inputText")
```

Liest einen Wert aus dem Model.

```js
oModel.setProperty("/inputText", "")
```

Schreibt einen Wert ins Model. Gebundene Controls aktualisieren sich.

```js
this.byId("shoppingList")
```

Controller holt ein Control aus seiner View per XML-ID.

```js
oEvent.getSource()
```

Gibt das Control, das ein Event ausgeloest hat.

```js
getBindingContext()
```

Gibt den Datenkontext des Controls, zum Beispiel eine bestimmte Listenzeile.

```js
getPath()
```

Gibt den Model-Pfad des Kontextes, zum Beispiel `/items/2`.

```js
getBinding("items")
```

Gibt die Binding-Verbindung der `items`-Aggregation, zum Beispiel bei einer `List`.

## Merksatz

```text
View liest und zeigt Model.
Controller reagiert und aendert Model.
UI5 synchronisiert gebundene Controls automatisch.
```
