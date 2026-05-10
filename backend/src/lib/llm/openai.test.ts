import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeOpenAIText, streamOpenAI } from "./openai";

function streamFromText(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

describe("OpenAI adapter", () => {
    it("keeps public OpenAI on Responses API with bearer auth", async () => {
        const requests: { url: string; init: RequestInit }[] = [];
        const fetchImpl: typeof fetch = async (url, init) => {
            requests.push({ url: String(url), init: init ?? {} });
            return new Response(JSON.stringify({ output_text: "Hello" }), {
                status: 200,
            });
        };

        const result = await completeOpenAIText(
            {
                model: "gpt-5.5",
                user: "Hi",
                apiKeys: { openai: "user-openai-key" },
            },
            { env: {}, fetchImpl },
        );

        assert.equal(result, "Hello");
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
        assert.equal(
            (requests[0].init.headers as Record<string, string>).Authorization,
            "Bearer user-openai-key",
        );
        const body = JSON.parse(String(requests[0].init.body));
        assert.equal(body.model, "gpt-5.5");
    });

    it("routes Foundry completions to chat completions with user api-key auth", async () => {
        const requests: { url: string; init: RequestInit }[] = [];
        const fetchImpl: typeof fetch = async (url, init) => {
            requests.push({ url: String(url), init: init ?? {} });
            return new Response(
                JSON.stringify({
                    choices: [{ message: { content: "Foundry hello" } }],
                }),
                { status: 200 },
            );
        };

        const result = await completeOpenAIText(
            {
                model: "gpt-5.5",
                user: "Hi",
                apiKeys: {
                    openai: "user-foundry-key",
                    openaiProviderSettings: {
                        provider: "azure",
                        azureEndpoint:
                            "https://example.openai.azure.com/openai/v1/",
                        azureDeployment: "gpt-5-mini",
                    },
                },
            },
            {
                env: { OPENAI_API_KEY: "env-openai-key" },
                fetchImpl,
            },
        );

        assert.equal(result, "Foundry hello");
        assert.equal(requests.length, 1);
        assert.equal(
            requests[0].url,
            "https://example.openai.azure.com/openai/v1/chat/completions",
        );
        const headers = requests[0].init.headers as Record<string, string>;
        assert.equal(headers["api-key"], "user-foundry-key");
        assert.equal("Authorization" in headers, false);
        const body = JSON.parse(String(requests[0].init.body));
        assert.equal(body.model, "gpt-5-mini");
        assert.equal(body.stream, false);
    });

    it("streams Foundry chat completion deltas through the existing callback", async () => {
        const fetchImpl: typeof fetch = async () =>
            new Response(
                streamFromText(
                    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
                        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { status: 200 },
            );
        const deltas: string[] = [];

        const result = await streamOpenAI(
            {
                model: "gpt-5.5",
                systemPrompt: "System",
                messages: [{ role: "user", content: "Hi" }],
                apiKeys: {
                    openai: "user-foundry-key",
                    openaiProviderSettings: {
                        provider: "azure",
                        azureEndpoint:
                            "https://example.openai.azure.com/openai/v1",
                        azureDeployment: "gpt-5-mini",
                    },
                },
                callbacks: {
                    onContentDelta: (delta) => deltas.push(delta),
                },
            },
            { env: {}, fetchImpl },
        );

        assert.equal(result.fullText, "Hello");
        assert.deepEqual(deltas, ["Hel", "lo"]);
    });
});
