# Zlin Design Week – lokální WordPress kopie

Monorepo obsahuje pouze vlastní pluginy, child theme a lokální/deployment
nástroje. WordPress core, parent theme, third-party pluginy, SQL exporty,
Updraft zálohy a `uploads` jsou záměrně mimo Git.

Docker konfigurace importuje databázi z
`zlindesignweek-migrate-20260728110645.sql.gz` a web zpřístupní na
<http://localhost:8080>. Port je svázaný pouze s lokálním rozhraním
`127.0.0.1`, takže kopie není dostupná ostatním zařízením v síti.

Používá udržovanou oficiální WordPress image pro PHP 8.3. Přesný Docker tag
verze 6.8.6 uvedené v hlavičce exportu není v oficiálním registru dostupný.

## Spuštění

1. Spusťte Docker Desktop.
2. Zkopírujte `.env.example` jako `.env`, nastavte `ZDW_SQL_DUMP` na lokální
   SQL.gz export a změňte lokální heslo.
3. Spusťte:

   ```sh
   docker compose up -d
   docker compose logs -f bootstrap
   ```

4. Web otevřete na <http://localhost:8080>.
5. Administrace je na <http://localhost:8080/wp-admin/>. Výchozí lokální účet:
   `localadmin` / `zdw-local-change-me`.

Po prvním úspěšném importu je kontejner `bootstrap` ve stavu `Exited (0)`;
to je očekávané.

## Obnovené soubory webu

Dne 28. 7. 2026 byl do `wp-content` obnoven UpdraftPlus backup stejného webu:

- původní `themes/zdw-theme`
- všechny pluginy včetně `zdw-functions` a ACF Pro
- jazykové soubory
- 57 dostupných částí `uploads` (přibližně 22 GB / 60 000 souborů)

Ve stažené sadě není archiv `uploads51.zip`. Pro aktuální domovskou stránku jsou
šablona, CSS i kontrolované obrázky dostupné. Proti databázovým záznamům chybí
153 původních příloh, převážně starší soutěžní materiály z roku 2020. Pokud se
část 51 později podaří získat, lze ji bezpečně doplnit bez nového importu
databáze.

## Bezpečnost lokální kopie

Konfigurace blokuje odesílání e-mailů, WordPress cron, automatické aktualizace
a serverová volání na externí API. Produkční web ani jeho databázi nemění.

## Čistý import od začátku

Následující příkaz smaže jen Docker volumes tohoto lokálního projektu a při
dalším spuštění znovu naimportuje SQL:

```sh
docker compose down -v
docker compose up -d
```

## Bezpečný deployment přes WEDOS FTPES

WEDOS Webhosting podporuje explicitní FTP přes TLS na portu 21. Připravené
skripty používají `lftp`, vyžadují šifrované spojení a ověřují certifikát.
Heslo se ukládá jen do macOS Klíčenky.

Jednorázové uložení hesla:

```sh
cp scripts/ftp-config.example.sh scripts/ftp-config.sh
# upravte ftp-config.sh podle údajů z WEDOS
./scripts/ftp-save-password.sh
```

Ověření připojení a výpis vzdálených adresářů:

```sh
./scripts/ftp-list.sh /
./scripts/ftp-list.sh /2026
```

Náhled uploadu konkrétního tématu nebo pluginu:

```sh
./scripts/ftp-deploy.sh preview theme zdw-theme-child
./scripts/ftp-deploy.sh preview plugin zdw-functions
```

Skutečný upload se spouští až po kontrole náhledu:

```sh
./scripts/ftp-deploy.sh upload theme zdw-theme-child --confirm-upload
```

Deployment je záměrně omezený na jeden adresář tématu nebo pluginu a nikdy
nemaže soubory na serveru. Nenahrává databázi, média, lokální Docker nastavení
ani `wp-content/mu-plugins/zdw-local-safety.php`. U pluginů navíc vynechává
`vendor`, testy, jednorázové nástroje a Composer/PHPUnit soubory.

## Databázové migrace bez SSH

Plugin `zdw-release-manager` přidává do administrace položku **ZDW → Nasazení**.
Každá změna má verzované ID, preflight, idempotentní zápis a následné ověření.
Aktuální manifest pokrývá:

- nastavení úvodního bloku a víceúrovňového headeru,
- hlavní kontakty i kontakty v sekcích Pro média, Best in Design a Přístupnost,
- vytvoření/aktualizaci Gutenberg stránky Sponzoři,
- čtyři menu nového headeru a odkaz na Sponzory v legacy menu.
- úvodní video, datum a text intro bloku bez přepisu zbytku homepage.

Produkční postup je: nahrát vlastní pluginy a child theme přes FTPES, přes Média
nahrát `zdw-bg-trimmed-30-muted.mp4`, aktivovat `zdw-release-manager`, spustit
kontrolu prostředí a aplikovat nabízené migrace v pořadí. Již aplikované
migrace se znovu nespouštějí.
