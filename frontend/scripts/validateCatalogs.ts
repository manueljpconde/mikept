export type ValidationError = {
    locale: string;
    rule: string;
    message: string;
};

export type ValidationResult = {
    ok: boolean;
    errors: ValidationError[];
    keyCounts: Record<string, number>;
};

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const REFERENCE = "en";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function extractPlaceholders(text: string): Set<string> {
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
        found.add(match[1]);
    }
    return found;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

function describeSet(s: Set<string>): string {
    return `{${[...s].sort().join(",")}}`;
}

function isPluralEntry(
    value: unknown,
): value is Record<string, string> {
    if (!isPlainObject(value)) return false;
    for (const v of Object.values(value)) {
        if (typeof v !== "string") return false;
    }
    return true;
}

export function validateCatalogSet(
    catalogs: Record<string, unknown>,
): ValidationResult {
    const errors: ValidationError[] = [];
    const keyCounts: Record<string, number> = {};

    const reference = catalogs[REFERENCE];
    if (!isPlainObject(reference)) {
        errors.push({
            locale: REFERENCE,
            rule: "shape",
            message: "reference catalog 'en' must be a plain object",
        });
        return { ok: false, errors, keyCounts };
    }

    const referenceKeys = new Set(Object.keys(reference));
    keyCounts[REFERENCE] = referenceKeys.size;

    for (const [locale, catalog] of Object.entries(catalogs)) {
        if (!isPlainObject(catalog)) {
            errors.push({
                locale,
                rule: "shape",
                message: `root must be a plain object`,
            });
            continue;
        }

        const localeKeys = new Set(Object.keys(catalog));
        keyCounts[locale] = localeKeys.size;

        for (const key of Object.keys(catalog)) {
            if (key.trim().length === 0) {
                errors.push({
                    locale,
                    rule: "blank-key",
                    message: `blank top-level key`,
                });
            }
        }

        if (locale !== REFERENCE) {
            for (const key of referenceKeys) {
                if (!localeKeys.has(key)) {
                    errors.push({
                        locale,
                        rule: "missing-key",
                        message: `missing key: ${key}`,
                    });
                }
            }
            for (const key of localeKeys) {
                if (!referenceKeys.has(key)) {
                    errors.push({
                        locale,
                        rule: "extra-key",
                        message: `extra key not in en: ${key}`,
                    });
                }
            }
        }

        for (const key of localeKeys) {
            const localValue = catalog[key];
            const refValue = reference[key];

            if (locale !== REFERENCE && refValue === undefined) continue;
            const valueForShapeCheck =
                locale === REFERENCE ? localValue : refValue;
            const refIsPlural = isPluralEntry(valueForShapeCheck);

            const localIsPlural =
                typeof localValue !== "string" && isPluralEntry(localValue);

            if (refIsPlural !== localIsPlural) {
                errors.push({
                    locale,
                    rule: "shape-mismatch",
                    message: `shape mismatch at ${key}: en=${
                        refIsPlural ? "object" : "string"
                    }, ${locale}=${
                        typeof localValue === "string"
                            ? "string"
                            : isPluralEntry(localValue)
                                ? "object"
                                : "invalid"
                    }`,
                });
                continue;
            }

            if (typeof localValue === "string") {
                if (localValue.trim().length === 0) {
                    errors.push({
                        locale,
                        rule: "empty-value",
                        message: `empty value at ${key}`,
                    });
                    continue;
                }
                if (locale !== REFERENCE && typeof refValue === "string") {
                    const refPh = extractPlaceholders(refValue);
                    const localPh = extractPlaceholders(localValue);
                    if (!setsEqual(refPh, localPh)) {
                        errors.push({
                            locale,
                            rule: "placeholder-mismatch",
                            message: `placeholder mismatch at ${key}: en=${describeSet(
                                refPh,
                            )}, ${locale}=${describeSet(localPh)}`,
                        });
                    }
                }
            } else if (isPluralEntry(localValue)) {
                const variants = Object.keys(localValue);
                for (const variant of variants) {
                    if (variant.trim().length === 0) {
                        errors.push({
                            locale,
                            rule: "blank-key",
                            message: `blank plural variant key at ${key}`,
                        });
                    }
                }

                if (!("other" in localValue)) {
                    errors.push({
                        locale,
                        rule: "missing-other",
                        message: `plural at ${key} missing required 'other' variant`,
                    });
                }

                for (const [variant, value] of Object.entries(localValue)) {
                    if (typeof value !== "string" || value.trim().length === 0) {
                        errors.push({
                            locale,
                            rule: "empty-value",
                            message: `empty plural variant at ${key}.${variant}`,
                        });
                    }
                }

                if (locale !== REFERENCE && isPluralEntry(refValue)) {
                    const refVariants = new Set(Object.keys(refValue));
                    const localVariants = new Set(variants);
                    if (!setsEqual(refVariants, localVariants)) {
                        errors.push({
                            locale,
                            rule: "plural-variant-mismatch",
                            message: `plural mismatch at ${key}: en=${describeSet(
                                refVariants,
                            )}, ${locale}=${describeSet(localVariants)}`,
                        });
                    }

                    for (const [variant, value] of Object.entries(localValue)) {
                        const refVariant = (refValue as Record<string, string>)[
                            variant
                        ];
                        if (
                            typeof refVariant === "string" &&
                            typeof value === "string"
                        ) {
                            const refPh = extractPlaceholders(refVariant);
                            const localPh = extractPlaceholders(value);
                            if (!setsEqual(refPh, localPh)) {
                                errors.push({
                                    locale,
                                    rule: "placeholder-mismatch",
                                    message: `placeholder mismatch at ${key}.${variant}: en=${describeSet(
                                        refPh,
                                    )}, ${locale}=${describeSet(localPh)}`,
                                });
                            }
                        }
                    }
                }
            } else {
                errors.push({
                    locale,
                    rule: "shape",
                    message: `value at ${key} must be string or plain plural object`,
                });
            }
        }
    }

    return { ok: errors.length === 0, errors, keyCounts };
}
