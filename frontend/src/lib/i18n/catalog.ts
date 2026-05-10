import enCatalog from "@/locales/en.json";
import { type Catalog, type SupportedLocale } from "./types";

export const catalogLoaders: Record<
    SupportedLocale,
    () => Promise<Catalog>
> = {
    en: () => Promise.resolve(enCatalog as Catalog),
    pt: () => import("@/locales/pt.json").then((m) => m.default as Catalog),
    es: () => import("@/locales/es.json").then((m) => m.default as Catalog),
    fr: () => import("@/locales/fr.json").then((m) => m.default as Catalog),
    de: () => import("@/locales/de.json").then((m) => m.default as Catalog),
};

export async function loadCatalog(locale: SupportedLocale): Promise<Catalog> {
    try {
        return await catalogLoaders[locale]();
    } catch (err) {
        console.error(
            `[i18n] Failed to load catalog for ${locale}; falling back to en`,
            err,
        );
        return enCatalog as Catalog;
    }
}

let enCatalogPromise: Promise<Catalog> | null = null;
export function loadEnCatalog(): Promise<Catalog> {
    if (!enCatalogPromise) enCatalogPromise = catalogLoaders.en();
    return enCatalogPromise;
}
