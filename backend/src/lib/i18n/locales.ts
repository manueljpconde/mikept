export const SUPPORTED_LOCALES = ["en", "pt", "es", "fr", "de"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isValidLocale(value: unknown): value is SupportedLocale {
    return (
        typeof value === "string" &&
        (SUPPORTED_LOCALES as readonly string[]).includes(value)
    );
}
