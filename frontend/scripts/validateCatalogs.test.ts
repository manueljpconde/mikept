import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCatalogSet } from "./validateCatalogs.ts";

const PASS = {
    en: { greet: "Hi", n: { one: "{count} doc", other: "{count} docs" } },
    pt: { greet: "Olá", n: { one: "{count} doc", other: "{count} docs" } },
};

describe("validateCatalogSet — happy path", () => {
    it("accepts a structurally identical pair", () => {
        const result = validateCatalogSet(PASS);
        assert.equal(result.ok, true, JSON.stringify(result.errors));
        assert.deepEqual(result.keyCounts, { en: 2, pt: 2 });
    });
});

describe("validateCatalogSet — rejection rules", () => {
    it("rejects missing key in non-en locale", () => {
        const result = validateCatalogSet({
            en: { a: "A", b: "B" },
            pt: { a: "A" },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some(
                (e) => e.locale === "pt" && e.rule === "missing-key" && e.message.includes("b"),
            ),
        );
    });

    it("rejects extra key in non-en locale", () => {
        const result = validateCatalogSet({
            en: { a: "A" },
            pt: { a: "A", z: "Z" },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some(
                (e) => e.locale === "pt" && e.rule === "extra-key" && e.message.includes("z"),
            ),
        );
    });

    it("rejects empty values (string)", () => {
        const result = validateCatalogSet({
            en: { a: "A" },
            pt: { a: "  " },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.rule === "empty-value"));
    });

    it("rejects empty values (plural variant)", () => {
        const result = validateCatalogSet({
            en: { n: { one: "1", other: "many" } },
            pt: { n: { one: "", other: "muitos" } },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.rule === "empty-value"));
    });

    it("rejects shape mismatch (string vs object)", () => {
        const result = validateCatalogSet({
            en: { a: "A" },
            pt: { a: { one: "x", other: "y" } },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((e) => e.locale === "pt" && e.rule === "shape-mismatch"),
        );
    });

    it("rejects plural variant key mismatch", () => {
        const result = validateCatalogSet({
            en: { n: { one: "1", other: "many" } },
            pt: { n: { one: "1" } },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some(
                (e) => e.rule === "plural-variant-mismatch" || e.rule === "missing-other",
            ),
        );
    });

    it("rejects plural missing 'other' variant", () => {
        const result = validateCatalogSet({
            en: { n: { one: "1" } },
            pt: { n: { one: "1" } },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.filter((e) => e.rule === "missing-other").length >= 1,
        );
    });

    it("rejects placeholder mismatch (strings)", () => {
        const result = validateCatalogSet({
            en: { greet: "Hi {name}" },
            pt: { greet: "Olá" },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((e) => e.rule === "placeholder-mismatch"),
        );
    });

    it("rejects placeholder mismatch in plural variant", () => {
        const result = validateCatalogSet({
            en: { n: { one: "{count} doc", other: "{count} docs" } },
            pt: { n: { one: "1 doc", other: "muitos docs" } },
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((e) => e.rule === "placeholder-mismatch"),
        );
    });

    it("rejects blank top-level key", () => {
        const result = validateCatalogSet({
            en: { "": "blank", a: "A" },
            pt: { "": "blank", a: "A" },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.rule === "blank-key"));
    });

    it("rejects non-object root", () => {
        const result = validateCatalogSet({
            en: { a: "A" },
            pt: ["array", "not", "object"],
        });
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((e) => e.locale === "pt" && e.rule === "shape"),
        );
    });

    it("treats invalid en reference as fatal", () => {
        const result = validateCatalogSet({ en: "not an object", pt: { a: "A" } });
        assert.equal(result.ok, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].locale, "en");
    });
});
