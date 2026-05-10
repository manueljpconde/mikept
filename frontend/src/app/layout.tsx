import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { loadCatalog } from "@/lib/i18n/catalog";
import { resolveLocale } from "@/lib/i18n/resolveLocale";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
    variable: "--font-eb-garamond",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://app.mikeoss.com"),
    title: "Mike - AI Legal Platform",
    description:
        "AI-powered legal document analysis and contract review platform.",
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        url: "https://app.mikeoss.com",
        siteName: "Mike",
        title: "Mike - AI Legal Platform",
        description:
            "AI-powered legal document analysis and contract review platform.",
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: "Mike",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Mike - AI Legal Platform",
        description:
            "AI-powered legal document analysis and contract review platform.",
        images: ["/link-image.jpg"],
    },
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const locale = resolveLocale({
        cookieValue: cookieStore.get("mike_locale")?.value,
        acceptLanguageHeader: headerStore.get("accept-language"),
    });
    const catalog = await loadCatalog(locale);
    return (
        <html lang={locale}>
            <body
                className={`${inter.variable} ${ebGaramond.variable} font-sans antialiased`}
            >
                <Providers initialLocale={locale} initialCatalog={catalog}>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
