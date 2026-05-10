import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { __resetWarnCacheForTests, lookupTranslation } from "./translate";
import { type Catalog } from "./types";

beforeEach(() => __resetWarnCacheForTests());

describe("lookupTranslation — strings", () => {
    it("returns the raw string when no placeholders", () => {
        const cat: Catalog = { "common.save": "Save" };
        assert.equal(lookupTranslation(cat, "common.save", undefined, "en"), "Save");
    });

    it("interpolates {name} placeholders", () => {
        const cat: Catalog = { "hello.greeting": "Hello, {name}" };
        assert.equal(
            lookupTranslation(cat, "hello.greeting", { name: "Mike" }, "en"),
            "Hello, Mike",
        );
    });

    it("interpolates multiple placeholders", () => {
        const cat: Catalog = {
            "documents.uploadFailed": "Upload failed: {reason} ({code})",
        };
        assert.equal(
            lookupTranslation(
                cat,
                "documents.uploadFailed",
                { reason: "size", code: 413 },
                "en",
            ),
            "Upload failed: size (413)",
        );
    });

    it("renders missing placeholder as empty string", () => {
        const cat: Catalog = { greet: "Hello, {name}" };
        assert.equal(lookupTranslation(cat, "greet", {}, "en"), "Hello, ");
    });

    it("renders null/undefined values as empty string", () => {
        const cat: Catalog = { greet: "Hello, {name}" };
        assert.equal(
            lookupTranslation(cat, "greet", { name: null }, "en"),
            "Hello, ",
        );
        assert.equal(
            lookupTranslation(cat, "greet", { name: undefined }, "en"),
            "Hello, ",
        );
    });
});

describe("lookupTranslation — plurals", () => {
    const cat: Catalog = {
        "documents.count": {
            one: "{count} document",
            other: "{count} documents",
        },
    };

    it("selects 'one' for count=1", () => {
        assert.equal(
            lookupTranslation(cat, "documents.count", { count: 1 }, "en"),
            "1 document",
        );
    });

    it("selects 'other' for count=2", () => {
        assert.equal(
            lookupTranslation(cat, "documents.count", { count: 5 }, "en"),
            "5 documents",
        );
    });

    it("falls back to 'other' when category absent", () => {
        const sparse: Catalog = {
            x: { other: "{count} things" },
        };
        assert.equal(
            lookupTranslation(sparse, "x", { count: 1 }, "en"),
            "1 things",
        );
    });

    it("returns key when 'other' missing", () => {
        const broken: Catalog = { x: { one: "single" } };
        assert.equal(
            lookupTranslation(broken, "x", { count: 5 }, "en"),
            "x",
        );
    });

    it("returns key when count is not a number", () => {
        assert.equal(
            lookupTranslation(cat, "documents.count", {}, "en"),
            "documents.count",
        );
    });

    it("respects locale-specific CLDR rules — pt treats count=0 as singular while en treats it as plural", () => {
        const c: Catalog = {
            n: { one: "{count} arquivo", other: "{count} arquivos" },
        };
        assert.equal(lookupTranslation(c, "n", { count: 0 }, "pt"), "0 arquivo");
        assert.equal(lookupTranslation(c, "n", { count: 0 }, "en"), "0 arquivos");
        assert.equal(lookupTranslation(c, "n", { count: 1 }, "pt"), "1 arquivo");
        assert.equal(lookupTranslation(c, "n", { count: 5 }, "pt"), "5 arquivos");
    });
});

describe("lookupTranslation — fallback chain", () => {
    it("falls through to fallbackCatalog when key missing in active locale", () => {
        const pt: Catalog = {};
        const en: Catalog = { "common.save": "Save" };
        assert.equal(
            lookupTranslation(pt, "common.save", undefined, "pt", en),
            "Save",
        );
    });

    it("does not consult fallbackCatalog when active locale is en", () => {
        const en: Catalog = {};
        const fallback: Catalog = { "common.save": "Save" };
        assert.equal(
            lookupTranslation(en, "common.save", undefined, "en", fallback),
            "common.save",
        );
    });

    it("returns key when missing from both", () => {
        assert.equal(
            lookupTranslation({}, "missing", undefined, "pt", {}),
            "missing",
        );
    });
});
