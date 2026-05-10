import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { streamManagedOpenAICompatible } from "./openaiCompatible";

function streamFromText(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

describe("managed OpenAI-compatible models", () => {
    it("routes Foundry managed models to their own endpoint/model/key", async () => {
        const requests: { url: string; init: RequestInit }[] = [];
        const fetchImpl: typeof fetch = async (url, init) => {
            requests.push({ url: String(url), init: init ?? {} });
            return new Response(
                streamFromText(
                    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { status: 200 },
            );
        };

        const result = await streamManagedOpenAICompatible(
            {
                model: "managed:model-1",
                systemPrompt: "System",
                messages: [{ role: "user", content: "Hello" }],
                apiKeys: {
                    managedModels: [
                        {
                            id: "model-1",
                            provider: "foundry",
                            enabled: true,
                            displayName: "Foundry GPT-5 Mini",
                            baseUrl:
                                "https://example.openai.azure.com/openai/v1",
                            modelName: "gpt-5-mini",
                            hasApiKey: true,
                            apiKey: "user-key",
                            supportsStreaming: true,
                            supportsTools: false,
                            supportsReasoning: false,
                        },
                    ],
                },
            },
            { fetchImpl },
        );

        assert.equal(result.fullText, "Hi");
        assert.equal(
            requests[0].url,
            "https://example.openai.azure.com/openai/v1/chat/completions",
        );
        const headers = requests[0].init.headers as Record<string, string>;
        assert.equal(headers["api-key"], "user-key");
        const body = JSON.parse(String(requests[0].init.body));
        assert.equal(body.model, "gpt-5-mini");
    });

    it("allows local managed models without an API key", async () => {
        const requests: { init: RequestInit }[] = [];
        const fetchImpl: typeof fetch = async (_url, init) => {
            requests.push({ init: init ?? {} });
            return new Response("data: [DONE]\n\n", { status: 200 });
        };

        await streamManagedOpenAICompatible(
            {
                model: "managed:local-1",
                systemPrompt: "System",
                messages: [{ role: "user", content: "Hello" }],
                apiKeys: {
                    managedModels: [
                        {
                            id: "local-1",
                            provider: "local_openai_compatible",
                            enabled: true,
                            displayName: "Local Legal LLM",
                            baseUrl: "http://host.docker.internal:1234/v1",
                            modelName: "legal-llm",
                            hasApiKey: false,
                            apiKey: null,
                            supportsStreaming: true,
                            supportsTools: false,
                            supportsReasoning: false,
                        },
                    ],
                },
            },
            { fetchImpl },
        );

        const headers = requests[0].init.headers as Record<string, string>;
        assert.equal("Authorization" in headers, false);
        assert.equal("api-key" in headers, false);
    });

    it("runs OpenAI-compatible tool calls before streaming the final answer", async () => {
        const requests: { body: unknown }[] = [];
        const fetchImpl: typeof fetch = async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            requests.push({ body });
            if (requests.length === 1) {
                return new Response(
                    streamFromText(
                        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_document","arguments":"{\\"document_id\\":"}}]}}]}\n\n' +
                            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"doc-1\\"}"}}]}}]}\n\n' +
                            "data: [DONE]\n\n",
                    ),
                    { status: 200 },
                );
            }
            return new Response(
                streamFromText(
                    'data: {"choices":[{"delta":{"content":"Document summary."}}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { status: 200 },
            );
        };
        const toolStarts: string[] = [];
        const deltas: string[] = [];

        const result = await streamManagedOpenAICompatible(
            {
                model: "managed:model-1",
                systemPrompt: "System",
                messages: [{ role: "user", content: "Summarize doc-1" }],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "read_document",
                            description: "Read a document",
                            parameters: {
                                type: "object",
                                properties: {
                                    document_id: { type: "string" },
                                },
                                required: ["document_id"],
                            },
                        },
                    },
                ],
                callbacks: {
                    onToolCallStart: (call) => toolStarts.push(call.name),
                    onContentDelta: (text) => deltas.push(text),
                },
                runTools: async (calls) => {
                    assert.equal(calls.length, 1);
                    assert.equal(calls[0].name, "read_document");
                    assert.deepEqual(calls[0].input, { document_id: "doc-1" });
                    return [
                        {
                            tool_use_id: calls[0].id,
                            content: "Document text",
                        },
                    ];
                },
                apiKeys: {
                    managedModels: [
                        {
                            id: "model-1",
                            provider: "foundry",
                            enabled: true,
                            displayName: "Foundry GPT-5 Mini",
                            baseUrl:
                                "https://example.openai.azure.com/openai/v1",
                            modelName: "gpt-5-mini",
                            hasApiKey: true,
                            apiKey: "user-key",
                            supportsStreaming: true,
                            supportsTools: true,
                            supportsReasoning: false,
                        },
                    ],
                },
            },
            { fetchImpl },
        );

        assert.equal(result.fullText, "Document summary.");
        assert.deepEqual(toolStarts, ["read_document"]);
        assert.deepEqual(deltas, ["Document summary."]);
        assert.equal(requests.length, 2);
        const secondBody = requests[1].body as {
            messages: { role: string; tool_call_id?: string }[];
        };
        assert.equal(secondBody.messages.at(-1)?.role, "tool");
        assert.equal(secondBody.messages.at(-1)?.tool_call_id, "call_1");
    });
});
