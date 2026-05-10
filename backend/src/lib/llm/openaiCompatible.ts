import type {
    LlmMessage,
    NormalizedToolCall,
    OpenAIToolSchema,
    StreamChatParams,
    StreamChatResult,
} from "./types";
import { extractChatCompletionSseJson } from "./local";
import type { ManagedModelRuntime } from "../managedModels";

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

function toMessages(
    systemPrompt: string | undefined,
    messages: LlmMessage[],
): ChatCompletionMessage[] {
    const result: ChatCompletionMessage[] = [];
    if (systemPrompt?.trim())
        result.push({ role: "system", content: systemPrompt });
    for (const message of messages) {
        result.push({ role: message.role, content: message.content });
    }
    return result;
}

function chatCompletionsUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function headers(model: ManagedModelRuntime): Record<string, string> {
    const result: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (!model.apiKey) return result;
    if (model.provider === "foundry") result["api-key"] = model.apiKey;
    else result.Authorization = `Bearer ${model.apiKey}`;
    return result;
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

export function managedModelId(modelId: string): string | null {
    return modelId.startsWith("managed:")
        ? modelId.slice("managed:".length)
        : null;
}

export function findManagedModel(params: StreamChatParams): ManagedModelRuntime {
    const id = managedModelId(params.model);
    const model = params.apiKeys?.managedModels?.find((item) => item.id === id);
    if (!id || !model || !model.enabled) {
        throw new Error("Managed model is not configured");
    }
    if (model.provider === "foundry" && !model.apiKey) {
        throw new Error("Foundry API key is required for this managed model");
    }
    return model;
}

export async function streamManagedOpenAICompatible(
    params: StreamChatParams,
    options: { fetchImpl?: typeof fetch } = {},
): Promise<StreamChatResult> {
    const model = findManagedModel(params);
    const fetchImpl = options.fetchImpl ?? fetch;
    const tools = (model.supportsTools
        ? (params.tools ?? [])
        : []) as OpenAIToolSchema[];
    const hasTools = tools.length > 0;
    const maxIter = params.maxIterations ?? 10;
    let messages = toMessages(params.systemPrompt, params.messages);
    let fullText = "";

    for (let iter = 0; iter < maxIter; iter++) {
        const response = await fetchImpl(chatCompletionsUrl(model.baseUrl), {
            method: "POST",
            headers: headers(model),
            body: JSON.stringify({
                model: model.modelName,
                messages,
                stream: true,
                ...(hasTools ? { tools } : {}),
            }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(
                `Managed model request failed (${response.status}): ${text || response.statusText}`,
            );
        }
        if (!response.body)
            throw new Error("Managed model response had no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const toolCallParts = new Map<
            number,
            { id?: string; name?: string; arguments: string }
        >();
        let buffer = "";
        let doneSeen = false;
        let pendingText = "";

        while (!doneSeen) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const extracted = extractChatCompletionSseJson(buffer);
            buffer = extracted.rest;
            doneSeen = extracted.done;

            for (const event of extracted.events as ChatCompletionStreamEvent[]) {
                const delta = event.choices?.[0]?.delta;
                if (!delta) continue;

                if (typeof delta.content === "string") {
                    if (hasTools) {
                        pendingText += delta.content;
                    } else {
                        fullText += delta.content;
                        params.callbacks?.onContentDelta?.(delta.content);
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

        if (!chatToolCalls.length || !params.runTools) {
            if (pendingText) {
                fullText += pendingText;
                params.callbacks?.onContentDelta?.(pendingText);
            }
            break;
        }

        const normalizedCalls = chatToolCalls.map(parseChatToolCall);
        normalizedCalls.forEach((call) =>
            params.callbacks?.onToolCallStart?.(call),
        );
        const results = await params.runTools(normalizedCalls);
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
