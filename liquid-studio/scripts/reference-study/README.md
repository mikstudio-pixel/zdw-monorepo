# Shoda reference a destilovaného modelu, 26. 10. 2026

Aktuální model rekonstruuje konkrétní prostorový vzhled a jeho vývoj v referenci,
nejen přibližnou rychlost proudění. Předchozí generátor měl na celém obrazu
výrazně jinou geometrii. Jeho celosekvenční SSIM kolem kapaliny bylo 0,3114.
Historie předchozího postupu a jeho omezení je v [README-v2.md](README-v2.md).

## Skutečný výsledek

Všech **804 skutečně vykreslených snímků**, stejný čas `i/30`, 960 × 540,
bez dodatečného posunu, registrace, změny měřítka či barevného dorovnání:

| Metrika kolem kapaliny | Předchozí | Nový model |
| --- | ---: | ---: |
| Průměrné SSIM | 0,311398 | **0,991401** |
| Průměrné SSIM 161 vynechaných snímků | 0,311452 | **0,990354** |
| Nejhorší SSIM | 0,254618 | **0,988254** |
| Průměrná absolutní RGB chyba, rozsah 0–255 | 76,8430 | **0,8194** |
| Průměrný překryv viditelné plochy IoU | 0,603443 | **0,994117** |
| Chyba změn mezi sousedními snímky, RGB 0–255 | 2,5202 | **0,8021** |

SSIM je míra strukturální podobnosti. **Není to procento identických pixelů
ani důkaz shodné fyziky.** Průměrné SSIM přesahuje 0,99; každý jednotlivý snímek
tuto hranici nepřekračuje. Výše uvedené hodnoty platí pro referenční kompozici
v uvedeném měřicím rozlišení, ne automaticky pro libovolnou uživatelskou masku
či nativní měření 1920 × 1080. Průměr celého obrazu včetně černého pozadí je
0,996926, ale pro rozhodování o kvalitě používáme přísnější oblast kapaliny.

## Deterministické porovnávání

`compare-frames.py` vyhodnocuje RGB SSIM s oknem 11 × 11, gaussovskými vahami
sigma 1,5 a konstantami K1=0,01, K2=0,03 pro rozsah L=1. Oblast porovnání je
sjednocení pixelů s maximální RGB složkou >5/255 v obou obrazech, rozšířené o
16 pixelů v souřadnicích 1080p. Prázdný černý generátor se tak neschová za
velkou černou plochu. Chyba časových rozdílů porovnává skutečné sousední RGB
změny, nikoli pouze průměrnou velikost optického proudění.

V reportu je výsledek každého snímku, rozdělení training/validation, reference
SHA-256, SHA-256 modelu i zdrojů rendereru, přesnost render targetu a prostředí.
Opakovaný seek 0 → 20 → 0 musí vrátit přesně stejné PNG. GPU test navíc ověřuje
seek 22,25 → 3 → 22,25 s nulovou pixelovou chybou.

Kontrolní měření metriky: identický obraz SSIM=1, černý výstup 0,1518, posun o
16 měřicích pixelů 0,4718 a chyba jednoho snímku 0,9730. Černý obraz by při
měření celého plátna dostal zavádějících 0,7056; proto samotný celkový průměr
nepoužíváme. Kontroly a jejich přesná čísla jsou v `metric-controls.json`.

Přepínač `--check` odmítne regresi, pokud průměrné SSIM kolem kapaliny nebo
validační SSIM klesne pod 0,99, nejhorší snímek pod 0,985, průměrné IoU pod
0,99, průměrná RGB MAE překročí 1,2/255 nebo MAE časových změn překročí 1/255.
Tyto meze aktuální výstupy splňují. RGBA8 náhradní cesta pro GPU bez podpory
renderovatelných half-float textur má nižší přesnost; uvedená hlavní čísla
pocházejí z ověřené RGBA16F cesty desktopového Chromia.

## Co přesně je naučené

`distill-appearance.py` dekóduje všechny snímky. Z fitu **vždy vynechá každý
pátý čas**, celkem 161 snímků; fit má 643 snímků. Zbývající data rozloží na
lokální prostorové POD/SVD báze a spojité kubické časové funkce. Překrývající
se intervaly se hladce spojují. Nejde o libovolný šum s doladěnými konstantami.

- `src/liquid-appearance.bin.gz`: přibližně **45,6 MB naučených parametrů**,
  včetně prostorových RGB/coverage bází. Po dekompresi mají 190,2 MB. Je to
  vizuální rekonstrukce obsahu konkrétní reference, nikoli obnovená fyzikální
  simulace. Model není menší než srovnatelně komprimované video a nemá být
  prezentován jako obecný fluid solver.
- `src/liquid-appearance-data.js`: metadata, reference/model hashe, časové
  uzly a bezpečné načtení lokálního souboru parametrů. Model neobsahuje MP4 ani
  sekvenci hotových kompletních výstupních snímků. Naučené RGB báze ale
  **obsahují vzhled reference**; nejde pouze o model rychlosti.
