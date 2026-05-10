export const LOCALES = ["en", "pt", "es", "fr", "de"] as const;

export type SupportedLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
    en: "English",
    pt: "Português",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
};

export type CatalogEntry = string | Record<string, string>;
export type Catalog = Record<string, CatalogEntry>;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
    return (
        typeof value === "string" &&
        (LOCALES as readonly string[]).includes(value)
    );
}
