<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

final class InitialContactContent
{
    /** @return array<int, array{slug: string, content: string}> */
    public static function desiredPosts(): array
    {
        $team = [
            self::contact('Festival Management', 'Ondřej Staněk', 'Project Manager &amp; Creative Director', 'ondrej.stanek@zlindesignweek.com', '+420 731 560 687'),
            self::contact('Festival Management', 'Matěj Pešek', 'Production Director', 'matej.pesek@zlindesignweek.com', '+420 722 952 351'),
            self::contact('Festival Management', 'Šárka Doležalová', 'Best in Design Director', 'sarka.dolezalova@zlindesignweek.com', '+420 705 226 157'),
            self::contact('Festival Management', 'Emma Matisko', 'Design CANTEEN Director', 'emma.matisko@zlindesignweek.com', '+420 733 710 703'),
            self::contact('Partnerships &amp; Public Relations', 'Barbora Hanoldová', 'Partnerships Director', 'b_hanoldova@utb.cz', '+420 720 497 790'),
            self::contact('Partnerships &amp; Public Relations', 'Eva Ševčíková', 'Public Relations', 'eva.sevcikova@zlindesignweek.com', '+420 723 457 715'),
            self::contact('Guest Service &amp; Accessibility', 'Adam Bruno Rafaj', 'Guest Service', 'adam.rafaj@zlindesignweek.com', '+420 735 124 545'),
            self::contact('Guest Service &amp; Accessibility', 'Anna Svobodová', 'Coordinator of Accessibility', 'anna.svobodova@zlindesignweek.com', '+420 733 144 711'),
        ];
        $bestInDesign = [
            self::contact('', 'Šárka Doležalová', 'Best in Design Director', 'sarka.dolezalova@zlindesignweek.com', '+420 705 226 157'),
        ];

        return [
            17 => ['slug' => 'kontakty', 'content' => self::block($team, 'grid')],
            179 => ['slug' => 'contacts', 'content' => self::block($team, 'grid')],
            258 => ['slug' => 'bid-kontakt', 'content' => self::block($bestInDesign, 'compact')],
            1013 => ['slug' => 'contact-best-in-design-2', 'content' => self::block($bestInDesign, 'compact')],
        ];
    }

    /** @return array{section?: string, name: string, role: string, email: string, phone: string} */
    private static function contact(
        string $section,
        string $name,
        string $role,
        string $email,
        string $phone
    ): array {
        $contact = compact('section', 'name', 'role', 'email', 'phone');

        if ('' === $section) {
            unset($contact['section']);
        }

        return $contact;
    }

    /** @param list<array<string, string>> $contacts */
    private static function block(array $contacts, string $variant): string
    {
        $attributes = json_encode(
            ['contacts' => $contacts, 'variant' => $variant],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_AMP | JSON_THROW_ON_ERROR
        );

        return sprintf('<!-- wp:zdw/contacts %s /-->', $attributes);
    }
}
