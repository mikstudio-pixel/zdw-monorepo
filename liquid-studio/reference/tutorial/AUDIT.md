# Liquid: kontrola reference a výchozí srovnání, 18. 9. 2026

## Závěr

Otevřený `liquid_base.aepx` **není shodný s tutoriálem**. Má výchozí duhovou
Coloramu a CC Radial Blur typu **Straight Zoom**, zatímco tutorial ukazuje vlastní
pastelovou paletu a **Scratch**. Pozdější `liquid_delivery.aepx` mění paletu a
Radial Blur na Scratch, ale jeho animovaná křivka se stále liší od videa.
Ani tato varianta proto není ověřenou referencí s 95% shodou.

Původní soubory v Documents nebyly změněny. V této složce jsou jejich pracovní
kopie. `liquid-delivery.aepx` je již existující pozdější varianta, nikoli nově
vytvořená nebo schválená oprava.

## Podklady

- [Složka TUTORIÁL na Drive](https://drive.google.com/drive/folders/1mmMIT1qOFB7Iqno2qTjPoJCrlB7b45AQ).
- [Nastavení kompozice](https://drive.google.com/file/d/1ag2cUoDHenbcgOoiYe-Bo9Wv70gwBqNN/view).
- [Pořadí a nastavení efektů](https://drive.google.com/file/d/1LOWnsk_NYq2DlptHjYoRCpv23VyrQZse/view).
- [Video tutorial_liquid.mp4](https://drive.google.com/file/d/1b6xmsw6JlkKY3WjT83xMNFeQhgnn3h-j/view).

Video bylo načteno přes připojený Google Drive a staženo pro rozbor. Má 1900 ×
1018 px, 25 fps a 769,4 s. Jedná se o záznam uživatelského rozhraní, nikoli čistý
export animace. Ve složce není původní AEP autora tutoriálu.

Obě PNG stažená z Drive mají shodný SHA-256 s místními podklady z 6. září. SHA-256
místních pracovních souborů je uložen v `public/liquid-compare/reference-manifest.json`.

## Ověření nastavení

| Položka | Tutoriál | Otevřený base | Pozdější delivery |
|---|---|---|---|
| Pořadí efektů | Wave Warp → Colorama → Fast Box Blur → CC Radial Blur → Turbulent Displace | Shodné | Shodné |
| Wave Warp | Semicircle, výška 89, šířka 222, rychlost 0 | Shodné uložené hodnoty | Shodné |
| Colorama | Vlastní pastelový Output Cycle | Výchozí duhový cyklus | Vlastní 7bodová aproximace palety |
| Fast Box Blur | Radius 5 | 5 | 5 |
| CC Radial Blur | Scratch, Amount 8 | **Straight Zoom**, Amount 8 | Scratch, Amount 8 |
| Turbulent Displace | Bulge, Amount 346, Size 93, Complexity 1,6 | Shodné uložené hodnoty | Shodné |
| Základní geometrie | Otevřená animovaná křivka, gradientový tah 259 px | Otevřená animovaná křivka, tah 259 px; odlišné výsledné rozložení | Stejná geometrie a animace jako base |
| Kompozice | PNG: 1920 × 1080, 30 fps, 90 s | 1920 × 1080, 30 fps, 90 s | Shodné |

Video přitom v časové ose ukazuje **25 fps**. Samostatný obrázek nastavení
kompozice ukazuje **30 fps**. Tyto dodané podklady nejsou v tomto bodě totožné;
30 fps pracovního AE odpovídá PNG, nikoli časové ose záznamu. Časy mezi nimi
porovnáváme v sekundách, nikoli stejným číslem snímku.

XML umožňuje spolehlivě přečíst uvedené explicitně uložené hodnoty a paletu.
Tato kontrola netvrdí shodu všech implicitních defaultů, easingů ani ručně
nakreslených bodů. Barvy delivery jsou aproximace z předchozího pracovního
skriptu `finalize_project.py`, ne původní data Coloramy autora.

V čase záznamu **12:25** je v kompozici přibližně **3,04 s** (3:01 při 25 fps).
Porovnání s nejbližším nativním snímkem **91 / 30 = 3,033 s** ukazuje výrazně
jinou spodní levou část a rozmístění otvorů. Rozdíl 0,0067 s tuto odchylku
nevysvětluje. V reportu je původní výřez kompozice 720 × 405 px vedle nativních
renderů zmenšených na stejnou velikost, bez posouvání či natahování jednotlivých
tvarů. Náhled videa používá Quarter; nelze z něj přesně kalibrovat Full-res blur.

## Co bylo připraveno

[Srovnávač](http://127.0.0.1:5173/public/liquid-compare.html) obsahuje **724 PNG**:
181 snímků každé ze čtyř variant (AE base, AE delivery, web, Studio), 0–6 s
včetně, po 1/30 s. Všechny mají 1920 × 1080 px a černé pozadí. Web a Studio jsou
bez skla, bez zásahu kurzoru, s opacity 100 %; Studio používá strukturu 50 a
žádné kreslené oblasti. PNG jsou skutečné výstupy nativního AE a WebGL rendererů.

V obou AE variantách se posledních 50 snímků (od snímku 131, tedy 4,367 s)
shoduje beze změny. Sekvence proto pokrývá aktivní počáteční animaci i její
ustálený konec. Není to export celé 90sekundové kompozice.

Srovnávač má krokování, časový kód, číselný výběr snímku, přehrání, překryv,
rozdílový obraz, posuvné srovnání, 100% zobrazení a poznámky ke konkrétní dvojici
a snímku. Poznámky ukládá pouze do localStorage tohoto prohlížeče a umožňuje
jejich export do JSON. Při pomalém načítání přehrávání přeskakuje snímky podle
hodin, aby zachovalo rychlost 30 fps; jednotlivé kroky žádný snímek nevynechají.

## Výchozí měření a jeho meze

- Web vs. Studio: největší rozdíl **1/255** v kanálu. Z 1 125 964 800 RGB hodnot
  se lišilo 2 035; průměrná absolutní chyba je 0,000001807/255. Platí pro výše
  popsané základní nastavení, nikoli pro všechny režimy a kreslené oblasti.
- Zdroj `src/shaders.js` a `desktop/vendor/shaders.js` má shodný SHA-256.
- Výchozí web vs. AE base: průměrný překryv siluet IoU **22,37 %**.
- Výchozí web vs. AE delivery: průměrný překryv siluet IoU **22,97 %**.
- IoU je diagnostika obrysů, **nikoli procento celkové vizuální shody**.
  Masky používají max(R,G,B) > 16 a analytické rozlišení 480 × 270 px. Metriky
  RGB používají sjednocení popředí, takže velké černé pozadí nevylepšuje výsledek.
- Pohybová metrika v JSON je absolutní změna sousedních snímků, nikoli optický
  tok. Měkkost okrajů je nyní podložena Full-res snímky pro vizuální posouzení,
  nemá vlastní ověřené procentní skóre.

Současný web vytváří deformovaný prstenec, používá vlnu s rychlostí 0,22 a
vlastní šum. Tutorial má rychlost Wave Warp 0 a pohyb vzniká změnou křivky a
Evolution. Stávající tříbarevná paleta a jediný smoothstep pro okraj nenahrazují
řetězec Colorama → Box Blur → Scratch → Turbulent Displace.

## Další kalibrace

1. Sjednotit AE křivku, její keyframy/easing a Evolution s finální částí tutorialu.
   Pro přesnou referenci by byl nejspolehlivější původní AEP autora; zde není.
2. Vizuálně ověřit toto nativní AE jako referenci a proti němu zamknout snímky.
3. V hlavním webovém rendereru přenášet zdrojovou křivku, deformaci, paletu a
   filtry po jednotlivých krocích. Po každém kroku znovu vyexportovat celou sadu.
4. Při přenosu do Studia použít existující `npm --prefix desktop run sync:shaders`
   a měřit shodu obou rendererů. Další nastavení a kreslené oblasti rozšířit do
   samostatných fixture scén; nemíchat je do základního srovnání.

Cíl 95 % je zatím kvalitativní cíl uživatele. Není dosažen ani nahrazen jedním
souhrnným skóre. Vedle obrysů je nutné samostatně posuzovat topologii otvorů,
rychlost/deformaci, rozložení barev a okraje v celé sekvenci.

## Opakování

```sh
python3 scripts/render-liquid-comparison.py
node scripts/capture-liquid-comparison.mjs
python3 scripts/analyze-liquid-comparison.py
node scripts/serve.mjs
```

Analýza vyžaduje Pillow a NumPy (zde použit Python dodaný Codex runtime).
Capture používá již instalovaný Playwright z `desktop/node_modules` a izolovaný
headless Chrome; nepřistupuje k uživatelskému profilu. Volitelnou cestu k browseru
lze zadat přes `LIQUID_BROWSER`. `capture-manifest.json` obsahuje hashe zdrojů,
všech webových snímků a verzi prohlížeče. Návrat na čas 0 byl ověřen jako
deterministický u obou rendererů; WebGL nehlásil chyby.

Kontrola syntaxe projektu a všech 13 stávajících testů prošla. Shader ani původní
AE nebyl v této etapě přepsán; byly přidány reprodukovatelné podklady a nástroj
pro následující porovnávání.
