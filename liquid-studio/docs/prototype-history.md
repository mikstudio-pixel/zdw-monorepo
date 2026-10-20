# ZDW — liquid / glass study

Offline aplikace pro vlastní videa je v samostatné složce **desktop/**.
Spuštění, sestavení a export popisuje [návod k Liquid Studio](desktop/README.md).
Tento webový prototyp má nadále vlastní spuštění níže.

Aktuální [srovnání liquidu po snímcích](http://127.0.0.1:5173/public/liquid-compare.html)
obsahuje 181 časů před a po kalibraci podle tutoriálu. Nový režim **WebGL · AE**
a základní scéna Liquid Studia sdílejí stejný renderer. Proti pracovní AE kopii
dosahují průměrného překryvu obrysů 97,24 % (minimum 95,55 %); mezi webem
a Studiem nebyl v této sadě jediný rozdílný pixel.

[Kalibrace a meze měření](reference/tutorial/CALIBRATION.md) rozlišují shodu
webu s rekonstruovaným AE a shodu AE s tutoriálem. Druhá dosahuje 93–94 %
obrysů ve dvou záběrech použitých pro kalibraci, nikoli pro nezávislou validaci.
95% celkovou shodu s tutoriálem zatím netvrdíme. [Původní audit](reference/tutorial/AUDIT.md)
zachycuje stav před touto úpravou. Zdrojové uživatelské projekty zůstaly zachované.

Liquid Studio od **1.4.0** používá kalibrovanou paletu, filtry a deformaci i pro
vlastní tahy štětcem. [Přenos materiálu a stejné tahy před / po](reference/brush-calibration/README.md)
odděluje tuto adaptaci od měření celé referenční scény.
Verze **1.4.1** zobrazuje skutečné barvy a otvory i během kreslení, bez fialové
výplně tahu. Liquidový štětec má nově rozsah **480–1440 px**.
Verze **1.5.0** opravuje [kreslení po gumování a měřítko štětce](reference/brush-repaint-fix/README.md):
nové tahy mají vlastní generování bez starých řezů a větší štětec zvětšuje samotné tvary.
Verze **1.6.0** mění [gumu na mazání celých tahů liquidu](reference/liquid-object-eraser/README.md).
Každý nový tah od stisknutí po puštění myši je samostatný objekt.

## Spuštění

Vyžaduje Node.js (ověřena syntaxe na v24.13.0), žádné npm závislosti.

```sh
npm run dev
```

Otevřít http://127.0.0.1:5173. Server poslouchá pouze na localhostu a zpřístupňuje
jen testovací stránku, `src/` a `public/`, nikoli zdrojový AEP.

Alternativně `npm run preview:build` vytvoří samostatný
`preview/zdw-liquid.html` včetně vložených médií, který lze otevřít ručně v
prohlížeči bez serveru. `npm run dev` tento soubor také automaticky sestaví.
Při otevření `index.html` přes `file://` se stránka přesměruje na tento
samostatný náhled, aby se externí moduly nepokoušely načítat z lokálního originu.

## Pět režimů

- **Originál AE + WebGL sklo:** nativně vyrenderovaný `LIQUID EFFECT` se používá
  jako video textura. WebGL rekonstruuje průhlednost, mění pozadí a vykresluje
  skleněné čtverce s lokálním zvětšením, lomem obrazu a rozostřením. Malá deformace pod kurzorem
  je přidaná interakce; pro porovnání ji lze vypnout. Barvy/pohyb pocházejí z AE,
  sklo a rozložení dlaždic jsou pracovní webová interpretace.
- **WebGL · AE:** živá Bézierova křivka, Wave Warp, sedmibarevná pastelová paleta,
  tři průchody box bluru a úhlový Scratch blur. Turbulent Displace používá
  souřadnicovou mapu vyexportovanou z AE (1,62 MB komprimovaných dat), nikoli
  video hotového liquidu. Časování odpovídá pracovní AE kopii: po 4,36 s se
  základní animace ustálí, přehrávač skončí v 6 s a dovolí nové přehrání od nuly.
- **Generování:** pohyb myši nebo prstu ukládá začátky lokálních animací.
  Každá má vlastní čas od nuly, pevnou polohu a stejný základ turbulentního
  prstence a vlnění jako procedurální režim. Nejprve naroste, otevřou se v ní
  díry a nakonec se její stěny ztenčí a zaniknou. Sousední tvary se plynule
  propojují. Nevzniká maskováním globálně běžící vrstvy. Další zásah starší
  animaci neposune ani nerestartuje. Při rychlosti 1× každý vznik trvá 3 s;
  stojící kurzor nepřidává nové animace.
- **Rozhánění:** zachovaná původní varianta. Běžný procedurální liquid se
  odsouvá od tahu a ve středu zásahu také mizí pomocí průhlednosti. Lokální
  posun i odkrývání postupně dohasnou a liquid se vrátí.
- **Posouvání:** silnější posun stejného procedurálního liquidu bez masky
  průhlednosti. Výchozí síla posunu je 165 % původní deformace. Tři slidery
  nastavují sílu (0–300 %), velikost zásahu (poloměr 60–400 px ve zdrojovém
  prostoru o výšce 1080 px) a doznění (0,5–6 s při rychlosti 1×).
  Velikost ovlivní nové tahy, síla a doznění i stávající zásahy.
  Nastavení této varianty nemění původní Rozhánění. Obě jsou lokální deformace,
  nikoli fyzikální simulace zachovávající objem kapaliny.

Stránka načítá referenční video i při následném přepnutí na procedurální režim.
Tvrzení „bez videa“ se vztahuje k výpočtu obrazu tohoto režimu, nikoli k celkovému
síťovému provozu srovnávací stránky.

Všechny režimy sdílejí pauzu, rychlost, pozadí a nastavení skla. Generování,
Rozhánění a Posouvání mají místo časové osy indikátor „ŽIVĚ“ / „PAUZA“; pauza
zmrazí lokální animace i interakční mapu. Vypnutí „Reakce na kurzor“ zastaví nové zásahy,
stávající dohasnou. Přepnutí režimu, reset, změna rozlišení mapy nebo skrytí
plochy interakci vyčistí. Výběr interaktivního režimu spouští interakci, i když
byl předchozí režim pozastavený. Video přehrává pouze Originál; ostatní režimy
počítá procedurální shader.
Při `prefers-reduced-motion: reduce` začne animace pozastavená. Mimo viewport
nebo v neaktivní kartě se přehrávání a vykreslování pozastaví. Pro výpadek videa
je připravena statická textura; pro chybějící WebGL zůstávají referenční obrázky.

## Liquid glass

Materiál je kalibrovaný podle nativních exportů Figma Glass ze stejného projektu.
Na [srovnávací stránce](http://127.0.0.1:5173/public/glass-check.html) jsou vedle
sebe Figma a skutečný webový shader nad totožnou mřížkou. Disperzi lze přepínat
mezi 0 a 100 %, odlesky zapnout zvlášť a tlačítkem ověřit chování shaderu na GPU.
Podklady, nastavení a meze měření popisuje [kalibrace](reference/glass/README.md).

Lom směřuje ke středu kostky; vzdálenost od nejbližšího okraje určuje jeho sílu.
V rozích tak vznikají charakteristické oblouky. Zakřivení rychle a plynule klesá
směrem dovnitř, bez dodatečného posunu celé plochy. Naměřený profil pro
Refraction / Depth / Splay 100 aproximuje mocninná křivka s exponentem 3,3.
Hloubka dosahuje nejvýše 100 referenčních pixelů a u menší kostky poloviny její
šířky. Škálování bylo porovnáno s nativními kostkami 128, 256 a 384 px.

Výchozí zvětšení je **100 %**, Frost **0 px**, síla skla **100 %** a disperze
**100 %**. Zvětšení je samostatná, dobrovolná úprava celého podkladu pod sklem;
kurzor ho automaticky nemění. Síla skla má rozsah 0–200 %. Jemný vnitřní stín
a směrové odlesky jsou samostatnou webovou interpretací osvětlení. Odstraněný
je dřívější plošný světlý závoj ve středu.

I při Frost 0 má sklo jemné optické změkčení: devítivzorkový Gaussův filtr
s roztečí 0,75 referenčního pixelu ve středu, plynule rostoucí až na 1,4 px
v zakřiveném obvodu (σ přibližně 0,53–0,99 px). Vzorkuje každý
barevný kanál v jeho lomené souřadnici, takže změkčuje detail bez rušení RGB
rozkladu. Posuvník Rozostření přidává další blur; jeho rozptyl se s optickým
filtrem sčítá. Při nulové síle skla a Frost 0 se vrací ostrý podklad.

Chromatická aberace vychází ze stejného vektoru lomu. Červený kanál při 100 %
vzorkuje přibližně o 9,8 % dále, modrý o 9,8 % blíže než zelený. Pět vzorků
každého kanálu vytváří plynulejší lemy místo tří ostrých kopií hran. Rozestup
i šířka tohoto pásma mizí spolu se zakřivením. Jde o vzorkování původních RGB
pixelů, nikoli barevný překryv nebo nahrazení hran primárními barvami. Jednolitý
podklad proto chromatická aberace nepřebarví. Všechny režimy sdílejí stejné sklo.

Světlé špičky rozkladu jsou kalibrované proti Figmě: kladný rozdíl mezi
rozděleným a nerozděleným lomeným paprskem se tlumí o 28 %. Tmavé lemy zůstávají
zachované. Nejde o plošnou změnu sytosti či expozice: při nulovém lomu nebo na
jednobarevném podkladu jsou oba vzorky totožné a korekce je nulová.

[Dokumentace Figmy](https://help.figma.com/hc/en-us/articles/360041488473-Apply-effects-to-layers)
popisuje význam Refraction, Depth, Dispersion, Frost a Splay, ne interní shader.
Studován byl také [rozbor optiky Liquid Glass od kube](https://kube.io/blog/liquid-glass-css-svg/)
a [materiál Applu](https://developer.apple.com/videos/play/wwdc2025/219/).
Výsledný profil vychází z měření Figmy; není převzatým kódem jejího rendereru.
Drobné rozdíly ve filtrování hran a osvětlení zůstávají. Pixelovou shodu celé
kompozice ani shodu s rendererem iOS netvrdíme.

## Historický podklad `puvodni-liquid.aep`

Následující parametry platí pro starší režim **Originál**, ne pro aktuální
kalibraci `LIQUID - tutorial` popsanou výše.

Projekt obsahuje 48 kompozic. Výchozí studovaná kompozice `LIQUID EFFECT` (ID 52)
má rozlišení 1920 × 1080 a 25 fps. Její hlavní viditelný zdroj je elipsa
o průměru 506 px s gradientovým tahem šířky 234 px. Další tvary jsou v datech
uložené, ale část skupin je vypnutá.

Řetězec efektů v této kompozici:

| Efekt | Uložené hodnoty |
| --- | --- |
| Wave Warp | Semicircle, výška 100, šířka 242,5, rychlost 0,22 |
| Colorama | vlastní Output Cycle |
| Fast Box Blur | poloměr 5 |
| CC Radial Blur | Amount 8 |
| Turbulent Displace | Displacement 2, Amount 346, Size 93, Complexity 1,63, Evolution 295°, Seed 0 |

`LANDING PAGE` obsahuje několik odlišných pokusů se sklem, včetně CC Glass.
Není totožná s variantami `INSTAGRAM`. Například `wdd_insta` má 23 malých
čtvercových adjustment vrstev, zdrojově 146 × 146 px při měřítku 50 %:
Brightness 50, Contrast −100, Fast Box Blur 4, Transform Scale 110 %.
Jejich souřadnice jsou v `reference/grid-layout.json`.
Defaultní hodnoty efektů, které nejsou v binárním AEP explicitně uložené,
samotný inspekční skript nerekonstruuje.

## Proč nezačínat forkem fluid simulation

[PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
je simulátor proudění s advekcí, tlakem a vířivostí. Projekt má
[MIT licenci](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/LICENSE).
Je použitelný jako základ interakce kapaliny s kurzorem, ale jeho dynamika sama
nezopakuje původní řetězec AE efektů. Jeho kód v tomto prototypu použit není.

Aktuální kalibrace přenáší jednotlivé průchody a pro Turbulent Displace používá
měřenou souřadnicovou mapu. Starší režim Originál nadále demonstruje video texturu.

## Starší referenční exporty režimu Originál

- `public/assets/liquid-packed.mp4`: 114 snímků / 4,56 s / 25 fps. Horní polovina
  je premultiplied RGB, spodní polovina alfa v odstínech šedi. H.264, CRF 17,
  1920 × 2160, 931 865 B. Vlastní alfa dekódování se vyhýbá závislosti na podpoře
  videokodeků s alfa kanálem. Barevná a alfa data jsou ztrátově komprimovaná.
- `public/assets/liquid-packed.png`: bezztrátový první snímek stejného formátu.
- `public/assets/landing.png`: nativní reference LANDING PAGE v čase 2,40 s.
- `public/assets/grid.png`: nativní `wdd_insta` v čase 2,00 s, bez nedostupného videa.

Krátký výřez se opakuje. Je blízko periodě Wave Warp `1 / 0,22 ≈ 4,545 s`, ale
není ověřen jako dokonale bezešvý loop. Do produkce je třeba upravit vzorkování
periody. Reference s textem používají náhradní fonty, protože původní fonty
nejsou dostupné. V pracovní kopii gridu je vypnutá pouze vrstva 665, která
odkazuje na chybějící externí video; tvar, barvy a efekty byly zachovány.

Aktuálním cílem režimu WebGL je kompozice `LIQUID - tutorial`. Její měření
neplatí pro starší video uvedené v této sekci ani pro vlastní tahy štětcem.
Safari/iOS a Android zde zatím nejsou ověřené.

## Soubory a opakování analýzy

- `src/renderer.js`: WebGL 2, zdrojová scéna, kompozice a sklo.
- `src/liquid-source.js`: živá křivka, Wave Warp, paleta a filtry před turbulencí.
- `src/liquid-definition.js`: sdílené body křivky, paleta a časování.
- `src/liquid-deformation.js`: generovaná souřadnicová mapa nativní turbulence.
- `src/shaders.js`: zdroj obrazu a skleněný efekt.
- `src/main.js`: ovládání, časování, přehrávání a lifecycle.
- `src/liquid-births.js`: lokální animace s nezávislými hodinami; vzdálenostní
  vzorkování tahu nezávislé na četnosti pointer událostí. Nejvýše 48 současných
  vzniků; při zaplnění se nové přeskočí, staré se nechají doběhnout.
- `src/pointer-field.js`: pevná mapa lokálních zásahů pro obě varianty rozhánění.
  Mapa má 128 řádků, šířku dle poměru stran (max. 384), ve WebGL lineárně
  filtrovanou RGBA8 texturu. Prázdná mapa se znovu nepočítá ani nenahrává.
- `scripts/inspect-aep.py`: read-only orientační inspekce RIFF struktury AEP.
- `scripts/prepare-reference.py`: vytvoření pomocné kopie bez chybějícího videa.
- `scripts/render-references.py`: reprodukovatelný nativní export a konverze.

```sh
npm run check
npm test
python3 scripts/inspect-aep.py
python3 scripts/render-references.py
```

Poslední příkaz vyžaduje instalovaný After Effects 2026 a ffmpeg. Generované
mezisoubory v `reference/` mohou zabírat stovky MB. Původní AEP se nemění.

## Stav ověření (14. 9. 2026)

- Nativní exporty AE byly úspěšně vyrenderované; snímky liquidu, LANDING PAGE
  a gridu byly vizuálně prohlédnuté.
- `npm run check` a sestavení samostatného HTML prošly.
- Testy interakční mapy ověřují setrvání starých zásahů na místě, kontinuitu
  rychlého tahu, úplné dohasnutí bez pohybu, oddělení tahů po návratu na plochu,
  posun do obou stran, pauzu, reset a konzistentní dohasnutí při různých FPS.
- Testy lokálních vzniků ověřují nezávislé hodiny, ukotvení, opakovaný zásah,
  časování při různých FPS, vzorkování rychlých tahů, pauzu, reset a limit počtu.
  Testy mapy ověřují také nastavení velikosti a doznění.
- GPU kontrola Generování při stejném globálním čase potvrzuje růst plochy
  mezi lokálními časy 0,12 a 0,65 s i další změny obrysu a děr do 1,20 s.
  Samotná změna globálního času nezmění žádný pixel. Oddělený nový vznik
  neovlivní starší animaci při stejném lokálním stáří. Po skončení všech
  animací obraz přesně odpovídá prázdnému pozadí. Režim byl vyzkoušen tahem
  v prohlížeči i se sklem.
- GPU porovnání Posouvání při pevném čase 2,44 s: při síle 165 % vzniklo
  v původně prázdném okolí zásahu 37 993 barevných pixelů; zachované původní
  Rozhánění se stejným tahem jich vytvořilo 3 203. Kontrola proběhla na
  plátně 1280 × 800 bez skla. Posouvání s nulovou silou, bez zásahu i po
  úplném doznění přesně odpovídá procedurálnímu režimu. WebGL nehlásil chyby.
- Upravená disperze byla porovnána při 0 a 100 % na skutečné textuře, světlém
  i tmavém pozadí a s frostem 0/4 px. GPU kontrola konstantní barvy a nulové
  síly skla vrací mezi 0/100 % aberace shodné pixely. Výrazný rozsah byl vizuálně
  porovnán vedle varianty bez aberace při výchozí velikosti kostek 146 px,
  včetně zvětšeného detailu; shader nemá prahování nebo přepínání barevných masek.
- ffprobe potvrdil rozlišení, kodek, 25 fps a délku 4,56 s.
- SSIM zkomprimované video textury proti stejnému nativnímu exportu po konverzi
  na YUV420: 0,999483 přes všech 114 snímků. Toto měří jen kompresi textury,
  nikoli shodu shaderu nebo skla s AE.
- Náhled nyní běží na http://127.0.0.1:5173 a byl vizuálně ověřen ve vestavěném
  prohlížeči: CSS, oba referenční obrázky, video textura, kompilace WebGL shaderů,
  přepnutí na procedurální režim, změna pozadí a pauza fungují. Konzole bez chyb
  a varování. Toto ověřuje funkčnost prototypu, nikoli jeho shodu s AE.
- Přímé otevření `file://` nelze v automatizovaném prohlížeči ověřit kvůli jeho
  URL politice. Sestavený HTML náhled má vložené CSS, JS i všechna média;
  přesměrování z `index.html` je do něj záměrně vynechané, aby nevznikla smyčka.
