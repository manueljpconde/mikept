export const LOCAL_MODEL_ID = "local:server" as const;

export type LocalProviderStatus = {
    configured: boolean;
    source: "env" | null;
    modelId: typeof LOCAL_MODEL_ID;
    label: string;
    supportsTools: boolean;
    supportsStreaming: true;
    supportsReasoning: false;
};

export type LocalLlmConfig = {
    enabled: boolean;
    baseUrl: string | null;
    chatCompletionsUrl: string | null;
    model: string | null;
    label: string;
    apiKey: string | null;
    supportsTools: boolean;
    timeoutMs: number;
};

const DEFAULT_LABEL = "Local model";
const DEFAULT_TIMEOUT_MS = 120_000;

function envFlag(value: string | undefined): boolean {
    return value?.trim().toLowerCase() === "true";
}

function optionalTrim(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined): string {
    const raw = optionalTrim(value);
    if (!raw) {
        throw new Error("LOCAL_LLM_BASE_URL is required when local LLM is enabled");
    }

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("LOCAL_LLM_BASE_URL must be a valid http(s) URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("LOCAL_LLM_BASE_URL must use http:// or https://");
    }

    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
}

export function getLocalLlmConfig(
    env: NodeJS.ProcessEnv = process.env,
): LocalLlmConfig {
    if (!envFlag(env.ENABLE_LOCAL_LLM)) {
        return {
            enabled: false,
            baseUrl: null,
            chatCompletionsUrl: null,
            model: null,
            label: DEFAULT_LABEL,
            apiKey: null,
            supportsTools: false,
            timeoutMs: DEFAULT_TIMEOUT_MS,
        };
    }

    const baseUrl = normalizeBaseUrl(env.LOCAL_LLM_BASE_URL);
    const model = optionalTrim(env.LOCAL_LLM_MODEL);
    if (!model) {
        throw new Error("LOCAL_LLM_MODEL is required when local LLM is enabled");
    }

    return {
        enabled: true,
        baseUrl,
        chatCompletionsUrl: `${baseUrl}/chat/completions`,
        model,
        label: optionalTrim(env.LOCAL_LLM_LABEL) ?? DEFAULT_LABEL,
        apiKey: optionalTrim(env.LOCAL_LLM_API_KEY),
        supportsTools: envFlag(env.LOCAL_LLM_SUPPORTS_TOOLS),
        timeoutMs: parsePositiveInt(env.LOCAL_LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    };
}

export function isLocalLlmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    try {
        return getLocalLlmConfig(env).enabled;
    } catch {
        return false;
    }
}

export function getLocalProviderStatus(
    env: NodeJS.ProcessEnv = process.env,
): LocalProviderStatus {
    let config: LocalLlmConfig;
    try {
        config = getLocalLlmConfig(env);
    } catch {
        config = {
            enabled: false,
            baseUrl: null,
            chatCompletionsUrl: null,
            model: null,
            label: DEFAULT_LABEL,
            apiKey: null,
            supportsTools: false,
            timeoutMs: DEFAULT_TIMEOUT_MS,
        };
    }

    return {
        configured: config.enabled,
        source: config.enabled ? "env" : null,
        modelId: LOCAL_MODEL_ID,
        label: config.label,
        supportsTools: config.supportsTools,
        supportsStreaming: true,
        supportsReasoning: false,
    };
}
