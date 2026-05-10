import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateCatalogSet } from "./validateCatalogs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

describe("shipped catalogs", () => {
    it("pass full validation against en as canonical", () => {
        const catalogs: Record<string, unknown> = {};
        for (const locale of ["en", "pt", "es", "fr", "de"]) {
            const raw = readFileSync(
                resolve(ROOT, "src", "locales", `${locale}.json`),
                "utf8",
            );
            catalogs[locale] = JSON.parse(raw);
        }
        const result = validateCatalogSet(catalogs);
        assert.equal(
            result.ok,
            true,
            `validation failed:\n${result.errors
                .map((e) => `  [${e.locale}] ${e.rule}: ${e.message}`)
                .join("\n")}`,
        );
    });
});
