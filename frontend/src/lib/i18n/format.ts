import { type SupportedLocale } from "./types";

const LOCALE_TAGS: Record<SupportedLocale, string> = {
    en: "en",
    pt: "pt-PT",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
};

export function formatDate(
    locale: SupportedLocale,
    date: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
): string {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(LOCALE_TAGS[locale], options).format(d);
}

export function formatNumber(
    locale: SupportedLocale,
    value: number,
    options?: Intl.NumberFormatOptions,
): string {
    return new Intl.NumberFormat(LOCALE_TAGS[locale], options).format(value);
}

export function formatCurrency(
    locale: SupportedLocale,
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
): string {
    return new Intl.NumberFormat(LOCALE_TAGS[locale], {
        ...options,
        style: "currency",
        currency,
    }).format(value);
}

export function formatRelativeTime(
    locale: SupportedLocale,
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
): string {
    return new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], options).format(
        value,
        unit,
    );
}
