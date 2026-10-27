# Destilace liquidu ze snímků, 26. 10. 2026

Aktuální generátor oblastí používá model rychlostního pole odvozený z reference
`reference_pro_liquid_ver1.mp4`. Geometrie, paleta a masky zůstávají procedurální.
**99% shoda celého videa nebyla dosažena ani prokázána.** Čísla pro profil hrany
nebo rychlostní model nelze zaměňovat za podobnost celého obrazu.

## Co bylo skutečně měřeno

Reference má 1920 × 1080, 30 fps, 26,8 s a 804 snímků. Byl dekódován každý
snímek a zpracováno všech 803 sousedních dvojic, nikoli pouze několik náhledů.
Původní MP4 zůstalo beze změny; jeho SHA-256 je součástí modelu.

- Dopředný i zpětný DIS optical flow, kontrola jejich konzistence, lokálního
  kontrastu a chyby při přenesení RGB do sousedního snímku. Nejasné vektory
  na plochách a při zakrývání jsou z fitu vyloučeny.
- 27 kombinací prostorového vyhlazení, počtu prostorových módů a časových
  harmonických funkcí. Fit používá 642 dvojic; každá pátá dvojice, celkem 161,
  slouží pouze k validaci. Ani prior pro nepozorované oblasti nepoužívá tyto
  validační dvojice.
- Sledování 1 449 rysů přes navazující snímky pomocí pyramidal LK a zpětné
  kontroly. Medián jejich sledovatelnosti je 3,733 s; sledování je cenzorováno
  po šesti sekundách, nejde tedy o měření životnosti skutečných kapek.
- Téměř 150 tisíc použitelných profilů hran ze všech 804 snímků. Vzorkují se
  kolmo k hraně, normalizují vůči místnímu vnitřku a zarovnávají na 50% jas.
  Odděleně se porovnává šířka přechodu, jeho tvar a rozdělení šířek.

Hlavní zjištění pro pohyb: detaily reference převážně proudí doleva, zatímco
široké barevné oblasti a obálka zůstávají přibližně ukotvené. Pouhé vlnění
časových řezů šumu tento pohyb nereprodukovalo. Dlouhé přenášení jediné
počáteční struktury zase hromadí natažení do vláken, která v předloze nejsou.

## Implementace

- `src/liquid-flow-data.js`: generovaný model, prostorové rychlostní módy a
  analytické časové koeficienty. Neobsahuje RGB, alfu, masky, video snímky ani
  posloupnost hotových deformovaných póz. Výsledný soubor má přibližně 1,3 MB.
- `src/liquid-flow.js`: z koeficientů vyhodnocuje rychlost a integruje lokální
  trajektorie. Dvě navazující časová pole se spojují ve skalární geometrii;
  každé obnovuje svou strukturu v okamžiku nulové váhy. Globální fáze proudění
  stále postupuje. Délka místní koherence 3,75 s vychází z měřených trajektorií.
  Není zde restart celé scény ani přehrávání reference jako textury.
- `src/liquid-material.js`: stále generuje dutiny a sedmibarevné přechody
  procedurálně. Vstupní obrázek/video ani jednotlivé tahy se nestávají zdroji
  oddělených barevných otisků.
- `src/liquid-filter.js`: skutečný filtr premultiplikované barvy **i alfy**,
  dva prostorové průchody a směrové úhlové změkčení s gaussovskými vahami.
  Vybrané parametry: sigma 0,84 referenčního pixelu, úhlový rozsah 0,0634 rad.
  Není to jen širší antialiasing přes `smoothstep`.
- `desktop/renderer/liquid-area.js`: původní vzdálenostní maska, ukotvené jádro,
  deformační okraj, úzké kořeny a interpolace klíčových snímků. Proudění nepřekládá
  celou nakreslenou oblast přes plátno. Web i desktop sdílejí stejný renderer.

Číselné souřadnice používají dvě UNORM bajtové dvojice, jejichž dekódování je
lineární a dovoluje bilineární filtraci bez plovoucího render targetu. Při
zápisu těchto souřadnic se vypíná dithering a následně se obnoví. Regresní GPU
test kontroluje přesné nulové pole a obnovení původního stavu.

Vendor soubory vznikají výhradně přes `desktop/scripts/sync-shaders.mjs`.
Kreslení, lokální guma, union masek, formát nastavení a ostatní efekty nebyly
přepisovány. Uživatelské změny `web/src/flow.js` a `web/tests/flow.mjs`, které
povolují „Další“ bez nákresu, zůstaly přesně zachované.

## Výsledky a jejich omezení

Samotný rychlostní model na 161 vynechaných dvojicích: průměrná směrová kosinová
shoda **0,955**, koncová chyba **7,33 px/s** v souřadnicích 1080p. To je ověření
modelu vůči spolehlivým odhadům optického proudění, **nikoli 95,5% shoda videa**.

