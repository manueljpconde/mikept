import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDuplicateTopLevelKeys } from "./findDuplicateTopLevelKeys.ts";

describe("findDuplicateTopLevelKeys", () => {
    it("returns no duplicates when keys are unique", () => {
        const json = `{
            "a": "1",
            "b": "2",
            "c": "3"
        }`;
        assert.deepEqual(findDuplicateTopLevelKeys(json), []);
    });

    it("detects a single duplicate", () => {
        const json = `{
            "a": "1",
            "b": "2",
            "a": "3"
        }`;
        const dups = findDuplicateTopLevelKeys(json);
        assert.equal(dups.length, 1);
        assert.equal(dups[0].key, "a");
        assert.equal(dups[0].firstLine, 2);
        assert.equal(dups[0].secondLine, 4);
    });

    it("detects multiple duplicates", () => {
        const json = `{
            "a": "1",
            "b": "2",
            "a": "3",
            "b": "4"
        }`;
        const dups = findDuplicateTopLevelKeys(json);
        assert.equal(dups.length, 2);
        assert.deepEqual(
            dups.map((d) => d.key).sort(),
            ["a", "b"],
        );
    });

    it("ignores nested keys with the same name as a top-level key", () => {
        const json = `{
            "a": "1",
            "b": { "a": "nested" },
            "c": { "a": "also nested" }
        }`;
        assert.deepEqual(findDuplicateTopLevelKeys(json), []);
    });

    it("treats a duplicate top-level plural object key as duplicate", () => {
        const json = `{
            "n": { "one": "1", "other": "many" },
            "n": { "one": "x", "other": "y" }
        }`;
        const dups = findDuplicateTopLevelKeys(json);
        assert.equal(dups.length, 1);
        assert.equal(dups[0].key, "n");
    });

    it("does not flag the same key occurring inside nested objects multiple times", () => {
        const json = `{
            "first": { "label": "a" },
            "second": { "label": "b" }
        }`;
        assert.deepEqual(findDuplicateTopLevelKeys(json), []);
    });

    it("handles escaped quotes in string values without false positives", () => {
        const json = `{
            "a": "value with \\"quotes\\" inside",
            "b": "another"
        }`;
        assert.deepEqual(findDuplicateTopLevelKeys(json), []);
    });

    it("handles dotted key names", () => {
        const json = `{
            "common.save": "Save",
            "common.save": "Salvar"
        }`;
        const dups = findDuplicateTopLevelKeys(json);
        assert.equal(dups.length, 1);
        assert.equal(dups[0].key, "common.save");
    });

    it("ignores key-shaped strings inside nested arrays/objects", () => {
        const json = `{
            "a": ["nested-key", "another"],
            "b": "value"
        }`;
        assert.deepEqual(findDuplicateTopLevelKeys(json), []);
    });
});
