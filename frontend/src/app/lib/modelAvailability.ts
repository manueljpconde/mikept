import { MODELS, type ModelOption } from "../components/assistant/ModelToggle";
import type { ApiKeyState } from "@/app/lib/mikeApi";

export type ModelProvider = "claude" | "gemini" | "openai" | "managed";

export function getModelProvider(modelId: string): ModelProvider | null {
    if (modelId.startsWith("managed:")) return "managed";
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) return null;
    return modelGroupToProvider(model.group);
}

export function isModelAvailable(
    modelId: string,
    apiKeys: ApiKeyState,
): boolean {
    const provider = getModelProvider(modelId);
    if (!provider) return false;
    if (provider === "managed") {
        const id = modelId.slice("managed:".length);
        return !!apiKeys.managedModels?.some(
            (model) => model.id === id && model.enabled,
        );
    }
    return isProviderAvailable(provider, apiKeys);
}

export function isProviderAvailable(
    provider: ModelProvider,
    apiKeys: ApiKeyState,
): boolean {
    if (provider === "managed") return !!apiKeys.managedModels?.length;
    return !!apiKeys[provider]?.configured;
}

export function providerLabel(provider: ModelProvider): string {
    if (provider === "claude") return "Anthropic (Claude)";
    if (provider === "openai") return "OpenAI";
    if (provider === "managed") return "Managed model";
    return "Google (Gemini)";
}

export function modelGroupToProvider(
    group: ModelOption["group"],
): ModelProvider {
    if (group === "Anthropic") return "claude";
    if (group === "OpenAI") return "openai";
    if (group === "Managed") return "managed";
    return "gemini";
}