Doplňková kontrola skutečně renderovaných sekvencí používá stejných 2 000 580
spolehlivých pozic v obou variantách přes všech 803 dvojic. Směrová kosinová
shoda se změnila z −0,084 na 0,634, koncová chyba z 50,08 na 23,16 px/s.
Ani tato kontrola nesleduje stejné odpovídající částice: geometrie se liší a
odhad z RGB trpí nejednoznačností pohybu podél hran. Je to diagnostika zlepšení,
ne procento vizuální věrnosti.

Měkkost hran se přiblížila referenci: původní medián přechodu byl přibližně
9,7 px, reference má 14,0 px. Aktuální rozdělení a normalizované chyby po
celosekvenční kontrole jsou uložené v `edge-evaluation.json` mezi výsledky.
Průměrná chyba profilu je kolem 1 % jeho normalizovaného rozsahu. Tato hodnota
nevyjadřuje shodu siluet, barevného rozložení ani trajektorií.

Zbývají jiné konkrétní tvary a polohy otvorů, jejich spojování, některé příliš
velké pastelové plochy a rozdíly v nejjemnějších směrových výběžcích. Přesné
původní zdrojové pole, maska a seed z MP4 nejsou známé. Černý podklad také
neumožňuje jednoznačně určit původní alfu tmavých a rozmazaných míst. Chování
za 26,8 s je procedurální extrapolace, nikoli ověřená kopie další reference.

## Ověření aplikace

- 33 jednotkových testů desktopu a desktopové E2E prošly. GPU testy ověřují
  společnou plochu, nezávislost na pořadí/opakování tahů, prázdnou masku,
  otvory v širokých oblastech, raw paletu před optickým filtrem, gumování,
  uložení a klíčové snímky. Opakovaný seek má pixelovou chybu 0.
- Pohyb pokračuje i ve 45 a 120 s; kontroly kolem časových hranic neukazují
  reset. Čistá paleta se kontroluje před filtrem, protože optický filtr
  záměrně míchá sousední pixely.
- `npm run test:material` ve webu prošel: skutečné area tahy, průchod rozhraním,
  PNG, H.264 MP4 a dekódované přehrání. Porovnání snímků 0, 21, 24 a 36 s
  exportem prošlo v desktopovém Chromiu i Safari 26.5 na iPhone 17 **simulátoru**.
  Události ukazatele jsou syntetické; fyzický iPhone nebyl testován.
- Exporty mají 1920 × 1080, 30 fps, 48 snímků, BT.709, přesná časová razítka
  a zvukový pulz 799,375 ms místo požadovaných 800 ms. PNG vs nekomprimovaný
  export: MAE 0 v Chromiu a přibližně 0,235/255 v Safari simulátoru.
- Celý původní webový `npm test` není zelený: `flow.mjs` očekává PNG share při
  práci s výchozím videem, jehož současná akce exportuje MP4. Stejný pád
  `file.arrayBuffer` byl reprodukován na původním rendereru před změnou.
  Úplný průchod původním flow testem tedy není potvrzen; jeho uživatelské
  změny nebyly přepisovány.

## Reprodukce

Z adresáře `liquid-studio`. Python nástroje jsou pouze offline a nepřidávají
závislosti do aplikace. Použít samostatný venv a
`pip install -r scripts/reference-study/requirements-distill.txt`.

```sh
python scripts/reference-study/distill-motion.py /absolute/reference.mp4 /absolute/work --tune
npm run sync:shaders --prefix desktop
LIQUID_MOTION=1 LIQUID_FRAME_COUNT=804 node scripts/reference-study/capture.mjs /absolute/reference.mp4 /absolute/output
python scripts/reference-study/distill-softness.py /absolute/reference.mp4 /absolute/work --evaluate /absolute/output/motion
```

Pro nové ladění filtru nejprve zachytit nefiltrovaný obraz přes
`LIQUID_FILTER='{"sigma":0,"angle":0}'`, potom spustit:

```sh
python scripts/reference-study/distill-softness.py /absolute/reference.mp4 /absolute/work --fit-raw /absolute/raw/motion --kernel gaussian
python scripts/reference-study/compare-motion.py /absolute/work /absolute/before/motion /absolute/after/motion
```

Interaktivní porovnání skutečných časů snímků (`requestVideoFrameCallback`):

```sh
node scripts/reference-study/capture.mjs /absolute/reference.mp4 /absolute/output --serve
```

Otevřít `http://localhost:56737/`. Levé HTML video slouží k porovnání, pravý
canvas čte pouze procedurální materiál a destilovaný rychlostní model.
`LIQUID_BASELINE=/absolute/snapshot` volitelně zachytí původní renderer;
snapshot obsahuje `desktop/{renderer,shared,vendor}`. Srovnání před/po drží
shodný vstup, nákres, paletu, čas, ořez i měřítko.

Aktuální výstupy: ignorovaný adresář `web/test-results/reference-study-v2`.
Plné rozklady a numerické mezivýsledky: `/private/tmp/liquid-distillation`.
Původní video nebylo změněno. Nebyl proveden commit, push ani publikování.
