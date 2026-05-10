import type {
    LlmMessage,
    NormalizedToolCall,
    NormalizedToolResult,
    OpenAIToolSchema,
    StreamChatParams,
    StreamChatResult,
} from "./types";
import {
    OPENAI_RESPONSES_URL,
    resolveOpenAIRequestConfig,
} from "./openaiConfig";

const MAX_OUTPUT_TOKENS = 16384;

type OpenAIAdapterOptions = {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
};

type ResponseInputItem =
    | { role: "user" | "assistant"; content: string }
    | { type: "function_call_output"; call_id: string; output: string };

type ResponseFunctionTool = {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
};

type ResponseFunctionCallItem = {
    type: "function_call";
    call_id?: string;
    name?: string;
    arguments?: string;
};

type ResponseStreamEvent = {
    type?: string;
    delta?: string;
    response?: { id?: string; output_text?: string };
    item?: ResponseFunctionCallItem;
};

type ChatCompletionMessage =
    | { role: "system" | "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: ChatCompletionToolCall[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

type ChatCompletionToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};

type ChatCompletionStreamEvent = {
    choices?: {
        delta?: {
            content?: string;
            tool_calls?: {
                index?: number;
                id?: string;
                type?: "function";
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }[];
        };
    }[];
};

function toResponseTools(tools: OpenAIToolSchema[]): ResponseFunctionTool[] {
    return tools.map((tool) => ({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
}

function toResponseInput(messages: LlmMessage[]): ResponseInputItem[] {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

function toChatMessages(
    systemPrompt: string | undefined,
    messages: LlmMessage[],
): ChatCompletionMessage[] {
    const result: ChatCompletionMessage[] = [];
    if (systemPrompt?.trim()) {
        result.push({ role: "system", content: systemPrompt });
    }
    for (const message of messages) {
        result.push({ role: message.role, content: message.content });
    }
    return result;
}

function extractSseJson(buffer: string): { events: unknown[]; rest: string } {
    const events: unknown[] = [];
    const chunks = buffer.split(/\n\n/);
    const rest = chunks.pop() ?? "";

    for (const chunk of chunks) {
        const dataLines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());

        for (const data of dataLines) {
            if (!data || data === "[DONE]") continue;
            try {
                events.push(JSON.parse(data));
            } catch {
                // Incomplete events stay buffered until the next read.
            }
        }
    }

    return { events, rest };
}

function parseFunctionCall(item: ResponseFunctionCallItem): NormalizedToolCall {
    let input: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(item.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
        }
    } catch {
        input = {};
    }

    return {
        id: item.call_id ?? item.name ?? "function_call",
        name: item.name ?? "",
        input,
    };
}

async function createResponse(params: {
    model: string;
    input: ResponseInputItem[];
    instructions?: string;
    tools?: ResponseFunctionTool[];
    stream?: boolean;
    maxTokens?: number;
    previousResponseId?: string;
    reasoningSummary?: boolean;
    apiKey: string;
    fetchImpl?: typeof fetch;
}): Promise<Response> {
    const fetchImpl = params.fetchImpl ?? fetch;
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: params.model,
            instructions: params.instructions || undefined,
            input: params.input,
            tools: params.tools?.length ? params.tools : undefined,
            stream: params.stream,
            max_output_tokens: params.maxTokens ?? MAX_OUTPUT_TOKENS,
            previous_response_id: params.previousResponseId,
            reasoning: params.reasoningSummary
                ? { summary: "auto" }
                : undefined,
        }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `OpenAI request failed (${response.status}): ${text || response.statusText}`,
        );
    }

    return response;
}

