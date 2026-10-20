# Liquid Studio

Lokální Electron aplikace pro postup **vložit video → nastavit efekt → exportovat MP4**.
Webový prototyp v nadřazené složce má vlastní `npm run dev` a je zdrojem společného rendereru.

Kalibrace z 18. 9. 2026 přenáší základní scénu z pracovní AE kopie: živou křivku,
pastelovou paletu, filtry a měřenou mapu turbulence. V 181 snímcích 1920 × 1080
byl výstup Studia 1.3 při struktuře 50 %, intenzitě 100 %, bez vlastních oblastí
a skla pixelově totožný s webem. Kontrolní snímky verze 1.4 se liší nejvýše
o 1/255 v několika kanálech. Průměrný překryv obrysů s pracovní AE kopií
je 97,24 %. Vlastní tahy od verze **1.4.0** používají stejnou pastelovou paletu,
Wave Warp, Box Blur, Scratch a mapu turbulence. Tah určuje rozmístění lokálních
tvarů, proto se na něj uvedené procentní měření základní scény nevztahuje.
Podklady a meze jsou v
[protokolu kalibrace](../reference/tutorial/CALIBRATION.md).

Posuvník **Struktura** mění liquid od drobných roztřepených
tvarů s malými otvory až po celistvější objekty s menším počtem mezer. Pravá část
posuvníku uzavírá vnitřní otvory a zachovává rozsah i členitý vnější okraj;
objekt se nenafukuje ani nevyhlazuje. Hodnota **50 %**
je výchozí i u starších souborů nastavení. Ty se načtou s novým materiálem;
uložené tahy a gumování zůstanou zachované. Štětec dál
určuje směr a rozsah, povrch může přesáhnout tah. Guma od verze **1.6.0**
odstraňuje celé tahy, i při zásahu do jejich přesahu. Vzhled
a ovládání kostek zůstávají zachované.

