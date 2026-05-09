import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractChatCompletionSseJson, streamLocal } from "./local";

function streamFromText(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

describe("extractChatCompletionSseJson", () => {
    it("parses content deltas and keeps incomplete frames buffered", () => {
        const first = extractChatCompletionSseJson(
            'data: {"choices":[{"delta":{"content":"Hel',
        );
        assert.deepEqual(first.events, []);
        assert.equal(
            first.rest,
            'data: {"choices":[{"delta":{"content":"Hel',
        );

        const second = extractChatCompletionSseJson(
            `${first.rest}lo"}}]}\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: [DONE]\n\n`,
        );

        assert.deepEqual(second.events, [
            { choices: [{ delta: { content: "Hello" } }] },
            { choices: [{ delta: { role: "assistant" } }] },
        ]);
        assert.equal(second.done, true);
        assert.equal(second.rest, "");
    });
});

describe("streamLocal", () => {
    it("streams chat completion content without sending tools when disabled", async () => {
        const requests: { url: string; init: RequestInit }[] = [];
        const fetchImpl: typeof fetch = async (url, init) => {
            requests.push({ url: String(url), init: init ?? {} });
            return new Response(
                streamFromText(
                    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                        'data: {"choices":[{"delta":{}}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { status: 200 },
            );
        };

        const deltas: string[] = [];
        const result = await streamLocal(
            {
                model: "local:server",
                systemPrompt: "System",
                messages: [{ role: "user", content: "Hello" }],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "read_document",
                            description: "Read",
                            parameters: { type: "object" },
                        },
                    },
                ],
                callbacks: {
                    onContentDelta: (delta) => deltas.push(delta),
                },
                runTools: async () => {
                    throw new Error("runTools should not be called");
                },
            },
            {
                env: {
                    ENABLE_LOCAL_LLM: "true",
                    LOCAL_LLM_BASE_URL: "http://localhost:11434/v1",
                    LOCAL_LLM_MODEL: "llama3.1:8b",
                    LOCAL_LLM_SUPPORTS_TOOLS: "false",
                },
                fetchImpl,
            },
        );

        assert.equal(result.fullText, "Hi");
        assert.deepEqual(deltas, ["Hi"]);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, "http://localhost:11434/v1/chat/completions");
        const body = JSON.parse(String(requests[0].init.body));
        assert.equal(body.model, "llama3.1:8b");
        assert.equal(body.stream, true);
        assert.equal("tools" in body, false);
    });
});
