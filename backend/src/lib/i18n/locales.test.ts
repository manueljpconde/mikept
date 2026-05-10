import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isValidLocale } from "./locales";

describe("SUPPORTED_LOCALES", () => {
    it("contains exactly en, pt, es, fr, de in canonical order", () => {
        assert.deepEqual([...SUPPORTED_LOCALES], ["en", "pt", "es", "fr", "de"]);
    });

    it("uses 'en' as the default locale", () => {
        assert.equal(DEFAULT_LOCALE, "en");
    });
});

describe("isValidLocale", () => {
    it("accepts every supported locale", () => {
        for (const locale of SUPPORTED_LOCALES) {
            assert.equal(isValidLocale(locale), true, locale);
        }
    });

    it("rejects unsupported strings", () => {
        assert.equal(isValidLocale("xx"), false);
        assert.equal(isValidLocale("pt-BR"), false);
        assert.equal(isValidLocale("EN"), false);
        assert.equal(isValidLocale(""), false);
    });

    it("rejects non-string inputs", () => {
        assert.equal(isValidLocale(null), false);
        assert.equal(isValidLocale(undefined), false);
        assert.equal(isValidLocale(42), false);
        assert.equal(isValidLocale({}), false);
        assert.equal(isValidLocale(["en"]), false);
    });
});
