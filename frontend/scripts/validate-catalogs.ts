import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateTopLevelKeys } from "./findDuplicateTopLevelKeys.ts";
import { validateCatalogSet, type ValidationError } from "./validateCatalogs.ts";

const LOCALES = ["en", "pt", "es", "fr", "de"] as const;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

type Loaded = {
    catalogs: Record<string, unknown>;
    parseErrors: ValidationError[];
};

function loadCatalogs(): Loaded {
    const catalogs: Record<string, unknown> = {};
    const parseErrors: ValidationError[] = [];
    for (const locale of LOCALES) {
        const path = resolve(ROOT, "src", "locales", `${locale}.json`);
        let raw: string;
        try {
            raw = readFileSync(path, "utf8");
        } catch (err) {
            parseErrors.push({
                locale,
                rule: "file",
                message: `could not read ${path}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            });
            continue;
        }
        if (raw.includes("�")) {
            parseErrors.push({
                locale,
                rule: "utf8",
                message: "file contains invalid UTF-8 (replacement char detected)",
            });
        }
        for (const dup of findDuplicateTopLevelKeys(raw)) {
            parseErrors.push({
                locale,
                rule: "duplicate-key",
                message: `duplicate top-level key '${dup.key}' (lines ${dup.firstLine} and ${dup.secondLine})`,
            });
        }
        try {
            catalogs[locale] = JSON.parse(raw);
        } catch (err) {
            parseErrors.push({
                locale,
                rule: "json",
                message: `not valid JSON: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            });
        }
    }
    return { catalogs, parseErrors };
}

function groupErrors(errors: ValidationError[]): Map<string, ValidationError[]> {
    const grouped = new Map<string, ValidationError[]>();
    for (const err of errors) {
        const list = grouped.get(err.locale) ?? [];
        list.push(err);
        grouped.set(err.locale, list);
    }
    return grouped;
}

function main() {
    const { catalogs, parseErrors } = loadCatalogs();

    const allErrors = [...parseErrors];
    if (Object.keys(catalogs).length > 0) {
        const result = validateCatalogSet(catalogs);
        allErrors.push(...result.errors);
        if (result.ok && parseErrors.length === 0) {
            for (const locale of LOCALES) {
                const count = result.keyCounts[locale] ?? 0;
                console.log(`${locale}: ✓ ${count} keys`);
            }
            return;
        }
    }

    const grouped = groupErrors(allErrors);
    for (const locale of LOCALES) {
        const localeErrors = grouped.get(locale) ?? [];
        if (localeErrors.length === 0) {
            console.log(`${locale}: ✓`);
        } else {
            console.log(`${locale}: ✗ ${localeErrors.length} issue(s)`);
            for (const err of localeErrors) {
                console.log(`  - ${err.message}`);
            }
        }
    }
    console.log("\nVALIDATION FAILED");
    process.exit(1);
}

main();
