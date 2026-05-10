import {
    DEFAULT_LOCALE,
    LOCALES,
    isSupportedLocale,
    type SupportedLocale,
} from "./types";

type ResolveLocaleArgs = {
    cookieValue?: string | null;
    acceptLanguageHeader?: string | null;
    profileLocale?: string | null;
};

export function resolveLocale({
    cookieValue,
    acceptLanguageHeader,
    profileLocale,
}: ResolveLocaleArgs): SupportedLocale {
    if (isSupportedLocale(profileLocale)) return profileLocale;
    if (isSupportedLocale(cookieValue)) return cookieValue;
    return parseAcceptLanguage(acceptLanguageHeader) ?? DEFAULT_LOCALE;
}

function parseAcceptLanguage(
    header: string | null | undefined,
): SupportedLocale | null {
    if (typeof header !== "string" || header.length === 0) return null;
    const tags = header
        .split(",")
        .map((part) => {
            const [tag, ...params] = part.trim().split(";");
            const qParam = params
                .map((p) => p.trim())
                .find((p) => p.startsWith("q="));
            const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
            return {
                tag: tag.trim().toLowerCase(),
                q: Number.isFinite(q) ? q : 0,
            };
        })
        .filter(({ tag, q }) => tag.length > 0 && q > 0)
        .sort((a, b) => b.q - a.q);

    for (const { tag } of tags) {
        const base = tag.split("-")[0];
        if ((LOCALES as readonly string[]).includes(base)) {
            return base as SupportedLocale;
        }
    }
    return null;
}
