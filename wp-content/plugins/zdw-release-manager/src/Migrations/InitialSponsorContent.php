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
