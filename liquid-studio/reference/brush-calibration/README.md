# Kalibrovaný materiál pro vlastní tahy — Liquid Studio 1.4.0

Štětec nyní používá pastelovou paletu a efektový řetězec z kalibrovaného webu.
Původní tříbarevný generátor a jeho vlastní šum byly v kreslené vrstvě nahrazené.
Náhled i export používají shodné vykreslení.

- [Video stejného tahu před a po](http://127.0.0.1:5173/public/liquid-brush-video.html)
- [Snímek 0,70 s před / po](../../public/liquid-brush-compare/before-after.jpg)
- [Stejný tah při struktuře 0, 50 a 100 %](../../public/liquid-brush-compare/structure.jpg)
- [Aplikace](../../desktop/release/mac-arm64/Liquid%20Studio.app)

## Přenos vzhledu

Tah nadále určuje rozmístění, velikost a hustotu lokálních tvarů; guma maže
i přesahy bez přemísťování zbytku kompozice. Zdrojová geometrie těchto tvarů
je prstenec, nikoli pevná tutorialová křivka. Sedmibarevná paleta pochází přímo
ze společného `referencePalette`. Rozpětí radiálního gradientu je přizpůsobené
menšímu zdroji (525 px), aby obsahoval modré, žluté i korálové plochy.

Zdroj prochází statickým Semicircle Wave Warp se stejným profilem jako web,
Coloramou, třemi box blury a úhlovým Scratch ±8°. Filtry zajišťuje společný
`LiquidSource`; filtruje přednásobené RGB i alfu. Teprve potom každý lokální
tvar vzorkuje nativní inverzní mapu Turbulent Displace. Stabilní natočení a
fáze omezují opakování stejného motivu podél tahu.

Pro dlouhé klipy se nativní interval 0–4,36 s prochází hladce tam a zpět:
`2.18 * (1 - cos(time * 0.42 + phase))`, perioda přibližně 14,96 s. Na obratu
je rychlost nulová, takže nevzniká skok. Jde o adaptaci pohybu pro vlastní
tahy; netvrdíme, že libovolná kresba je 95% kopií původní AE kompozice.

Překryvy se skládají sjednocením alfy a váženou barvou. Vyšší struktura
uzavírá vnitřní otvor zdroje, jeho vnější obrys zůstává stejný. Jemná struktura
dál vytváří více menších tvarů. Uložené tahy, masky gumy a formát nastavení
se nemění; starší soubory po načtení používají nový vzhled.

## Ověření

181 dvojic skutečných renderů, 1920 × 1080, 30 fps, čas 0–6 s. Identický tah
z (0,2; 0,58) do (0,8; 0,4), průměr 300 px, struktura 50 %, intenzita 100 %,
bez skla, pozadí RGB (24, 29, 26). Zdroj před úpravou je archivovaný v
`video-renderer-before.js`, hashe obou rendererů a snímků v
`public/liquid-brush-compare/capture-manifest.json`. Návrat na čas 0 dává
u obou verzí identický obraz. Přehledy a video zachovávají stejné měřítko a čas.

Finální **sestavená aplikace** prošla celým Electron E2E testem včetně:

- Kreslení, gumy na přesazích, undo/redo, potvrzení/zrušení a uložení/načtení.
- Opakovatelného seeku (nulový rozdíl), spojování tvarů, otvorů a přesahů.
- Pokračujícího pohybu v časech 20,7 a 21,7 s.
- Skládání měkkých hran nad černým a bílým videem (odchylka alfy mezi RGB
  kanály nejvýše 1/255), všech tří barevných rodin.
- Struktury: 63 / 22 / 8 měřených otvorů pro 0 / 50 / 100 %; 50 a 100 %
  mají stejné krajní souřadnice. Kontrolní tah při změně posuvníku zůstává stejný.
- Náhledu 30 fps při struktuře 0 a 72 %, exportu 1080p se 48 snímky,
  porovnání náhledu/exportu, zrušení exportu, portrétu a čtverce.
- A/V pulzu v 799,38 ms (očekáváno 800 ms), offline přehrávání.

Prošlo i 17 desktopových a 13 webových jednotkových testů, kontrola syntaxe,
sestavení samostatného webového HTML a lokálního macOS balíčku 1.4.0.
Podrobné výsledky jsou v `packaged-test-report.json`.

Základní scéna bez vlastních oblastí byla zkontrolovaná na snímcích 0, 91
a 180. Web se nezměnil; Studio se liší nejvýše 1/255 v 7–9 kanálech na snímek
z 8 294 400 RGBA hodnot. Jde o zanedbatelnou numerickou odchylku upraveného
shaderu. Původní sada 181 snímků a její naměřené výsledky z verze 1.3 jsou
zachované; nové sondy jsou odděleně v `public/liquid-brush-compare/base-regression/`.

## Opakování

```sh
npm --prefix desktop run sync:shaders
node scripts/capture-brush-comparison.mjs
python3 scripts/render-liquid-comparison-video.py --brush
npm --prefix desktop test
npm --prefix desktop run pack
LIQUID_TEST_EXECUTABLE="$PWD/desktop/release/mac-arm64/Liquid Studio.app/Contents/MacOS/Liquid Studio" npm --prefix desktop run test:e2e
```

Capture používá izolovaný Chrome a projektový Playwright, nikoli uživatelský
profil. Video vyžaduje FFmpeg. Nový materiál se nesnaží nahradit webové lokální
Generování; tento režim má vlastní životní cyklus a zůstává samostatný.
