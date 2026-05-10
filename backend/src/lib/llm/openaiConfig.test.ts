import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    OPENAI_RESPONSES_URL,
    chatCompletionsUrl,
    resolveOpenAIRequestConfig,
} from "./openaiConfig";

describe("OpenAI request config", () => {
    it("keeps public OpenAI as the default Responses API path", () => {
        assert.deepEqual(
            resolveOpenAIRequestConfig({
                model: "gpt-5.5",
                apiKeyOverride: "user-key",
                env: {},
            }),
            {
                provider: "openai",
                apiKey: "user-key",
                model: "gpt-5.5",
                url: OPENAI_RESPONSES_URL,
            },
        );
    });

    it("requires a user-provided key for public OpenAI", () => {
        assert.throws(
            () =>
                resolveOpenAIRequestConfig({
                    model: "gpt-5.5",
                    env: { OPENAI_API_KEY: "env-openai-key" },
                }),
            /OpenAI API key is not configured/,
        );
    });

    it("normalizes Foundry endpoints to chat completions URLs", () => {
        assert.equal(
            chatCompletionsUrl("https://example.openai.azure.com/openai/v1/"),
            "https://example.openai.azure.com/openai/v1/chat/completions",
        );
        assert.equal(
            chatCompletionsUrl("https://example.openai.azure.com"),
            "https://example.openai.azure.com/openai/v1/chat/completions",
        );
    });

    it("uses the user-provided key and saved deployment for Foundry", () => {
        assert.deepEqual(
            resolveOpenAIRequestConfig({
                model: "gpt-5.5",
                apiKeyOverride: "user-foundry-key",
                env: { OPENAI_API_KEY: "env-openai-key" },
                settings: {
                    provider: "azure",
                    azureEndpoint: "https://example.openai.azure.com/openai/v1",
                    azureDeployment: "gpt-5-mini",
                },
            }),
            {
                provider: "azure",
                apiKey: "user-foundry-key",
                model: "gpt-5-mini",
                url: "https://example.openai.azure.com/openai/v1/chat/completions",
            },
        );
    });

    it("does not fall back to env OpenAI keys in Foundry mode", () => {
        assert.throws(
            () =>
                resolveOpenAIRequestConfig({
                    model: "gpt-5.5",
                    env: { OPENAI_API_KEY: "env-openai-key" },
                    settings: {
                        provider: "azure",
                        azureEndpoint:
                            "https://example.openai.azure.com/openai/v1",
                        azureDeployment: "gpt-5-mini",
                    },
                }),
            /Foundry API key is required/,
        );
    });
});
