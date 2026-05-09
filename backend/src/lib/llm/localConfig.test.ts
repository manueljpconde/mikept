import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    LOCAL_MODEL_ID,
    getLocalLlmConfig,
    getLocalProviderStatus,
} from "./localConfig";

describe("getLocalLlmConfig", () => {
    it("is disabled unless explicitly enabled", () => {
        const config = getLocalLlmConfig({});

        assert.equal(config.enabled, false);
        assert.equal(config.baseUrl, null);
        assert.equal(config.model, null);
    });

    it("requires a model when enabled", () => {
        assert.throws(
            () =>
                getLocalLlmConfig({
                    ENABLE_LOCAL_LLM: "true",
                    LOCAL_LLM_BASE_URL: "http://localhost:11434/v1",
                }),
            /LOCAL_LLM_MODEL/,
        );
    });

    it("requires an http or https base URL", () => {
        assert.throws(
            () =>
                getLocalLlmConfig({
                    ENABLE_LOCAL_LLM: "true",
                    LOCAL_LLM_BASE_URL: "file:///tmp/model",
                    LOCAL_LLM_MODEL: "llama3.1:8b",
                }),
            /LOCAL_LLM_BASE_URL/,
        );
    });

    it("normalizes valid enabled config", () => {
        const config = getLocalLlmConfig({
            ENABLE_LOCAL_LLM: "true",
            LOCAL_LLM_BASE_URL: "http://localhost:11434/v1/?token=ignored#hash",
            LOCAL_LLM_MODEL: "llama3.1:8b",
            LOCAL_LLM_LABEL: "Local Llama",
            LOCAL_LLM_API_KEY: "secret",
            LOCAL_LLM_SUPPORTS_TOOLS: "true",
            LOCAL_LLM_TIMEOUT_MS: "90000",
        });

        assert.equal(config.enabled, true);
        assert.equal(config.baseUrl, "http://localhost:11434/v1");
        assert.equal(
            config.chatCompletionsUrl,
            "http://localhost:11434/v1/chat/completions",
        );
        assert.equal(config.model, "llama3.1:8b");
        assert.equal(config.label, "Local Llama");
        assert.equal(config.apiKey, "secret");
        assert.equal(config.supportsTools, true);
        assert.equal(config.timeoutMs, 90000);
    });
});

describe("getLocalProviderStatus", () => {
    it("does not expose local endpoint secrets", () => {
        const status = getLocalProviderStatus({
            ENABLE_LOCAL_LLM: "true",
            LOCAL_LLM_BASE_URL: "http://localhost:11434/v1",
            LOCAL_LLM_MODEL: "llama3.1:8b",
            LOCAL_LLM_API_KEY: "secret",
        });

        assert.deepEqual(status, {
            configured: true,
            source: "env",
            modelId: LOCAL_MODEL_ID,
            label: "Local model",
            supportsTools: false,
            supportsStreaming: true,
            supportsReasoning: false,
        });
        assert.equal("apiKey" in status, false);
        assert.equal("baseUrl" in status, false);
    });
});