export async function streamOpenAI(
    params: StreamChatParams,
    options: OpenAIAdapterOptions = {},
): Promise<StreamChatResult> {
    const requestConfig = resolveOpenAIRequestConfig({
        model: params.model,
        apiKeyOverride: params.apiKeys?.openai,
        settings: params.apiKeys?.openaiProviderSettings,
        env: options.env,
    });
    if (requestConfig.provider === "azure") {
        return streamAzureOpenAI(params, requestConfig, options);
    }

    const {
        model,
        systemPrompt,
        tools = [],
        callbacks = {},
        runTools,
        apiKeys,
        enableThinking,
    } = params;
    const maxIter = params.maxIterations ?? 10;
    const responseTools = toResponseTools(tools);
    let input = toResponseInput(params.messages);
    let previousResponseId: string | undefined;
    let fullText = "";
    const hasTools = responseTools.length > 0;

    for (let iter = 0; iter < maxIter; iter++) {
        const response = await createResponse({
            model,
            instructions: iter === 0 ? systemPrompt : undefined,
            input,
            tools: responseTools,
            stream: true,
            previousResponseId,
            reasoningSummary: !!enableThinking,
            apiKey: requestConfig.apiKey,
            fetchImpl: options.fetchImpl,
        });
        if (!response.body) throw new Error("OpenAI response had no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const toolCalls: NormalizedToolCall[] = [];
        const startedToolCallIds = new Set<string>();
        let buffer = "";
        let pendingText = "";
        let sawReasoning = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const extracted = extractSseJson(buffer);
            buffer = extracted.rest;

            for (const event of extracted.events as ResponseStreamEvent[]) {
                if (event.response?.id) {
                    previousResponseId = event.response.id;
                }

                if (
                    event.type === "response.reasoning_summary_text.delta" &&
                    typeof event.delta === "string"
                ) {
                    sawReasoning = true;
                    callbacks.onReasoningDelta?.(event.delta);
                }

                if (
                    event.type === "response.output_text.delta" &&
                    typeof event.delta === "string"
                ) {
                    if (hasTools) {
                        pendingText += event.delta;
                    } else {
                        fullText += event.delta;
                        callbacks.onContentDelta?.(event.delta);
                    }
                }

                if (
                    event.type === "response.output_item.added" &&
                    event.item?.type === "function_call"
                ) {
                    const call = parseFunctionCall(event.item);
                    startedToolCallIds.add(call.id);
                    callbacks.onToolCallStart?.(call);
                }

                if (
                    event.type === "response.output_item.done" &&
                    event.item?.type === "function_call"
                ) {
                    const call = parseFunctionCall(event.item);
                    if (!startedToolCallIds.has(call.id)) {
                        callbacks.onToolCallStart?.(call);
                    }
                    toolCalls.push(call);
                }
            }
        }

        if (sawReasoning) callbacks.onReasoningBlockEnd?.();

        if (!toolCalls.length || !runTools) {
            if (pendingText) {
                fullText += pendingText;
                callbacks.onContentDelta?.(pendingText);
            }
            break;
        }

        const results = await runTools(toolCalls);
        input = results.map((result) => ({
            type: "function_call_output",
            call_id: result.tool_use_id,
            output: result.content,
        }));
    }

    return { fullText };
}

function parseChatToolCall(call: ChatCompletionToolCall): NormalizedToolCall {
    let input: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(call.function.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
        }
    } catch {
        input = {};
    }
    return {
        id: call.id,
        name: call.function.name,
        input,
    };
}

