import type {
    LlmMessage,
    OpenAIToolSchema,
    StreamChatParams,
    StreamChatResult,
} from "./types";
import { getLocalLlmConfig } from "./localConfig";

type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

type ChatCompletionStreamEvent = {
    choices?: {
        delta?: {
            role?: string;
            content?: string;
            tool_calls?: unknown;
        };
        finish_reason?: string | null;
    }[];
};

type LocalAdapterOptions = {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
};

export function extractChatCompletionSseJson(buffer: string): {
    events: unknown[];
    rest: string;
    done: boolean;
} {
    const events: unknown[] = [];
    const chunks = buffer.split(/\n\n/);
    const rest = chunks.pop() ?? "";
    let done = false;

    for (const chunk of chunks) {
        const dataLines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());

        for (const data of dataLines) {
            if (!data) continue;
            if (data === "[DONE]") {
                done = true;
                continue;
            }
            try {
                events.push(JSON.parse(data));
            } catch {
                // Malformed complete events are ignored. Incomplete events stay
                // in `rest` because the frame has not been split by \n\n yet.
            }
        }
    }

    return { events, rest, done };
}

function toMessages(
    systemPrompt: string | undefined,
    messages: LlmMessage[],
): ChatCompletionMessage[] {
    const result: ChatCompletionMessage[] = [];
    if (systemPrompt?.trim()) {
        result.push({ role: "system", content: systemPrompt });
    }
    for (const message of messages) {
        result.push({
            role: message.role,
            content: message.content,
        });
    }
    return result;
}

function headers(apiKey: string | null): Record<string, string> {
    return {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
}

async function postLocalChatCompletion(params: {
    body: Record<string, unknown>;
    signal: AbortSignal;
    options?: LocalAdapterOptions;
}): Promise<Response> {
    const config = getLocalLlmConfig(params.options?.env);
    if (!config.enabled || !config.chatCompletionsUrl || !config.model) {
        throw new Error("Local LLM is not configured");
    }

    const fetchImpl = params.options?.fetchImpl ?? fetch;
    const response = await fetchImpl(config.chatCompletionsUrl, {
        method: "POST",
        headers: headers(config.apiKey),
        body: JSON.stringify({
            model: config.model,
            ...params.body,
        }),
        signal: params.signal,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `Local LLM request failed (${response.status}): ${text || response.statusText}`,
        );
    }

    return response;
}

export async function streamLocal(
    params: StreamChatParams,
    options: LocalAdapterOptions = {},
): Promise<StreamChatResult> {
    const config = getLocalLlmConfig(options.env);
    if (!config.enabled) throw new Error("Local LLM is not configured");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let fullText = "";

    try {
        const includeTools = config.supportsTools && !!params.tools?.length;
        const response = await postLocalChatCompletion({
            options,
            signal: controller.signal,
            body: {
                messages: toMessages(params.systemPrompt, params.messages),
                stream: true,
                ...(includeTools
                    ? { tools: params.tools as OpenAIToolSchema[] }
                    : {}),
            },
        });
        if (!response.body) throw new Error("Local LLM response had no body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let doneSeen = false;

        while (!doneSeen) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const extracted = extractChatCompletionSseJson(buffer);
            buffer = extracted.rest;
            doneSeen = extracted.done;

            for (const event of extracted.events as ChatCompletionStreamEvent[]) {
                const delta = event.choices?.[0]?.delta?.content;
                if (!delta) continue;
                fullText += delta;
                params.callbacks?.onContentDelta?.(delta);
            }
        }

        return { fullText };
    } finally {
        clearTimeout(timeout);
    }
}

export async function completeLocalText(
    params: {
        systemPrompt?: string;
        user: string;
        maxTokens?: number;
    },
    options: LocalAdapterOptions = {},
): Promise<string> {
    const config = getLocalLlmConfig(options.env);
    if (!config.enabled) throw new Error("Local LLM is not configured");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
        const response = await postLocalChatCompletion({
            options,
            signal: controller.signal,
            body: {
                messages: toMessages(params.systemPrompt, [
                    { role: "user", content: params.user },
                ]),
                stream: false,
                max_tokens: params.maxTokens,
            },
        });
        const json = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        return json.choices?.[0]?.message?.content ?? "";
    } finally {
        clearTimeout(timeout);
    }
}