[Srovnání stejného tahu před a po](../public/liquid-brush-compare/before-after.jpg)
ukazuje nový vzhled při stejném čase 0,7 s. [Video porovnání](http://127.0.0.1:5173/public/liquid-brush-video.html)
obsahuje celých 181 snímků. Pohyb kresleného liquidu pokračuje i u dlouhých klipů:
nativní interval deformace prochází plynule tam a zpět, s vlastní fází každého
lokálního tvaru, bez náhlého skoku na začátek.

## Spuštění

Vyžaduje Node.js 22.12 nebo novější a grafiku s WebGL 2. Na macOS používá tato
verze Electronu macOS 13 Ventura nebo novější.

```sh
cd /Users/pavelmikulecky/Projects/experiments/ZDW-liquid/desktop
npm ci
npm start
```

Instalace závislostí potřebuje internet a stáhne Electron i lokální binárky FFmpeg
a ffprobe. Po instalaci funguje import, náhled, ukládání nastavení a export offline.
Aplikace nepoužívá CDN, cloudové služby, vzdálená písma ani systémový FFmpeg.

## Použití

1. Přetáhněte **jeden video soubor** do okna nebo stiskněte **Vybrat soubor**.
   Přijímá MP4, MOV, M4V, MKV, WebM a AVI s běžnou progresivní SDR video stopou.
   Příprava může podle délky a rozlišení chvíli trvat; lze ji zrušit.
2. Zvolte poměr **16:9**, **9:16** nebo **1:1** a nastavte výřez. Nástroj **Ořez**
   dovoluje posouvat video tažením; přiblížení a polohu lze změnit i posuvníky.
   **Vycentrovat** obnoví střed a přiblížení 100 %.
3. Vyberte štětec **Kostky** nebo **Liquid** a kreslete přímo do náhledu.
   Nová kompozice začíná bez efektů. Velikost štětce nastavuje posuvník v liště.
   Liquid má rozsah **480–1440 px**, kostky a guma **20–480 px**. Každý nástroj
   si během práce pamatuje vlastní velikost. Modrá označuje oblast kostek;
   liquid od verze **1.4.1** ukazuje rovnou výsledné barvy, otvory a přesahy,
   bez barevné výplně tahu. Při kreslení je video pozastavené. **Guma** maže vybranou vrstvu
   nebo obě; kostky i jednotlivé tahy liquidu maže celé. Jeden tah liquidu
   znamená jedno stisknutí, tažení a puštění myši. Stačí zasáhnout jeho
   viditelnou část včetně přesahů a oddělených kapek; odstraní se celý tah.
   Tažením gumy přes více tahů se smažou všechny zasažené. Nové tahy začínají
   bez zděděných výřezů. Šipky vracejí/opakují až 20 kroků
   (také ⌘/Ctrl+Z a Shift+⌘/Ctrl+Z). **Vymazat oblast** vyčistí vybranou vrstvu.
4. **Hotovo** potvrdí oblasti a skryje označení kostek. **Zrušit** nebo Escape
   zahodí rozpracovanou úpravu. Další kliknutí na štětec oblasti znovu otevře.
   Export a ukládání nastavení jsou dostupné po potvrzení úprav.
5. Vyberte **Signature**, **Soft frost** nebo **Festival** a dolaďte lom, aberaci,
   velikost kostek a rozostření. **Liquid** zapíná animovanou barevnou vrstvu
   s vlastní intenzitou. Posuvník **Struktura** v této sekci mění existující liquid
   okamžitě: vlevo **Jemná** znamená menší roztřepené tvary s drobnými otvory,
   vpravo **Celistvá** méně vnitřních mezer při zachování záhybů vnějšího okraje
   a rozsahu kolem tahu. Nemusíte kreslit znovu.
   **50 %** vrací výchozí strukturu. Parametr se ukládá do nastavení a používá
   při exportu; přednastavení jej vracejí na 50 %. Přednastavení ani **Obnovit**
   nemažou nakreslené oblasti.
6. Přehrávání ovládá tlačítko ▶ nebo mezerník mimo ovládací prvky. Časová osa
   umožňuje hledat po jednotlivých výstupních snímcích. Zvuk lze pro náhled ztlumit;
   ztlumení náhledu zvuk z exportu neodstraní.
7. Klikněte na **Exportovat video** a zvolte cílový MP4. Aplikace ukazuje postup
   a odhad zbývající doby. **Zrušit** odstraní rozpracovaný soubor. Dokončené
   video můžete zobrazit ve Finderu / správci souborů.
8. **Uložit nastavení** vytvoří verzovaný `.json`; **Načíst nastavení** vrátí
   efekt, obě nakreslené oblasti, poměr a ořez. Soubor neobsahuje video ani jeho cestu. Video je při
   dalším spuštění potřeba znovu vložit.

Oblasti patří k výstupnímu plátnu a při posunu videa zůstávají na místě. Při změně
poměru stran se přizpůsobí plátnu; kostky se znovu poskládají podle své velikosti.
Štětec kostek vybírá celé buňky původní šachovnicové mřížky, takže nejmenší štětec
může v mezeře mezi kostkami označit oblast bez viditelné kostky. U liquidu je tah
vodítkem: podél něj vzniknou větší nepravidelné tvary s přirozenými otvory a záhyby,
které se mohou rozlévat za oblast tahu. Větší štětec zvětšuje samotné tvary,
otvory a záhyby: 960 px má dvojnásobné měřítko proti 480 px. Velikost se
zachová i u okrajů plátna a v portrétním formátu. Otvory ani okraj nejsou
pevně oříznuté tahem a plynule se animují.
Staré soubory bez oblastí zobrazí původní diagonální mřížku a procedurální liquid.
Při prvním otevření štětců se jejich aktuální tvary převedou na upravitelné oblasti.

## Sestavení

```sh
npm run pack   # rozbalená aplikace pro aktuální platformu a architekturu
npm run dist   # macOS: DMG + ZIP; Windows: NSIS; Linux: AppImage
```

Výsledek je ve složce `desktop/release/`. Na Apple Silicon je rozbalená aplikace
v `release/mac-arm64/Liquid Studio.app`. Balíček obsahuje FFmpeg a ffprobe mimo
ASAR a nepotřebuje Node.js ani Homebrew na cílovém počítači.

Sestavujte na cílovém systému a architektuře: instalace vybírá odpovídající nativní
binárky. Lokální balíček není distribuční vydání podepsané Developer ID ani
notarizované. Pro veřejnou distribuci nastavte vlastní podpis/notarizaci v
electron-builderu a zahrňte licenční povinnosti FFmpeg / libx264. Konfigurace pro
Windows a Linux je připravená, ověření tohoto vydání probíhá na macOS Apple Silicon.

## Obraz, časování a zvuk

- `npm run sync:shaders` kopíruje `src/shaders.js`, zdrojové průchody, definici
  křivky, mapu deformace a závislosti do `desktop/vendor/` beze změn.
  Desktopový adaptér v `video-renderer.js` mění
  výběr buněk podle nakreslené oblasti a přidává vizualizaci kreslení. Optické
  výpočty profilu čočky, lomu, disperze, odlesků a rozostření zůstávají původní.
  Generátor liquidu rozmístí řídký řetězec lokálních tvarů po širších částech tahu.
  Jejich zdroj je prstenec se stejnou sedmibarevnou paletou a pořadím filtrů
  jako kalibrovaný web. Nativní turbulence se aplikuje až po filtrování; každý
  tvar má stabilní natočení a fázi. Překryvy se plynule skládají s přednásobenou
  alfou. Zdroj se filtruje v 1920 × 1080 pouze při změně struktury, lokální
  materiál se skládá v polovičním rozlišení. Video a optika kostek se skládají
  v plném rozlišení. Náhled i export používají shodný postup, čas i rozmístění.
  Každý nový tah má vlastní pole 512 × 512 bodů a samostatný průchod.
  Na začátku pohybu gumy se vykreslí alfa jednotlivých tahů v aktuálním čase;
  guma vybere podle viditelné alfy celé zasažené objekty. Během stejného pohybu
  se tato data znovu nevykreslují. Nové výřezy do liquidu nevznikají.
  Průchody se skládají v pořadí vzniku. Formát nastavení **4** ukládá jejich
  velikosti i komprimovaná pole; formáty 1–3 lze nadále načíst se zachováním
  původního rozmístění. Starší kompozice mohou obsahovat více tahů sloučených
  do jednoho průchodu; taková skupina se maže jako jeden objekt, protože
  původní hranice tahů nejsou v souboru uložené. Staré částečné výřezy se při
  načtení zachovávají. Kompozice podporuje až 64 objektů liquidu. Pomocné barvy a kurzor
  štětce se do exportu nedostanou. Nastavení včetně masek se exportnímu rendereru
  předává pouze s prvním snímkem, ne opakovaně pro každý snímek.
- Import vytvoří lokální pracovní MP4: **30 fps**, H.264 CRF 16, čtvercové pixely,
  nejvýše 3840 px na delší straně. Zohlední rotaci videa a poměr stran pixelů.
  Převod na 30 fps snímky duplikuje nebo vynechává; nemění rychlost klipu.
  Vstupní soubor se nemění. Příprava i export jsou ztrátové komprese.
- Video a první zvuková stopa používají **společný počátek video PTS**. Zpoždění
  zvuku zůstává zachované; předčasný zvuk se ořízne, chybějící části vyplní ticho.
  Zvuk se při přípravě převádí na AAC, stereo, 48 kHz, 192 kb/s. Při finálním
  exportu se tato připravená zvuková stopa kopíruje bez dalšího překódování.
- Náhled vykresluje v konečném rozlišení, CSS jej pouze zmenšuje do okna. Animace
  vychází z `requestVideoFrameCallback().mediaTime`, nikoli z rychlosti monitoru.
  Pauza zmrazí video i liquid.
- Export dekóduje připravený MP4 přes FFmpeg do RGBA **snímek po snímku**.
  Samostatné skryté okno Electronu použije stejný `VideoRenderer` a čas **n / 30**.
  Po `readPixels` se obrátí pořadí řádků a data se předají lokálnímu H.264 kodéru.
  Další snímek se předá rendereru až po potvrzeném renderu a zápisu předchozího. Výkon
  počítače tedy ovlivňuje dobu zpracování, nikoli rychlost nebo počet snímků.
- Výstup je MP4, H.264 CRF 18, YUV 4:2:0, Rec.709, 30 fps: **1920 × 1080**,
  **1080 × 1920** nebo **1080 × 1080**. Délka se zaokrouhlí nahoru na celý
  výstupní snímek. Rozdíl proti vstupní video stopě je menší než 1/30 s.
- Před nahrazením cíle se kontroluje kodek, rozměry, počet snímků a přítomnost
  zvuku. Výsledek vzniká pod dočasným názvem vedle cíle a až po úspěchu se
  přejmenuje. Zrušení a chyby zachovají případný existující cíl.

## Ověření

```sh
npm run check
npm test
npm run test:e2e
```

Poslední příkaz otevírá skutečný Electron a používá testovací systémové dialogy.
V `test-results/` nechá vstupní testovací video, export, screenshoty a `report.json`
s naměřenými rozdíly náhledu a exportu. Test kontroluje import, ovládání, nastavení,
ořez, zrušení, pixelové porovnání několika snímků, přesné PTS a shodu obrazového
záblesku se zvukovým pulzem. Pixelová shoda se posuzuje s tolerancí pro H.264,
YUV 4:2:0 a rozdílné dekodéry; neznamená bezeztrátovou shodu komprimovaných souborů.

Jednotkové a integrační testy navíc ověřují validaci souborů nastavení, omezení
ořezu, HDR/prokládání, dělení surových snímků, zlomkovou snímkovou frekvenci,
vstup bez zvuku, zachování zpoždění zvuku a totožnost původního shaderu.
Grafický test navíc kontroluje, že nulová síla efektu neposouvá obraz a že na
jednobarevném podkladu zůstávají viditelné odlesky a stíny skla. Kontroluje také
samostatné oblasti, neovlivněné okolí, animaci liquidu, převod starších kompozic,
skutečné tahy štětcem a gumou, potvrzení/zrušení a uložení masek. Export testuje
s nakreslenými oblastmi. Jednotkové testy ověřují návaznost rychlých tahů,
mazání celých kostek a správné souřadnice u náhledu s černými okraji.
Test liquidu měří skutečné otvory a přesah tahu, plynulost mezi snímky, přesnou
opakovatelnost při návratu na stejný čas a mazání přesahů včetně uložení/načtení.
Test opakovaného postupu liquid → guma → liquid porovnává nový tah s čerstvou
generací pixel po pixelu, včetně undo/redo a uložení/načtení. Měřítko tvarů
se kontroluje pro štětce 480, 960 a 1440 px ve všech třech formátech.
Test celých objektů zasáhne přesah jednoho ze dvou tahů, ověří odstranění celého
tahu a pixelovou shodu druhého s jeho samostatným renderem. Kontroluje undo/redo
a uložení/načtení v 16:9, 9:16 i 1:1. Test editoru navíc kreslí dva tahy stejné
velikosti skutečnou myší a ověřuje, že zůstávají oddělené i po uložení.
V `test-results/liquid-original.png` a `liquid-guided.png` jsou srovnávací rendery.
Rendery `liquid-structure-fine.png`, `liquid-structure-balanced.png` a
`liquid-structure-cohesive.png` ukazují stejný tah při 0, 50 a 100 %. Grafický test
porovnává počet a velikost otvorů, členitost okraje a velikost spojených objektů.
Pro test sestaveného balíčku nastavte `LIQUID_TEST_EXECUTABLE` na cestu
`release/mac-arm64/Liquid Studio.app/Contents/MacOS/Liquid Studio` a spusťte
`npm run test:e2e`. Testy pak ověří stejný postup včetně balených binárek a ASAR.

## Omezení první verze

Jedno video, první video a první audio stopa, bez střihu, titulků, více vrstev či
HDR tone mappingu. HDR/Rec.2020 a označené prokládané vstupy aplikace odmítne
s vysvětlením. Neoznačené běžné SDR materiály se zpracují podle interpretace
FFmpeg; nejde o nástroj pro mastering barev. Základní liquid odpovídá kalibrovanému
webu; rekonstrukce celé původní animace z tutoriálu zatím není nezávisle ověřená.

Pracovní MP4 potřebuje volné místo v systémové dočasné složce, během exportu je
potřeba i místo u cílového souboru. Paměť není úměrná délce videa; uchovává se jen
omezený počet nekomprimovaných snímků. Pracovní soubory se odstraní při výměně
videa a běžném ukončení aplikace. Při násilném ukončení mohou zůstat ve složce
`zdw-liquid-*` v systémovém tempu.

Pro vývoj lze nahradit balené binárky absolutními cestami v `LIQUID_FFMPEG`
a `LIQUID_FFPROBE`. Aplikace spouští binárky přímo bez shellu, renderer běží
s izolovaným kontextem a sandboxem. Síťové požadavky mimo lokální protokol
`app://studio/` jsou blokované.

Technické reference: [Electron webUtils](https://www.electronjs.org/docs/latest/api/web-utils),
[Electron protocol](https://www.electronjs.org/docs/latest/api/protocol),
[FFmpeg filtry fps a aresample](https://ffmpeg.org/ffmpeg-filters.html).
