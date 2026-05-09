import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    DEFAULT_MAIN_MODEL,
    LOCAL_MODEL_ID,
    providerForModel,
    resolveModel,
} from "./models";

describe("providerForModel", () => {
    it("keeps existing provider inference stable", () => {
        assert.equal(providerForModel("claude-sonnet-4-6"), "claude");
        assert.equal(providerForModel("gemini-3-flash-preview"), "gemini");
        assert.equal(providerForModel("gpt-5.4-mini"), "openai");
    });

    it("routes the server-configured local model to the local provider", () => {
        assert.equal(providerForModel(LOCAL_MODEL_ID), "local");
    });

    it("still rejects unknown model ids", () => {
        assert.throws(() => providerForModel("not-a-model"), /Unknown model id/);
    });
});

describe("resolveModel", () => {
    it("keeps invalid model fallback behavior stable", () => {
        assert.equal(resolveModel(null, DEFAULT_MAIN_MODEL), DEFAULT_MAIN_MODEL);
        assert.equal(
            resolveModel("not-a-model", DEFAULT_MAIN_MODEL),
            DEFAULT_MAIN_MODEL,
        );
    });

    it("accepts the canonical local model id only when local is enabled", () => {
        assert.equal(
            resolveModel(LOCAL_MODEL_ID, DEFAULT_MAIN_MODEL, {
                localEnabled: true,
            }),
            LOCAL_MODEL_ID,
        );
        assert.equal(
            resolveModel(LOCAL_MODEL_ID, DEFAULT_MAIN_MODEL, {
                localEnabled: false,
            }),
            DEFAULT_MAIN_MODEL,
        );
    });
});
