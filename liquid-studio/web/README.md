# Liquid Studio pro web

Mobilní průchod pro tvorbu obrázku se sdíleným WebGL 2 rendererem. Média se
zpracovávají v prohlížeči; server pouze poskytuje soubory aplikace. Electron
ani FFmpeg se při webovém importu či exportu nepoužívají.

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
funguje bez sítě; offline start aplikace není součástí této verze. Pro mobilní náhled
používejte Liquid Studio přidané na plochu jako samostatnou webovou aplikaci
bez lišt Safari, nikoli běžný panel prohlížeče.

Po otevření se automaticky načte video `ZDW_vrstvy_40s.mov` jako připravená
ukázka dlouhá přibližně 38,5 sekundy se zvukem. Mobilní průchod používá její
verzi na výšku 9:16 (1080 × 1920), vytvořenou středovým ořezem původního videa.
Podrobný editor používá stejný klip v původním formátu 16:9.
Přehrávání začíná pozastavené. Tlačítkem **Nahrát** v prvním kroku
je nahradíte vlastním videem či obrázkem.

Ovládání používá vzhled Windows XP se šedým ikonovým menu podle Malování,
hranatými tlačítky s ostrými hranami a dodanými 16×16 pixelovými ikonami z `assets/icons/`. Obrázky se
zobrazují ostře, hlavní tlačítka mají dotykovou plochu alespoň 44 px a textové názvy
zůstávají dostupné čtečkám obrazovky. Styl je omezený na mobilní průchod.

Výchozí průchod má tři kroky:

1. **Oblast liquidu:** vyznačte jednu nebo více oblastí. Během kreslení je vidět
   jednoduchá modrá maska. **Další** ji promění ve společný liquidový povrch.
   Tahy se slučují, guma ubírá lokálně a šířka štětce mění pouze oblast, nikoli
   měřítko vzoru. Zpět/znovu i návrat z dalšího kroku zachovávají oblast.
   Ze společného pole celé oblasti vznikne turbulentní povrch, jeho obrys
   a otvory. Teprve výsledný povrch se jednou obarví původní paletou;
   barevné tvary se na sebe nevrství. Přirozený obrys může přesahovat vyznačení.
   Pohyb navazuje na původní kalibrované deformační pole a průběžně pokračuje
   do nových stavů, bez zpětného přehrávání nebo restartu smyčky. Deformuje
   společné pole celé oblasti v pevném měřítku a zachovává stejný výsledek při
   seeku i exportu. Jemnější vzdálenostní pole udržuje hladké barevné přechody.
   I uvnitř široké oblasti vznikají zaoblené kanálky a menší otvory v pevném
   měřítku; vzdálenost od vnějšího okraje se nepoužívá jako plná výplň středu.
   Mobilní průchod začíná s plnou kryvostí liquidu.
2. **Kostičky:** nakreslete oblast skleněných kostiček nebo krok přeskočte.
3. **Paleta:** vyberte Pastel, Festival nebo Modrou. Tlačítko exportu podle
   vloženého média uloží aktuální snímek jako PNG v plném rozlišení, nebo
   připraví celé video MP4 se zvukem a animací klíčových snímků. Hotový soubor
   lze sdílet nebo stáhnout. Systémové sdílení nabídne uložení do fotek, pokud tuto
   volbu systém nabízí.

Formát se přizpůsobí médiu (16:9, 9:16 nebo 1:1). Celý zdrojový obraz se zvětší na maximum dostupné plochy bez
ořezu a deformace. Volné okraje vyplňuje světlejší rozmazaná pixelová kopie aktuálního média se sníženou sytostí;
pozadí se aktualizuje při přehrávání i posunu času. Pruhy uvnitř výstupního formátu
se stejným způsobem vyplní také při exportu. Ovládání je nad obrazem; při
kreslení kroky, guma a navigace dočasně zmizí. Nahoře je jen menu 1–3 a guma,
dole Nahrát/Zpátky a Další. Ve třetím kroku timeline nahradí spodní pruh
s barevnými vzorníky; při větším počtu témat se posouvá vodorovně.
Rozložení funguje na výšku i na šířku. Samotný web nemůže zapisovat přímo do
galerie bez systémového uložení. U obrázku se PNG připravuje už při výběru palety,
aby poslední klepnutí zachovalo oprávnění pro otevření sdílecího panelu v Safari.

