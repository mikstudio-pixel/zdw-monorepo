# Guma maže celé tahy · Liquid Studio 1.6.0

Jeden nový tah od stisknutí po puštění myši je samostatný objekt. Guma jej
odstraní celý, jakmile zasáhne jeho viditelnou část. Výběr používá skutečnou
animovanou alfu, takže funguje i na přesazích mimo vodicí stopu a na oddělených
kapkách. Dlouhý pohyb gumy může odstranit více tahů. Ostatní tahy se nemění;
částečné výřezy už nevznikají. Kostky se nadále mažou po celých buňkách.

Formát nastavení 4 již umí uchovat samostatné průchody, proto se nemění.
Ve starších souborech ale mohou být původní tahy sloučené do jednoho průchodu.
Takový průchod se maže jako jediný objekt; hranice jednotlivých gest nebyly
uložené a nelze je spolehlivě rekonstruovat. Nově kreslené tahy zůstávají
samostatné včetně tahů stejné velikosti, i po uložení/načtení a undo/redo.

## Skutečné srovnání

[Před / po při stejném zásahu gumy](../../public/liquid-object-eraser/before-after.jpg)
ukazuje stejnou výchozí kompozici dvou tahů, čas 0,7 s, štětec 480 px a
gumu 160 px na shodných souřadnicích. Levý zasažený tah se nově odstraní celý,
pravý zůstává beze změny. Výchozí obrazy starého a nového rendereru mají
shodné pixely. [Manifest](../../public/liquid-object-eraser/capture-manifest.json)
obsahuje hashe a přesné parametry.

Reprodukce: `node scripts/capture-liquid-object-eraser.mjs`. Původní renderer
a datové modely z verze 1.5.0 jsou archivované v `before/`.

## Ověření

- 20 jednotkových testů: hranice gest, souvislé rychlé tahy, odstranění celého
  objektu, zachování druhého, prázdné místo, undo a uložené soubory.
- Grafické testy v 16:9, 9:16 a 1:1: zásah do přesahu odstraní právě jeden
  celý objekt; druhý je pixelově shodný se samostatným renderem. Rozdíl po
  undo/redo a uložení/načtení je 0/255 ve všech formátech.
- Skutečný editor: dvě gesta stejné velikosti, guma, undo/redo, další kreslení,
  uložení a načtení, následný export MP4 a kontrola synchronizace obrazu/zvuku.
- [Protokol sestavené aplikace](packaged-test-report.json).
