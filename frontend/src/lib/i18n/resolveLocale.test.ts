import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLocale } from "./resolveLocale";

describe("resolveLocale", () => {
    it("uses 'en' fallback when nothing is provided", () => {
        assert.equal(resolveLocale({}), "en");
    });

    it("prefers profileLocale over cookie and Accept-Language", () => {
        assert.equal(
            resolveLocale({
                cookieValue: "es",
                acceptLanguageHeader: "fr-FR",
                profileLocale: "de",
            }),
            "de",
        );
    });

    it("prefers cookie over Accept-Language when profileLocale absent", () => {
        assert.equal(
            resolveLocale({
                cookieValue: "pt",
                acceptLanguageHeader: "de-DE,de;q=0.9",
            }),
            "pt",
        );
    });

    it("ignores invalid cookie values and falls through", () => {
        assert.equal(
            resolveLocale({
                cookieValue: "pt-BR",
                acceptLanguageHeader: "fr-FR",
            }),
            "fr",
        );
        assert.equal(
            resolveLocale({
                cookieValue: "xx",
                acceptLanguageHeader: "de",
            }),
            "de",
        );
    });

    it("normalizes regional Accept-Language to base locale", () => {
        assert.equal(
            resolveLocale({ acceptLanguageHeader: "pt-BR" }),
            "pt",
        );
        assert.equal(
            resolveLocale({ acceptLanguageHeader: "pt-PT" }),
            "pt",
        );
        assert.equal(
            resolveLocale({ acceptLanguageHeader: "de-DE" }),
            "de",
        );
        assert.equal(
            resolveLocale({ acceptLanguageHeader: "es-MX" }),
            "es",
        );
    });

    it("respects q-weighted Accept-Language order", () => {
        assert.equal(
            resolveLocale({
                acceptLanguageHeader: "de;q=0.5, fr;q=0.9, en;q=0.1",
            }),
            "fr",
        );
    });

    it("falls through to next supported tag when first is unknown", () => {
        assert.equal(
            resolveLocale({
                acceptLanguageHeader: "ja, ko, pt;q=0.9, en;q=0.8",
            }),
            "pt",
        );
    });

    it("falls back to 'en' when no Accept-Language tag is supported", () => {
        assert.equal(
            resolveLocale({ acceptLanguageHeader: "ja, ko, zh-CN" }),
            "en",
        );
    });

    it("tolerates null / undefined / empty inputs", () => {
        assert.equal(
            resolveLocale({
                cookieValue: null,
                acceptLanguageHeader: null,
                profileLocale: null,
            }),
            "en",
        );
        assert.equal(
            resolveLocale({
                cookieValue: "",
                acceptLanguageHeader: "",
            }),
            "en",
        );
    });

    it("ignores invalid profileLocale", () => {
        assert.equal(
            resolveLocale({
                profileLocale: "xx",
                cookieValue: "pt",
            }),
            "pt",
        );
    });
});
