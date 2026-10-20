# Kalibrace liquidu, 18. 9. 2026

Web a základní scéna Liquid Studia nyní sdílejí křivku, paletu, pořadí filtrů
a mapu turbulence podle pracovní AE kopie. Srovnávač obsahuje 181 okamžiků
0–6 s po 1/30 s v plném rozlišení 1920 × 1080.

- [Otevřít srovnávač](http://127.0.0.1:5173/public/liquid-compare.html)
- [Před / po ve stejném čase 3,033 s](../../public/liquid-compare/before-after.jpg)
- [Osm časů vedle sebe](../../public/liquid-compare/contact-sheet.jpg)
- [Původní audit a odkazy na podklady Drive](AUDIT.md)
- [Pracovní AE kopie](liquid-calibrated.aepx)

## Co se změnilo

Původní otevřený `liquid_base.aepx` měl duhovou Coloramu a Straight Zoom místo
pastelové palety a Scratch. Pozdější delivery obsahovalo správné typy efektů,
ale odlišnou koncovou křivku. Nová pracovní kopie má rekonstruovanou koncovou
křivku a paletu podle dvou závěrečných záběrů tutoriálu. Původní uživatelské
projekty v Documents se nemění. Jde o rekonstrukci, nikoli nalezený projekt autora.

Web místo původního deformovaného prstence vykresluje dvě spojené kubické
Bézierovy křivky s gradientovým tahem 259 px. Zachovává řetězec Wave Warp
Semicircle → Colorama → Fast Box Blur → CC Radial Blur Scratch → Turbulent
Displace. Tvar interpoluje do 3,6 s s easingem (0,6; 0; 0,4; 1), Evolution
roste lineárně 0–404° do 4,36 s. Poté se základní animace ustálí stejně jako AE.

Wave Warp a filtry se počítají živě. Turbulent Displace používá pole inverzních
souřadnic změřené na nativních 16bpc renderech dvou kolmých gradientů bez
ostatních efektů. Mapa obsahuje 240 × 135 × 45 vzorků po 0,1 s; poslední vzorek
zachycuje ustálený konec v 4,36 s. Čtvrtpixelová kvantizace a prostorové/časové
delta kódování dávají 1 619 724 B gzip pro souřadnice, plus malou masku platnosti.
JS soubor s base64 má přibližně 2,16 MB. Není to video hotového liquidu;
geometrie, paleta, kompozice, sklo a interakce zůstávají živé.

Zdrojové průchody používají 1920 × 1080 RGBA8, tři separovatelné box blury
s poloměrem 5 a 25 úhlových vzorků Scratch v rozsahu ±8°. Význam Scratch
jako obousměrného úhlového rozostření popisuje
[manuál výrobce Cycore](https://cycorefx.com/downloads/cfx_hd_std/CycoreFX%201.6%20Manual.pdf).
Nativní turbulence se aplikuje až na tento filtrovaný zdroj. Souřadnicová mapa
se na GPU interpoluje prostorově i časově; jemné odchylky na hranách zůstávají.

## Naměřené výsledky

Černé pozadí, bez skla a kurzoru, intenzita 100 %, struktura Studia 50 %,
žádné vlastní kreslené oblasti. Skutečné PNG renderů, nikoli ilustrační obrázky.

| Měření, 181 snímků | Původní web | Nový web / Studio |
|---|---:|---:|
| Průměrný překryv obrysů s novou AE kopií (IoU) | 27,83 % | **97,24 %** |
| Nejhorší snímek, IoU | 14,18 % | **95,55 %** |
| Průměrná absolutní chyba RGB v popředí, z 255 | 125,11 | **4,47** |
| Diagnostická chyba RGB v měkkých částech reference, z 255 | 86,16 | **7,54** |

Web a Studio mají v této sadě **nulový rozdíl ve všech 1 125 964 800 RGB
hodnotách** při původním rozlišení. Shodu zdrojových modulů navíc hlídá test.
Návrat na stejný čas dává identický výsledek a WebGL nehlásí chyby.

Změna sousedních snímků v aktivní části 0–4,367 s má průměr 8,72/255 v AE
a 8,53/255 na webu; korelace těchto změn je 0,9976. Jde o hrubou diagnostiku
časování, nikoli optický tok nebo procentní skóre pohybu.

IoU a RGB metriky používají 480 × 270 px po Lanczos zmenšení. Popředí je
max(R,G,B) > 16; RGB chyba se měří na sjednocení popředí obou variant.
Diagnostika okrajů používá referenční pixely s max(R,G,B) mezi 8 a 180,
takže zahrnuje i některé tmavší vnitřní barvy. Není samostatným skóre měkkosti.
Full-res snímky jsou dostupné pro vizuální kontrolu při zvětšení 100 %.

## Shoda s tutoriálem je samostatná otázka

| Záznam / kompoziční čas | Delivery před úpravou, IoU | Nová AE kopie, IoU | Nová AE RGB chyba |
|---|---:|---:|---:|
| 12:25 / přibližně 3,04 s | 50,52 % | **93,32 %** | 16,43/255 |
| 11:45 / přibližně 5,04 s | 55,58 % | **93,65 %** | 15,58/255 |

Tyto dva snímky sloužily také k odhadu křivky a palety: **nejde o nezávislou
validační sadu**. Výřez videa má 720 × 405 px a náhled AE je Quarter; pro toto
měření byl zmenšen na 480 × 270 bicubickým filtrem. Video používá 25 fps,
pracovní kompozice 30 fps dle dodaného PNG nastavení. Srovnání používá nejbližší
časy, s odchylkou 0,0067 s. Barevné hodnoty navíc ovlivňuje komprese záznamu.

**95% celková shoda s tutoriálem zatím není prokázaná.** Číslo 97,24 % popisuje
pouze obrysy webu proti rekonstruované AE kopii. Pro další krok je potřeba
porovnat také další nezávislé časy finální animace z tutoriálu, topologii otvorů,
lokální pohyb a full-res hrany; ideálním podkladem je originální projekt autora
nebo čistý render finální animace, které dodaná složka neobsahuje.

Vlastní tahy štětcem ve Studiu od verze 1.4.0 používají společnou paletu, filtry
a nativní mapu turbulence nad lokálními tvary vedenými tahem. Podrobnosti
a srovnání popisuje [přenos materiálu na štětec](../brush-calibration/README.md).
Procentní shoda s AE nad libovolnými tahy měřená nebyla; výše uvedená měření
nadále platí pouze pro základní scénu. Webové Generování má původní samostatný
generátor. Starší režim Originál
nadále přehrává dřívější video `puvodni-liquid.aep`, nejde o novou referenci.
Safari/iOS, Android a výkon na cílových telefonech zatím nejsou ověřené.

## Reprodukce a ověření

`calibrate-liquid-reference.py` sestaví pracovní AE a sdílenou JS definici
z uložených `fitted-filtered-path.json` a `fitted-palette.json`. Jejich opětovné
fitování je volitelné a vyžaduje SciPy. Souřadnicové mapy mají samostatné
provenance v `deformation-manifest.json`; změna parametrů turbulence vyžaduje
nové nativní sondy a opakování `build-liquid-deformation.py`.

```sh
python3 scripts/calibrate-liquid-reference.py
npm --prefix desktop run sync:shaders
python3 scripts/render-liquid-comparison.py
node scripts/capture-liquid-comparison.mjs
python3 scripts/analyze-liquid-comparison.py
npm run preview:build
```

Nativní export vyžaduje After Effects 2026 a FFmpeg; analýza Pillow a NumPy.
Původní sada `web-before/` a `studio-before/` zůstává zachovaná pro srovnání.
`capture-manifest.json` obsahuje hashe zdrojů i všech nových webových/studiových
PNG, `reference-manifest.json` hashe AE a tutoriálových podkladů. `metrics.json`
obsahuje výsledky po každém snímku. `tutorial-validation.json` odděluje kontrolu
tutoriálových záběrů od nativního srovnání.

Prošly kontroly syntaxe, 13 webových a 17 desktopových jednotkových testů,
sestavení samostatného HTML a plný integrační test Electronu: kreslení/guma,
struktura, deterministický seek, import, nastavení, crop, export 1080p/30 fps,
zrušení exportu se zachováním cíle a A/V synchronizace (pulz 799,38 ms při
očekávání 800 ms). Stejný integrační test prošel i nad hotovým lokálním balíčkem
s finálními zdroji. Nová kompletní sada 181 renderů ověřuje finální křivku,
paletu a časování. Aktualizovaný lokální balíček je v
`desktop/release/mac-arm64/Liquid Studio.app`.
