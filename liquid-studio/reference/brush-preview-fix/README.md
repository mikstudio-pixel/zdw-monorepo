# Oprava náhledu štětce · Liquid Studio 1.4.1

Editor zobrazoval přes zelený kanál vodicí mapy fialovou výplň celého tahu.
Současně odbarvoval samotný liquid. Průhledné otvory tak při kreslení vypadaly
vyplněné a vnější obrys tahu zůstával kruhový. Generátor ani potvrzený výstup
tuto výplň nepoužívaly.

Oprava odstraňuje obě operace z náhledu liquidu; kurzor má pouze obrys.
Označení vybraných kostek zůstává modré. Liquidový štětec má rozsah
480–1440 px a začíná na 480 px. Kostky a guma mají rozsah 20–480 px;
každý nástroj si během relace pamatuje vlastní velikost.

## Důkazy

- [Stejné tahy před a po](../../public/liquid-brush-preview/before-after.jpg):
  tečka a tah, průměr 480 px, čas 0,7 s, struktura 50 %, bez skla.
  Snímky pocházejí ze skutečného rendereru, původní implementace je archivovaná
  vedle tohoto souboru. `scripts/capture-brush-preview.mjs` reprodukuje snímky.
- [Manifest](../../public/liquid-brush-preview/capture-manifest.json) uchovává
  hashe zdrojů a snímků. Nový náhled a potvrzený snímek mají totožný hash;
  potvrzený výstup před opravou a po ní má rovněž totožný hash.
- [Test sestavené aplikace](packaged-test-report.json) prošel ve verzi 1.4.1.
  Kontroluje také skutečné tahy, minimum 480 px, přepínání velikostí, gumu,
  undo/redo, ukládání a export. Grafický test naměřil rozdíl náhledu liquidu
  při editaci a po potvrzení **0/255**. Náhled/export 1080p prošel s tolerancí
  pro ztrátové H.264; kontrola časování obrazu a zvuku rovněž prošla.
- Syntaxe a všech 17 jednotkových testů prošly.

Oprava nemění kalibraci materiálu z verze 1.4.0 ani nevytváří nové měření
shody s After Effects. Dřívější srovnávací videa zachycují své původní verze.