async function postAzureChatCompletion(params: {
    url: string;
    apiKey: string;
    body: Record<string, unknown>;
    fetchImpl?: typeof fetch;
}): Promise<Response> {
    const fetchImpl = params.fetchImpl ?? fetch;
    const response = await fetchImpl(params.url, {
        method: "POST",
        headers: {
            "api-key": params.apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params.body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `Azure OpenAI request failed (${response.status}): ${text || response.statusText}`,
        );
    }

    return response;
}

async function streamAzureOpenAI(
    params: StreamChatParams,
    requestConfig: Extract<
        ReturnType<typeof resolveOpenAIRequestConfig>,
        { provider: "azure" }
    >,
    options: OpenAIAdapterOptions,
): Promise<StreamChatResult> {
    const { systemPrompt, tools = [], callbacks = {}, runTools } = params;
    const maxIter = params.maxIterations ?? 10;
    let messages = toChatMessages(systemPrompt, params.messages);
    let fullText = "";
    const hasTools = tools.length > 0;

    for (let iter = 0; iter < maxIter; iter++) {
        const response = await postAzureChatCompletion({
            url: requestConfig.url,
            apiKey: requestConfig.apiKey,
            fetchImpl: options.fetchImpl,
            body: {
                model: requestConfig.model,
                messages,
                stream: true,
                ...(hasTools ? { tools } : {}),
            },
        });
        if (!response.body)
            throw new Error("Azure OpenAI response had no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const toolCallParts = new Map<
            number,
            { id?: string; name?: string; arguments: string }
        >();
        let buffer = "";
        let pendingText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const extracted = extractSseJson(buffer);
            buffer = extracted.rest;

            for (const event of extracted.events as ChatCompletionStreamEvent[]) {
                const delta = event.choices?.[0]?.delta;
                if (!delta) continue;

                if (typeof delta.content === "string") {
                    if (hasTools) {
                        pendingText += delta.content;
                    } else {
                        fullText += delta.content;
                        callbacks.onContentDelta?.(delta.content);
                    }
                }

                for (const part of delta.tool_calls ?? []) {
                    const index = part.index ?? 0;
                    const existing = toolCallParts.get(index) ?? {
                        arguments: "",
                    };
                    if (part.id) existing.id = part.id;
                    if (part.function?.name) existing.name = part.function.name;
                    if (part.function?.arguments) {
                        existing.arguments += part.function.arguments;
                    }
                    toolCallParts.set(index, existing);
                }
            }
        }

        const chatToolCalls: ChatCompletionToolCall[] = Array.from(
            toolCallParts.entries(),
        )
            .sort(([a], [b]) => a - b)
            .map(([, part], index) => ({
                id: part.id || `tool_call_${index}`,
                type: "function" as const,
                function: {
                    name: part.name || "",
                    arguments: part.arguments || "{}",
                },
            }))
            .filter((call) => call.function.name);

        if (!chatToolCalls.length || !runTools) {
            if (pendingText) {
                fullText += pendingText;
                callbacks.onContentDelta?.(pendingText);
            }
            break;
        }

        const normalizedCalls = chatToolCalls.map(parseChatToolCall);
        normalizedCalls.forEach((call) => callbacks.onToolCallStart?.(call));
        const results = await runTools(normalizedCalls);
        messages = [
            ...messages,
            {
                role: "assistant",
                content: pendingText || null,
                tool_calls: chatToolCalls,
            },
            ...results.map((result) => ({
                role: "tool" as const,
                tool_call_id: result.tool_use_id,
                content: result.content,
            })),
        ];
    }

    return { fullText };
}

export async function completeOpenAIText(
    params: {
        model: string;
        systemPrompt?: string;
        user: string;
        maxTokens?: number;
        apiKeys?: {
            openai?: string | null;
            openaiProviderSettings?: {
                provider: "openai" | "azure";
                azureEndpoint: string;
                azureDeployment: string;
            };
        };
    },
    options: OpenAIAdapterOptions = {},
): Promise<string> {
    const requestConfig = resolveOpenAIRequestConfig({
        model: params.model,
        apiKeyOverride: params.apiKeys?.openai,
        settings: params.apiKeys?.openaiProviderSettings,
        env: options.env,
    });
    if (requestConfig.provider === "azure") {
        const response = await postAzureChatCompletion({
            url: requestConfig.url,
            apiKey: requestConfig.apiKey,
            fetchImpl: options.fetchImpl,
            body: {
                model: requestConfig.model,
                messages: toChatMessages(params.systemPrompt, [
                    { role: "user", content: params.user },
                ]),
                stream: false,
                max_completion_tokens: params.maxTokens ?? 512,
            },
        });
        const json = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        return json.choices?.[0]?.message?.content ?? "";
    }

    const response = await createResponse({
        model: params.model,
        instructions: params.systemPrompt,
        input: [{ role: "user", content: params.user }],
        maxTokens: params.maxTokens ?? 512,
        apiKey: requestConfig.apiKey,
        fetchImpl: options.fetchImpl,
    });
    const json = (await response.json()) as {
        output_text?: string;
        output?: {
            content?: { type?: string; text?: string }[];
        }[];
    };

    if (typeof json.output_text === "string") return json.output_text;

    return (
        json.output
            ?.flatMap((item) => item.content ?? [])
            .filter((content) => content.type === "output_text")
            .map((content) => content.text ?? "")
            .join("") ?? ""
    );
}

export type { NormalizedToolResult };
