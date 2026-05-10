"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { ProfileLocaleSync } from "@/app/components/i18n/ProfileLocaleSync";
import type { Catalog, SupportedLocale } from "@/lib/i18n/types";

type ProvidersProps = {
    children: React.ReactNode;
    initialLocale: SupportedLocale;
    initialCatalog: Catalog;
};

export function Providers({
    children,
    initialLocale,
    initialCatalog,
}: ProvidersProps) {
    return (
        <I18nProvider
            initialLocale={initialLocale}
            initialCatalog={initialCatalog}
        >
            <AuthProvider>
                <UserProfileProvider>
                    <ProfileLocaleSync />
                    {children}
                </UserProfileProvider>
            </AuthProvider>
        </I18nProvider>
    );
}
