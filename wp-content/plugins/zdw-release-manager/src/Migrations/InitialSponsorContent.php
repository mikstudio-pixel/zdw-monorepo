<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

final class InitialSponsorContent
{
    /** @return array<string, list<int>> */
    public static function sections(): array
    {
        return [
            'poradatele' => [20615, 20614],
            'festival_vznika_za_podpory' => [43843, 43844, 20654, 40956, 20655],
            'hlavni_partner' => [41829],
            'generalni_medialni_partner' => [40596],
            'hlavni_medialni_partneri' => [40598, 40597],
            'oficialni_vuz_festivalu' => [42170],
            'oficialni_hotel_festivalu' => [42181, 42183],
            'hlavni_napoj_festivalu' => [40930],
            'partneri' => [40588, 40961, 40593, 41800, 41803, 40923, 42458, 42459, 41831, 41832, 40925, 40964, 40926, 40590, 40592, 40595, 40965, 40591, 43488, 40594, 40966],
            'medialni_partneri' => [40730, 40602, 40922, 40600, 40967, 40944, 40915, 41798, 40601],
            'garanti_a_partneri_best_in_design' => [40604, 40947, 40968, 40603],
        ];
    }

    /** @return list<int> */
    public static function attachmentIds(): array
    {
        return array_values(array_unique(array_merge(...array_values(self::sections()))));
    }

    /** @return array<int, string> */
    public static function attachments(): array
    {
        return [
            20615 => 'logo-white.svg',
            20614 => 'logo-fmk-white.svg',
            43843 => 'logo-mkcr-web.png',
            43844 => 'logo-mkcr-web-1.png',
            20654 => 'zlin.png',
            40956 => 'zlin.png',
            20655 => 'zlinsky-kraj.png',
            41829 => 'koma.png',
            40596 => 'ct.png',
            40598 => 'czechdesign.png',
            40597 => 'logo-refresher-web.png',
            42170 => 'novy-projekt-2.webp',
            42181 => 'logo-interhotel-zlin-web-1.webp',
            42183 => 'logo-interhotel-zlin-web-1-1.webp',
            40930 => 'logo-nari-web.png',
            40588 => 'ldseating.png',
            40961 => 'ldseating-1.png',
            40593 => 'zivy-zlin.png',
            41800 => 'logo-vitra-web.png',
            41803 => 'logo-homeoffice-web.png',
            40923 => 'posta-bez-hranic.png',
            42458 => 'logo-topnatur-web.png',
            42459 => 'logo-topnatur-web-1.png',
            41831 => 'logo-bageterie-boulevard-web.png',
            41832 => 'logo-bageterie-boulevard-web-1.png',
            40925 => 'fatra.png',
            40964 => 'fatra-1.png',
            40926 => 'datard.png',
            40590 => 'logo-kam-web.png',
            40592 => 'logo-proud-web.png',
            40595 => 'ferdinand.png',
            40965 => 'ferdinand-1.png',
            40591 => 'logo-matchball-web.png',
            43488 => 'logo-eura-web.png',
            40594 => 'robota.png',
            40966 => 'robota-1.png',
            40730 => 'logo-nexusmag-web.png',
            40602 => 'archspace.png',
            40922 => 'posta-bez-hranic-copy-5.png',
            40600 => 'packaging-herald.png',
            40967 => 'packaging-herald-1.png',
            40944 => 'logo-art2friends-web-1.png',
            40915 => 'logo-material-times-web.png',
            41798 => 'logo-earch-web.png',
            40601 => 'radio-wave.png',
            40604 => 'nadacni-fond-ruzickovych.png',
            40947 => 'pepper-field-1.png',
            40968 => 'pepper-field-1-1.png',
            40603 => 'logo-papelote-web.png',
        ];
    }

    public static function block(): string
    {
        $attributes = [
            'sections' => self::sections(),
            'paddingTop' => 64,
            'paddingBottom' => 64,
            'paddingTopMobile' => 32,
            'paddingBottomMobile' => 32,
            'sectionGap' => 80,
            'logoGap' => 0,
            'titleGap' => 12,
            'logoRowGap' => 0,
        ];

        return sprintf(
            '<!-- wp:zdw/sponsors %s /-->',
            json_encode($attributes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)
        );
    }
}
