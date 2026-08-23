<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

use InvalidArgumentException;

final class PreflightCheck
{
    public const PASS = 'pass';
    public const WARNING = 'warning';
    public const BLOCKER = 'blocker';

    private function __construct(
        private readonly string $severity,
        private readonly string $code,
        private readonly string $message
    ) {
        if (!in_array($severity, [self::PASS, self::WARNING, self::BLOCKER], true)) {
            throw new InvalidArgumentException('Invalid preflight severity.');
        }

        if ($code === '' || $message === '') {
            throw new InvalidArgumentException('Preflight code and message must not be empty.');
        }
    }

    public static function pass(string $code, string $message): self
    {
        return new self(self::PASS, $code, $message);
    }

    public static function warning(string $code, string $message): self
    {
        return new self(self::WARNING, $code, $message);
    }

    public static function blocker(string $code, string $message): self
    {
        return new self(self::BLOCKER, $code, $message);
    }

    public function severity(): string
    {
        return $this->severity;
    }

    public function code(): string
    {
        return $this->code;
    }

    public function message(): string
    {
        return $this->message;
    }

    public function isBlocking(): bool
    {
        return self::BLOCKER === $this->severity;
    }

    public function withCode(string $code): self
    {
        return new self($this->severity, $code, $this->message);
    }
}
