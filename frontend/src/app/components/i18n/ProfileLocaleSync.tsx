"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/contexts/I18nContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { isSupportedLocale, type SupportedLocale } from "@/lib/i18n/types";

export function ProfileLocaleSync() {
    const { profile } = useUserProfile();
    const { locale, setLocale } = useLocale();
    const lastApplied = useRef<SupportedLocale | null>(null);

    useEffect(() => {
        const profileLocale = (profile as { locale?: unknown } | null)?.locale;
        if (!isSupportedLocale(profileLocale)) return;
        if (profileLocale === locale) {
            lastApplied.current = profileLocale;
            return;
        }
        if (profileLocale === lastApplied.current) return;
        lastApplied.current = profileLocale;
        void setLocale(profileLocale);
    }, [profile, locale, setLocale]);

    return null;
}
