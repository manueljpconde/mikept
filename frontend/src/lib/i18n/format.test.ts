import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    formatCurrency,
    formatDate,
    formatNumber,
    formatRelativeTime,
} from "./format";

describe("formatNumber", () => {
    it("returns a non-empty string", () => {
        assert.match(formatNumber("en", 1234.5), /\d/);
    });

    it("differs between locales for the same input", () => {
        assert.notEqual(formatNumber("en", 1234.5), formatNumber("de", 1234.5));
    });
});

describe("formatCurrency", () => {
    it("contains either a currency symbol or code", () => {
        const out = formatCurrency("en", 99, "EUR");
        assert.match(out, /€|EUR/);
    });

    it("differs between locales for the same currency", () => {
        assert.notEqual(
            formatCurrency("en", 99, "EUR"),
            formatCurrency("de", 99, "EUR"),
        );
    });
});

describe("formatDate", () => {
    it("returns a non-empty string", () => {
        const fixed = new Date("2025-03-15T12:00:00Z");
        assert.ok(formatDate("en", fixed).length > 0);
    });

    it("differs between locales for a fixed date", () => {
        const fixed = new Date("2025-03-15T12:00:00Z");
        assert.notEqual(
            formatDate("en", fixed, { dateStyle: "long" }),
            formatDate("de", fixed, { dateStyle: "long" }),
        );
    });
});

describe("formatRelativeTime", () => {
    it("returns a non-empty string", () => {
        assert.ok(formatRelativeTime("en", -1, "day").length > 0);
    });

    it("differs between locales", () => {
        assert.notEqual(
            formatRelativeTime("en", -1, "day"),
            formatRelativeTime("pt", -1, "day"),
        );
    });
});
