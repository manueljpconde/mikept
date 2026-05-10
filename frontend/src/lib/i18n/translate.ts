import {
    DEFAULT_LOCALE,
    type Catalog,
    type CatalogEntry,
    type SupportedLocale,
} from "./types";

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

const warnedKeys = new Set<string>();

function devWarn(message: string) {
    if (process.env.NODE_ENV === "production") return;
    if (warnedKeys.has(message)) return;
    warnedKeys.add(message);
    console.warn(message);
}

function interpolate(
    template: string,
    vars: Record<string, unknown> | undefined,
    keyForWarn: string,
): string {
    return template.replace(PLACEHOLDER_RE, (_, name: string) => {
        if (!vars || !(name in vars)) {
            devWarn(`[i18n] Missing variable {${name}} in '${keyForWarn}'`);
            return "";
        }
        const value = vars[name];
        return value === undefined || value === null ? "" : String(value);
    });
}

function selectPluralVariant(
    entry: Record<string, string>,
    locale: SupportedLocale,
    count: number,
    keyForWarn: string,
): string | null {
    const category = new Intl.PluralRules(locale).select(count);
    if (category in entry) return entry[category];
    if ("other" in entry) return entry.other;
    devWarn(`[i18n] Plural at '${keyForWarn}' missing 'other' variant`);
    return null;
}

function resolveEntry(
    entry: CatalogEntry,
    locale: SupportedLocale,
    vars: Record<string, unknown> | undefined,
    keyForWarn: string,
): string | null {
    if (typeof entry === "string") {
        return interpolate(entry, vars, keyForWarn);
    }
    const count = vars?.count;
    if (typeof count !== "number") {
        devWarn(`[i18n] Plural key '${keyForWarn}' requires a numeric 'count'`);
        return null;
    }
    const variant = selectPluralVariant(entry, locale, count, keyForWarn);
    if (variant === null) return null;
    return interpolate(variant, vars, keyForWarn);
}

export function lookupTranslation(
    catalog: Catalog,
    key: string,
    vars: Record<string, unknown> | undefined,
    locale: SupportedLocale,
    fallbackCatalog?: Catalog,
): string {
    const entry = catalog[key];
    if (entry !== undefined) {
        const resolved = resolveEntry(entry, locale, vars, key);
        if (resolved !== null) return resolved;
    }
    if (locale !== DEFAULT_LOCALE && fallbackCatalog) {
        const fallback = fallbackCatalog[key];
        if (fallback !== undefined) {
            const resolved = resolveEntry(
                fallback,
                DEFAULT_LOCALE,
                vars,
                key,
            );
            if (resolved !== null) return resolved;
        }
    }
    devWarn(`[i18n] Missing translation key: '${key}'`);
    return key;
}

export function __resetWarnCacheForTests() {
    warnedKeys.clear();
}
