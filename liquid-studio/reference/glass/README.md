# Kalibrace Figma Glass — 15. 9. 2026

Zdrojový materiál: [Rectangle 3469025](https://www.figma.com/design/UNbVyy4hH7iewQzoiGvBGx/Zlin-Design-Week-2027?node-id=1929-1443).
Refraction 100, Depth 100, Dispersion 100, Splay 100, Frost 0; světlo −158° / 80 %.
Originální vrstva nebyla upravena.

Ve stejném souboru vznikly dvě oddělené pracovní kompozice:

- [Glass · kalibrace webu](https://www.figma.com/design/UNbVyy4hH7iewQzoiGvBGx/Zlin-Design-Week-2027?node-id=1930-1445): 512 × 512, mřížka po 32 px, tah 2 px, vektorové KE, sklo 256 × 256 uprostřed.
- [Glass · měření lomu](https://www.figma.com/design/UNbVyy4hH7iewQzoiGvBGx/Zlin-Design-Week-2027?node-id=1930-1467): stejná plocha s vodorovným černobílým gradientem. Vyexportované velikosti skla 128, 256 a 384 px; ve Figmě vráceno na 256 px.

Kopie skla mají pro izolaci optiky světlo 0 %, vypnutý Inner shadow, Texture a
Layer blur. Parametry Glass zůstávají 100 / 100 / 100 / 0 / 100. Exporty s
Disperzí 0 byly vytvořené jejím dočasným vypnutím. V pracovních kompozicích je
nyní opět 100. PNG jsou nativní exporty Figmy v měřítku 1×.

## Soubory

- `figma-grid-dispersion-{0,100}.png`: kontrolní mřížka; stejné soubory v
  `public/glass-reference/` používá webové srovnání.
- `figma-refraction-ramp.png`: přechod, kostka 256 px, disperze 0.
- `figma-dispersion-ramp.png`: přechod, kostka 256 px, disperze 100.
- `figma-dispersion-ramp-{128,384}.png`: přechod, další velikosti, disperze 100.
- `displacement-check.json`: odhad odchylky analytického modelu od naměřeného
  posunu každého kanálu. Jde o posun souřadnic, ne rozdíl finálních bitmap.

## Zjištění a kalibrace

Posun je radiální směrem ke středu čtverce, jeho velikost závisí na vzdálenosti
od nejbližšího okraje. Dva nezávislé lomy v osách X/Y nevytvářejí stejné oblouky.
Hloubka se nechová jako konstantní procento šířky; u většího skla se zakřivená
oblast dále nerozšiřuje úměrně celé kostce.

Použitá aproximace v referenčních pixelech:

```
depth = min(100, tileSize / 2)
curvature = max(1 - distanceToEdge / depth, 0) ^ 3.3
bend = -normalize(positionFromCenter) * depth * 1.045 * curvature
R/G/B displacement factors at dispersion 100 = 1.098 / 1 / 0.902
```

Šířka spektrálního pásma každého kanálu se integruje pěti vzorky s binomickými
vahami 1, 4, 6, 4, 1. Rozteč vzorků je 0,3 násobku rozestupu sousedních kanálů.
Křivka i disperze plynule zanikají ve středu. Odlesky se počítají zvlášť.

Pro měření posunu byl jas gradientu přepočten na souřadnici zdroje. Protilehlé
kvadranty se zprůměrovaly, aby se omezil vliv ditheringu. Vynechané jsou vnější
2 px s částečným krytím a směry s vodorovnou složkou menší než 0,2. Průměrná
absolutní odchylka vodorovného posunu je přibližně 0,7–1,1 px podle velikosti;
95. percentil 1,6–1,9 px. Samotné 8bitové měření má nejistotu přibližně 2 px na
stupeň jasu. Tyto hodnoty nejsou důkazem pixelové shody výsledného obrazu.

## Ověření

Na `http://127.0.0.1:5173/public/glass-check.html` běží produkční fragment.
Nahrazené je pouze rozmístění dlaždic jednou centrovanou kostkou a přepočet
pixelové velikosti; optika se nemění. Tlačítko „Ověřit shader“ provádí 12 kontrol
nad skutečným výstupem WebGL: klidný střed, nepřítomnost centrální disperze a
rozklad barev u obvodu pro tři velikosti, nulovou sílu, jednobarevný podklad a
chybový stav GL. V in-app prohlížeči prošly všechny. Vizuálně porovnána mřížka
s disperzí 0 i 100 a hlavní stránka s původním videem i procedurálním liquidem.

Rozdíly proti Figmě zůstávají v jemném filtrování hran a odlescích. Efekt je
kalibrovaná replika pro tento materiál, nikoli implementace všech parametrů
Figmy. Safari/iOS a mobilní výkon touto kalibrací ověřené nejsou.

## Porovnávací snímky — 17. 9. 2026

- `figma-vs-webgl-grid-and-ramp.png`: mřížka s KE a černobílý gradient;
  vlevo nativní Figma export, vpravo produkční WebGL shader. Každý panel má
  512 × 512 px a centrální sklo 256 × 256 px. Živá verze:
  `http://127.0.0.1:5173/public/glass-scenes.html`.
- `market/figma-vs-webgl-market.png`: původní návrh DESIGN MARKET se sklem
  `Rectangle 3469025`. Exportní výřez 512 × 512 px, viditelné sklo 258 × 254 px
  (původní obdélník je otočený o 90°). Živá verze:
  `http://127.0.0.1:5173/public/glass-market.html`.

Podklady pro WebGL jsou nativní exporty stejných scén s dočasně skrytým sklem,
uložené v `public/glass-reference/`. Viditelnost všech vrstev byla po exportu
obnovena. Figma výstup se sklem slouží pouze jako levý srovnávací panel,
nikdy jako vstupní textura shaderu. Snímky se skládají v prohlížeči v měřítku
1:1 bez dodatečné úpravy obrazu.

Sdílený `public/glass-compare-renderer.js` importuje produkční shader a mění
pouze rozmístění dlaždic na jednu centrální kostku a převod pixelů. Optika ani
hlavní aplikace nebyly při pořizování těchto snímků upraveny. Kalibrační scény
mají světlo i vedlejší efekty vypnuté. Původní plakát ve Figmě obsahuje navíc
Texture, Inner shadow a Layer blur; jejich vzhled není přesně replikovaný.

V prohlížeči bylo ověřeno vykreslení bez chyb WebGL. U plakátu se proti
čistému podkladu změnilo 55 155 pixelů uvnitř skla a 0 mimo něj; průměrná
absolutní odchylka od Figmy uvnitř skla činí 13,70/255 na RGB kanál. Mřížka
ukazuje ostřejší hrany a barevné pásy ve WebGL. Snímky dokumentují aktuální
shodu i zbývající rozdíly, nikoli pixelovou totožnost.

## Jemné změkčení materiálu — 17. 9. 2026

Produkční shader nyní vzorkuje každý lomený barevný kanál přes Gaussův filtr
3 × 3 s vahami `[1, 2, 1] × [1, 2, 1] / 16` a roztečí 1,25 referenčního px.
Jde o empiricky doladěné změkčení podkladu, nikoli další změnu geometrie lomu.
Funguje i při Frost 0; přídavný Frost se skládá součtem rozptylů. Nulová síla
skla základní změkčení vypíná. Pozadí mimo kostku se nefiltruje.

Nové snímky `figma-vs-webgl-grid-and-ramp-softened.png` a
`market/figma-vs-webgl-market-softened.png` zachycují tuto úpravu; starší PNG
zůstávají pro porovnání před/po. Na plakátu klesla průměrná odchylka proti
Figmě z 13,70 na 12,09/255 na RGB kanál. Žádný pixel mimo sklo se nezměnil.
Vedlejší efekty původního plakátu stále nejsou přesnou replikou Figmy.

Ověřeno: 15 GPU kontrol v `glass-check.html` (nově změkčení detailu při Frost 0,
ostrý podklad mimo sklo a při nulové síle), 13 Node testů, kontrola syntaxe
a sestavení samostatného náhledu. Vizuálně ověřené obě porovnávací scény,
plakát a hlavní aplikace v původním i procedurálním režimu s Frost 0 a 4 px.

## Ostřejší střed a kontrola rastru — 17. 9. 2026

Základní rozteč optického filtru nyní plynule roste z 0,45 px ve středu na
1,25 px u obvodu: `mix(.45, 1.25, smoothstep(0., .35, curvature))`. Geometrie
lomu ani rozestup RGB kanálů se nemění. Frost zůstává samostatný přídavný filtr.

`public/glass-quality.html` porovnává tentýž shader nad stejnou 512px texturou
v renderu 512 a 2048 px, se stejným rohem zvětšeným 4×. Ve vyšším rozlišení
jsou schůdky podstatně jemnější, což potvrzuje podíl rastru výstupního snímku.
Vyšší rozlišení nedoplňuje detail, který není přítomný ve zdrojové textuře.

Obě porovnávací stránky nyní vykreslují WebGL v 2× rozlišení při zachování
původních rozměrů scény a optiky. Figma reference je stále původní 1× export,
zvětšený na stejnou plochu; to je uvedené přímo na snímku. Exporty této verze
mají příponu `-refined-2x.png`. Při měření změněných pixelů se čistý podklad
vykresluje a zmenšuje stejným způsobem jako sklo, aby změna rastru nezkreslila
výsledek. Mimo kostku zůstává rozdíl nulový. Prošlo všech 15 GPU kontrol,
13 Node testů, kontrola syntaxe a sestavení samostatného náhledu.

## Doladění měkkosti a spektrálních špiček — 17. 9. 2026

Rozteč optického filtru je nyní 0,75 px ve středu a 1,4 px u obvodu. Světlý
příspěvek aberace se tlumí o 28 % proti nerozdělenému lomenému paprsku;
tmavé lemy zůstávají zachované. Jde o empirickou korekci kontrastu podle
referencí, nikoli o převzatý algoritmus Figmy. Na jednobarevném podkladu,
ve středu bez lomu a při vypnuté disperzi je tato korekce nulová.

Snímky `figma-vs-webgl-grid-and-ramp-matched-2x.png` a
`market/figma-vs-webgl-market-matched-2x.png` zachycují novou verzi. Měření
stejného obvodu mřížky (3–54 px od hrany) je uložené v `color-match.json`:
odchylka průměrné barevnosti klesla z +21,0 % na −1,0 % a odchylka jasu
z +6,5 % na +3,0 %. Barevnost je `max(RGB) − min(RGB)`, jas vážený průměr
kódovaných RGB hodnot; nejde o procento celkové vizuální shody. Průměrná
absolutní chyba ve středu mřížky klesla z 3,96 na 2,75/255. Na plakátu klesla
chyba uvnitř celé kostky z 12,97 na 12,56/255. Mimo kostku je rozdíl nulový.

Prošlo všech 15 GPU kontrol včetně konstantní barvy, nulové síly a klidného
středu, dále 13 Node testů, kontrola syntaxe a sestavení samostatného náhledu.
