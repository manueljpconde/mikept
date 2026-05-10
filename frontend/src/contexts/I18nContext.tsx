"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { loadCatalog, loadEnCatalog } from "@/lib/i18n/catalog";
import {
    formatCurrency as fmtCurrency,
    formatDate as fmtDate,
    formatNumber as fmtNumber,
    formatRelativeTime as fmtRel,
} from "@/lib/i18n/format";
import { lookupTranslation } from "@/lib/i18n/translate";
import {
    DEFAULT_LOCALE,
    isSupportedLocale,
    type Catalog,
    type SupportedLocale,
} from "@/lib/i18n/types";

type I18nContextValue = {
    locale: SupportedLocale;
    setLocale: (next: SupportedLocale) => Promise<boolean>;
    t: (key: string, vars?: Record<string, unknown>) => string;
    formatDate: (
        date: Date | number | string,
        options?: Intl.DateTimeFormatOptions,
    ) => string;
    formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
    formatCurrency: (
        n: number,
        currency: string,
        options?: Intl.NumberFormatOptions,
    ) => string;
    formatRelativeTime: (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        options?: Intl.RelativeTimeFormatOptions,
    ) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const COOKIE_MAX_AGE = 31_536_000;

function writeLocaleCookie(locale: SupportedLocale) {
    if (typeof document === "undefined") return;
    document.cookie = `mike_locale=${locale}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function I18nProvider({
    initialLocale,
    initialCatalog,
    children,
}: {
    initialLocale: SupportedLocale;
    initialCatalog: Catalog;
    children: ReactNode;
}) {
    const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
    const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
    const [enFallback, setEnFallback] = useState<Catalog | null>(
        initialLocale === DEFAULT_LOCALE ? initialCatalog : null,
    );

    useEffect(() => {
        if (locale === DEFAULT_LOCALE || enFallback !== null) return;
        let cancelled = false;
        loadEnCatalog().then((cat) => {
            if (!cancelled) setEnFallback(cat);
        });
        return () => {
            cancelled = true;
        };
    }, [locale, enFallback]);

    const setLocale = useCallback(
        async (next: SupportedLocale): Promise<boolean> => {
            if (!isSupportedLocale(next)) {
                if (process.env.NODE_ENV !== "production") {
                    console.warn(`[i18n] setLocale ignored invalid value: ${String(next)}`);
                }
                return false;
            }
            if (next === locale) return true;
            try {
                const nextCatalog = await loadCatalog(next);
                setCatalog(nextCatalog);
                setLocaleState(next);
                writeLocaleCookie(next);
                return true;
            } catch (err) {
                if (process.env.NODE_ENV !== "production") {
                    console.warn(`[i18n] setLocale failed to load ${next}`, err);
                }
                return false;
            }
        },
        [locale],
    );

    const value = useMemo<I18nContextValue>(
        () => ({
            locale,
            setLocale,
            t: (key, vars) =>
                lookupTranslation(catalog, key, vars, locale, enFallback ?? undefined),
            formatDate: (date, options) => fmtDate(locale, date, options),
            formatNumber: (n, options) => fmtNumber(locale, n, options),
            formatCurrency: (n, currency, options) =>
                fmtCurrency(locale, n, currency, options),
            formatRelativeTime: (v, unit, options) => fmtRel(locale, v, unit, options),
        }),
        [locale, catalog, enFallback, setLocale],
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useT must be used within an I18nProvider");
    return ctx;
}

export function useLocale(): {
    locale: SupportedLocale;
    setLocale: I18nContextValue["setLocale"];
} {
    const { locale, setLocale } = useT();
    return { locale, setLocale };
}

export function useLocaleRef() {
    return useRef<SupportedLocale | null>(null);
}
