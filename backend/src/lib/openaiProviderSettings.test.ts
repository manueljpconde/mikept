import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    getOpenAIProviderSettings,
    normalizeOpenAIProviderSettings,
    saveOpenAIProviderSettings,
    validateOpenAIProviderSettingsPayload,
} from "./openaiProviderSettings";

describe("OpenAI provider settings", () => {
    it("defaults to public OpenAI without user-specific values", () => {
        assert.deepEqual(normalizeOpenAIProviderSettings(null), {
            provider: "openai",
            azureEndpoint: "",
            azureDeployment: "",
        });
    });

    it("normalizes user-owned Foundry endpoint and deployment values", () => {
        assert.deepEqual(
            normalizeOpenAIProviderSettings({
                provider: "azure",
                azureEndpoint: " https://example.openai.azure.com/openai/v1/ ",
                azureDeployment: " gpt-5-mini ",
            }),
            {
                provider: "azure",
                azureEndpoint: "https://example.openai.azure.com/openai/v1/",
                azureDeployment: "gpt-5-mini",
            },
        );
    });

    it("requires endpoint and deployment only when Foundry is selected", () => {
        assert.deepEqual(
            validateOpenAIProviderSettingsPayload({ provider: "openai" }),
            {
                ok: true,
                settings: {
                    provider: "openai",
                    azureEndpoint: "",
                    azureDeployment: "",
                },
            },
        );

        assert.equal(
            validateOpenAIProviderSettingsPayload({
                provider: "azure",
                azureDeployment: "gpt-5-mini",
            }).ok,
            false,
        );
        assert.equal(
            validateOpenAIProviderSettingsPayload({
                provider: "azure",
                azureEndpoint: "https://example.openai.azure.com/openai/v1",
            }).ok,
            false,
        );
    });

    it("saves and reloads non-secret provider configuration", async () => {
        let stored: unknown = null;
        const db = {
            from(table: string) {
                assert.equal(table, "user_profiles");
                return {
                    select(column: string) {
                        assert.equal(column, "openai_provider_settings");
                        return {
                            eq(field: string, value: string) {
                                assert.equal(field, "user_id");
                                assert.equal(value, "user-1");
                                return {
                                    async maybeSingle() {
                                        return {
                                            data: {
                                                openai_provider_settings:
                                                    stored,
                                            },
                                            error: null,
                                        };
                                    },
                                };
                            },
                        };
                    },
                    update(payload: Record<string, unknown>) {
                        stored = payload.openai_provider_settings;
                        assert.equal(typeof payload.updated_at, "string");
                        return {
                            eq(field: string, value: string) {
                                assert.equal(field, "user_id");
                                assert.equal(value, "user-1");
                                return { error: null };
                            },
                        };
                    },
                };
            },
        };

        await saveOpenAIProviderSettings(
            "user-1",
            {
                provider: "azure",
                azureEndpoint: "https://example.openai.azure.com/openai/v1",
                azureDeployment: "gpt-5-mini",
            },
            db as never,
        );

        assert.deepEqual(
            await getOpenAIProviderSettings("user-1", db as never),
            {
                provider: "azure",
                azureEndpoint: "https://example.openai.azure.com/openai/v1",
                azureDeployment: "gpt-5-mini",
            },
        );
    });
});
