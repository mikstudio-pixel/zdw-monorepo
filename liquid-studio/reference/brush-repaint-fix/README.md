# Kreslení po gumě a měřítko štětce · 1.5.0

Verze 1.4.1 opravila pouze fialový editační překryv. Při opětovném kreslení
po gumování však kladný tah nadále pouze odkrýval původní materiál uvnitř
kulaté stopy; stará guma ořezávala jeho přirozené přesahy. Druhá chyba byla
pevná maximální velikost generovaných tvarů: širší štětec přidával více malých
tvarů místo zvětšení jejich měřítka.

## Změna

- Kreslení po gumě začíná nový generativní průchod s vlastními tvary a bez
  zděděného ořezu. Dříve smazané části předchozích průchodů zůstávají smazané.
  Další guma působí na všechny dosavadní průchody. Tahy stejné velikosti mezi
  zásahy gumou sdílejí pole, nevzniká nový průchod pro každý pohyb kurzoru.
- Průměr štětce určuje měřítko tvarů, otvorů i záhybů. Štětce 480, 960 a
  1440 px mají měřítka v poměru 1 : 2 : 3, také při oříznutí tahem přes
  hranice plátna nebo v portrétním formátu.
- Nastavení ve formátu 4 ukládá jednotlivé průchody, průměry a komprimované
  masky. Starší formáty 1–3 lze načíst; staré průchody mají původní měřítko
  odvozené z masky. Limit souboru zůstává 2 MB, maximum je 64 průchodů.

## Srovnání skutečného výstupu

- [Liquid → guma → liquid, před / po](../../public/liquid-brush-repaint/repaint-before-after.jpg)
- [Stejný štětec 960 px, před / po](../../public/liquid-brush-repaint/size-before-after.jpg)
- [Nové velikosti 480 / 960 px](../../public/liquid-brush-repaint/sizes.jpg)
- [Manifest s nastavením a hashi](../../public/liquid-brush-repaint/capture-manifest.json)

Reprodukce: `node scripts/capture-brush-repaint.mjs`. Starý renderer a jeho
datové modely jsou archivované v `before/`; oba výstupy používají stejný
podklad, čas 0,7 s, strukturu 50 %, krytí 100 % a stejné souřadnice tahů.
Snímky nejsou generované ani retušované.

## Ověření

19 jednotkových testů a kontrola syntaxe prošly. Grafický test opakuje
gumování celého plátna a nový tah při 480 i 960 px; výsledek je pixelově
shodný s novým tahem na čistém plátně. Rozdíl zůstává **0/255** po undo/redo
i uložení/načtení. Nový liquid přesahuje kruhový tah o 93 170, resp.
234 056 viditelných pixelů v testovaném snímku.

Test skutečného editoru přepíná liquid → guma → liquid, mění velikost,
vrací a opakuje tah a ověřuje uložené průchody. Zahrnuje 1080p export,
porovnání náhledu/exportu, časování zvuku a obrazu a všechny formáty plátna.
[Výsledek testu sestavené aplikace](packaged-test-report.json).