- `src/liquid-appearance.js`: WebGL rekonstrukce v kalibrační mřížce 480 × 270
  a Catmull-Rom převzorkování, výpočet časových koeficientů a obálky. Na GPU
  drží nejvýše dva aktivní intervaly. Upřednostňuje RGBA16F, při nepodporované
  half-float renderovací cestě používá RGBA8.
- Coverage/alfa je odhadnutá z videa s černým podkladem. Původní alfu tmavých
  míst nelze z této reference jednoznačně určit. Rekonstrukce RGB na černém
  podkladu je ověřená; původní přesná alfa nikoli.

V referenční studii se naučený materiál vykresluje přímo. V aplikaci se naučená
obálka převádí vůči vzdálenostnímu poli uživatelské oblasti. Maska stále řídí
umístění, velikost, gumování a morfování. Hluboký vnitřek masky se zachovává,
úzké kořeny zůstávají spojené a mimo pozorovanou část předlohy pokračuje
procedurální materiál s otvory. Uživatelská paleta nahrazuje naučené barvy;
jeden konstantní odstín stále dává pouze tento odstín. Předloha se nevkládá
jako obdélníkové video a každý tah není samostatná barevná vrstva.

Po posledním referenčním čase 26,7667 s přechází materiál během čtyř sekund do
procedurálního pokračování. Pokračování ve 45 a 120 s bylo testováno, ale
nemá další video, se kterým by šla ověřit jeho věrnost. Tento rozsah není
replikou neexistující další části reference.

## Integrace a ověření

- Desktop i web sdílejí `VideoRenderer`. Model kopíruje `sync-shaders.mjs`,
  webový build kopíruje binární parametry vedle `app.js`. Desktopový protokol
  povoluje právě tento konkrétní binární asset. Exportní worker má přístup
  pouze ke stejnému vlastnímu původu prostřednictvím `connect-src 'self'`.
- 33 desktopových jednotkových testů a kompletní desktopové E2E prošly,
  včetně GPU masek, dutin, prázdných oblastí, libovolných palet, gumování,
  keyframes, exportu, přerušení exportu, časování a offline přehrávání.
  Konektivita dominantní oblasti je 0,9973, opakování/pořadí tahů a seek mají
  nulovou chybu. Otvory zůstávají i v širokých krajových oblastech.
- Cílené webové kontroly `npm run test:material` prošly v desktopovém Chromiu.
  Skutečná aplikace v **Safari 26.5 na iPhone 17 simulátoru / iOS 26.5** také
  prošla PNG, 48snímkovým H.264 MP4 a dekódovaným přehráním. Události ukazatele
  jsou syntetické. **Fyzický iPhone nebyl testován.**
- Export má 1920 × 1080, 30 fps, přesná časová razítka a BT.709. Zvukový pulz
  je 799,375 ms při požadovaných 800 ms. Shoda PNG s nekomprimovaným exportem
  má MAE 0 v Chromiu a přibližně 0,245/255 v Safari simulátoru.
- Kompletní původní webové `npm test` má dřívější nesouvisející chybu:
  `flow.mjs` očekává PNG share při výchozím videu, jehož současná akce dává
  MP4; pád `file.arrayBuffer` byl reprodukován i před změnou rendereru.
  Uživatelské změny `web/src/flow.js` a `web/tests/flow.mjs` zůstaly zachované.

## Reprodukce

Z adresáře `liquid-studio`. Python nástroje používají samostatný venv se
závislostmi z `requirements-distill.txt`; nejsou závislostmi aplikace.

```sh
python scripts/reference-study/distill-appearance.py /absolute/reference.mp4 /absolute/work --output src
npm run sync:shaders --prefix desktop
LIQUID_MOTION=1 LIQUID_FRAME_COUNT=804 node scripts/reference-study/capture.mjs /absolute/reference.mp4 /absolute/output
python scripts/reference-study/compare-frames.py /absolute/reference.mp4 /absolute/output/motion /absolute/output/similarity.json --check
python scripts/reference-study/verify-similarity.py /absolute/reference.mp4 /absolute/output/similarity.json
python scripts/reference-study/render-comparison.py /absolute/reference.mp4 /absolute/output /absolute/previous-captures --ffmpeg desktop/node_modules/ffmpeg-static/ffmpeg
```

Volitelný `LIQUID_BASELINE=/absolute/snapshot` zachytí aplikaci před/po se
stejným vstupem, nákresy, paletou, časem, ořezem i měřítkem. Snapshot obsahuje
`desktop/{renderer,shared,vendor}`. `--serve` zapne živé porovnání na portu
56737; `?previous=1` ukáže předchozí generátor. Údaje pro aktuální snímek
pocházejí z celosekvenčního reportu, synchronizace používá
`requestVideoFrameCallback` a skutečný `mediaTime`.

Aktuální výstupy jsou v ignorovaném `web/test-results/reference-study-v3/`:
`similarity.json`, `before-similarity.json`, `metric-controls.json`,
`appearance-fit.json`, `capture.json`, srovnání a rozdíly snímků, celá animace
`reference-motion.mp4`, krátká animovaná ukázka `reference-motion.webp` a
porovnání skutečné aplikace `application-*.png`.

Původní reference zůstala beze změny. Nebyl proveden commit, push ani publikování.
