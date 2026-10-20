# Liquid Studio pro web

Stávající desktopové ovládání a shodné WebGL 2 efekty, lokální export přes WebCodecs.
Video se zpracovává v prohlížeči; server pouze poskytuje soubory aplikace. Electron
ani FFmpeg se při webovém importu či exportu nepoužívají. Dotykové rozhraní zatím
není upravené; na iPhonu je pro současné rozložení vhodnější orientace na šířku.

## Spuštění

```sh
cd liquid-studio/web
npm ci
npm run dev
```

Otevřete `http://localhost:4173`. V iOS simulátoru je dostupný stejný localhost.
Na fyzickém telefonu vyžadují WebCodecs HTTPS; samotná LAN adresa přes HTTP nestačí.
Pro nasazení spusťte `npm run build` a poskytujte obsah `dist/` přes HTTPS.
Balíček obsahuje všechny závislosti, bez CDN. Zpracování již načtené aplikace
funguje bez sítě; instalace PWA a offline start aplikace nejsou součástí této verze.

Vyberte video, upravte efekt a použijte **Exportovat video**. Po dokončení tlačítko
**Uložit soubor** otevře systémové sdílení nebo stáhne výsledek. Podporované obrázky
PNG, JPEG, WebP a BMP se připraví jako tichá pětisekundová scéna. Aktuální snímek
lze uložit přes **Exportovat obrázek (PNG)**. Sedm barev liquidu lze upravit
samostatně nebo použít připravenou paletu; štětec má rozsah 60–1440 px. Nastavení včetně tahů
štětců používá stejný JSON jako desktop. Průběh lze zrušit.

## Export a kompatibilita

- SDR vstup do 300 MB a 3 minut; rozlišení výstupu 1080p, 30 fps, H.264 Baseline
  Level 4.0, přibližně 10 Mb/s. Vstupní kodek musí umět dekódovat daný prohlížeč.
- Každý snímek se vybírá podle časové značky `index / 30`. Stejný čas řídí liquid.
  Proměnlivá snímková frekvence vstupu nepřechází do rychlosti animace.
- AAC se kopíruje, pokud je to možné; jiné podporované audio se převede do AAC.
  Zachovává se společný začátek časové osy a případné zpoždění zvukové stopy.
- Počet zakódovaných snímků musí přesně odpovídat požadovanému počtu. Export
  bez postupu po 30 sekundách skončí s chybou a lze jej zopakovat.
- Aplikaci nechte v popředí. Zámek obrazovky je požadován, pokud jej prohlížeč
  podporuje, ale nemůže zaručit běh na pozadí. Hotový MP4 se sestavuje v paměti.
- HDR se odmítá s vysvětlením; automatický převod HDR do SDR zatím není součástí.

Renderer, štětce a nastavení se importují ze `../desktop/`, takže změny efektu
se po sestavení projeví i na webu. Web používá RGB mezikrok pro shodu náhledu
s dekódovanými snímky a pro obejití chyb přímého NV12 uploadu v simulátoru Safari.
U neoznačeného SDR videa se doplní obvyklá SD/HD barevná matice. Profil Baseline
prošel skutečným kódováním v iOS simulátoru, kde High profil hlásil podporu,
ale nevracel zakódované snímky.
Pokud Safari matici SD vstupu ignoruje, převod jeho YUV snímků do RGB proběhne
explicitně. Výstup obsahuje barevná metadata Rec.709 v MP4. Kontroly porovnávají
náhled, nekomprimovaný snímek exportu i zpětně přehrávané video.

## Ověření a záznam

`npm test` spouští samostatný testovací server a prohlížeč přes vývojový Electron
z `../desktop/node_modules/`. FFmpeg z desktopových závislostí se používá pouze
pro testovací vstupy a nezávislou analýzu výsledků. Nejde o webový exportní backend.

Pro záznam iOS simulátoru:

```sh
LIQUID_QA=1 PORT=4174 node scripts/serve.mjs
# V druhém terminálu, s již spuštěným simulátorem a test-results/demo-input.mp4:
node tests/record-simulator.mjs <UDID-simulátoru>
node tests/verify.mjs ios-demo
```

Testovací stránka provádí viditelné, automatizované klikání a tahy štětce přes
stejné UI a skutečný export. Přes lokální testovací endpoint pak uloží vytvořený
MP4, screenshoty a protokol. Tyto endpointy jsou vypnuté bez `LIQUID_QA=1`
a nejsou součástí statického produkčního balíčku.

Ověřeno v Safari 26.5 na iPhone 17 Pro simulátoru a v Chromium/Electron.
Výkon a paměťové limity fyzického iPhonu je třeba ověřit zvlášť.

## GitHub Pages

Workflow `Publish Liquid Studio` sestaví a publikuje pouze statický webový
balíček. Spouští se ručně z GitHub Actions. WordPress se tímto workflow nenasazuje.
Vygenerované odkazy na skripty a styly jsou relativní a fungují i pod adresářem
repozitáře. Aplikace pro import ani export neodesílá média na server.
