"use client";

import { useState } from "react";
import { useT } from "@/contexts/I18nContext";
import {
    LOCALES,
    LOCALE_LABELS,
    type SupportedLocale,
} from "@/lib/i18n/types";

type LanguageSwitcherProps = {
    onLocaleChange?: (next: SupportedLocale) => Promise<void> | void;
    className?: string;
};

export function LanguageSwitcher({
    onLocaleChange,
    className,
}: LanguageSwitcherProps) {
    const { locale, setLocale, t } = useT();
    const [busy, setBusy] = useState(false);

    return (
        <select
            aria-label={t("common.language")}
            value={locale}
            disabled={busy}
            onChange={async (e) => {
                const next = e.target.value as SupportedLocale;
                if (next === locale) return;
                setBusy(true);
                try {
                    const ok = await setLocale(next);
                    if (!ok) return;
                    if (onLocaleChange) {
                        try {
                            await onLocaleChange(next);
                        } catch {
                            if (typeof window !== "undefined") {
                                window.alert(t("common.localePersistFailed"));
                            }
                        }
                    }
                } finally {
                    setBusy(false);
                }
            }}
            className={
                className ??
                "rounded-md border border-input bg-background px-2 py-1 text-sm"
            }
        >
            {LOCALES.map((code) => (
                <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                </option>
            ))}
        </select>
    );
}