U fotografie je spodní lišta v prvních dvou krocích skrytá a navigační tlačítka
jsou u spodního okraje. Ve třetím kroku se zobrazí lišta s barevnými tématy.
Fotografie se v průvodci načítají přímo, bez převodu na video a bez kodéru
WebCodecs. Rozpoznávají se podle typu souboru i přípony (včetně HEIC/HEIF,
pokud je prohlížeč umí otevřít). Načítání lze zrušit; po 15 sekundách se při
neúspěšném dekódování zobrazí chyba.

**Timeline videa** je v prvních dvou krocích vidět ve spodní 60px liště: vlevo je
ikona klíčového snímku s pluskem, následuje aktuální čas, posuvník se značkami
a vpravo přehrávání. Lišta se nevysouvá. Táhlo reaguje přímo na prst; načítání videa dohání poslední
zvolený čas bez vracení táhla zpět. Během tažení se používá lehčí náhled, po
puštění se obnoví plné rozlišení a připraví právě vybraný PNG snímek.
Při náhledu se zobrazí hotový efekt, dotyk obrazu vrací kreslení.
Vyberte nový čas a klepněte na ikonu s pluskem: přehrávání se pozastaví a pro
aktivní efekt lze rovnou nakreslit nový cílový tvar. První přidání uchová také
výchozí tvar v čase 0. Předchozí snímek zůstává zachovaný. Na existujícím
klíčovém snímku stejná ikona otevře jeho úpravu bez vytvoření kopie.
Morf začne automaticky 2 sekundy před cílovým snímkem; pokud jsou snímky blíž,
využije jejich kratší interval. Před začátkem morfu se drží předchozí tvar.
Kostičky plynule přecházejí mezi vybranými buňkami, paleta mezi svými barvami.
Uložení obrázku zachytí aktuální čas.

Původní podrobný editor zůstává dostupný na `/?editor=1`. V něm upravte efekt
a použijte **Exportovat video**. Po dokončení tlačítko
**Uložit soubor** otevře systémové sdílení nebo stáhne výsledek. Podporované obrázky
PNG, JPEG, WebP a BMP se připraví jako tichá pětisekundová scéna. Aktuální snímek
lze uložit přes **Exportovat obrázek (PNG)**. Sedm barev liquidu lze upravit
samostatně nebo použít připravenou paletu; štětec má rozsah 60–1440 px. Nastavení
používá stejný JSON jako desktop. Klíčové snímky mají verzi 6 a kompaktní masky,
samostatné oblasti verzi 5; staré tahové kompozice se nadále ukládají ve verzi 4.
Animace klíčových snímků se používá i při video exportu v podrobném editoru.
Průběh lze zrušit.

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

`npm test` ověřuje mobilní průchod na rozměrech 320–1440 px včetně orientace na
šířku, masku, gumu, historii, návraty mezi kroky, palety a skutečné PNG. Sdílení
ověřuje zachycením předaného souboru; nativní systémový panel tím není otestovaný.
Snímky a protokol jsou v `test-results/flow/`. Dále kontroluje původní editor,
video export a synchronizaci zvuku. Spouští samostatný testovací server a prohlížeč přes vývojový Electron
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

Původní video editor byl ověřen v Safari 26.5 na iPhone 17 Pro simulátoru a v
Chromium/Electron. Nový mobilní průchod je ověřen v desktop Chromium/Electron
s mobilními rozměry viewportu. Nový průchod a skutečné uložení do fotek je
potřeba ještě ověřit na fyzickém telefonu.

## GitHub Pages

Workflow `Publish Liquid Studio` sestaví a publikuje pouze statický webový
balíček. Spouští se ručně z GitHub Actions. WordPress se tímto workflow nenasazuje.
Vygenerované odkazy na skripty a styly jsou relativní a fungují i pod adresářem
repozitáře. Aplikace pro import ani export neodesílá média na server.
