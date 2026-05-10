import type { OpenAIProviderSettings } from "../openaiProviderSettings";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAIRequestConfig =
    | {
          provider: "openai";
          apiKey: string;
          url: typeof OPENAI_RESPONSES_URL;
          model: string;
      }
    | {
          provider: "azure";
          apiKey: string;
          url: string;
          model: string;
      };

export function normalizeFoundryEndpoint(endpoint: string): string {
    const trimmed = endpoint.trim();
    if (!trimmed) throw new Error("Foundry endpoint URL is required");

    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("Foundry endpoint must be an HTTP(S) URL");
    }
    if (url.pathname === "/" || url.pathname === "") {
        url.pathname = "/openai/v1";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

export function chatCompletionsUrl(endpoint: string): string {
    return `${normalizeFoundryEndpoint(endpoint)}/chat/completions`;
}

export function resolveOpenAIRequestConfig(params: {
    model: string;
    apiKeyOverride?: string | null;
    settings?: OpenAIProviderSettings | null;
    env?: NodeJS.ProcessEnv;
}): OpenAIRequestConfig {
    const settings = params.settings ?? {
        provider: "openai",
        azureEndpoint: "",
        azureDeployment: "",
    };

    if (settings.provider === "azure") {
        const apiKey = params.apiKeyOverride?.trim() || "";
        if (!apiKey) {
            throw new Error(
                "Foundry API key is required. Add it in Settings under OpenAI API Key.",
            );
        }
        const deployment = settings.azureDeployment.trim();
        if (!deployment) {
            throw new Error("Foundry deployment/model name is required");
        }
        return {
            provider: "azure",
            apiKey,
            model: deployment,
            url: chatCompletionsUrl(settings.azureEndpoint),
        };
    }

    const apiKey = params.apiKeyOverride?.trim() || "";
    if (!apiKey) throw new Error("OpenAI API key is not configured");

    return {
        provider: "openai",
        apiKey,
        model: params.model,
        url: OPENAI_RESPONSES_URL,
    };
}
