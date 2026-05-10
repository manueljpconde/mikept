import { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export type OpenAIProviderMode = "openai" | "azure";

export type OpenAIProviderSettings = {
    provider: OpenAIProviderMode;
    azureEndpoint: string;
    azureDeployment: string;
};

export const DEFAULT_OPENAI_PROVIDER_SETTINGS: OpenAIProviderSettings = {
    provider: "openai",
    azureEndpoint: "",
    azureDeployment: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOpenAIProviderSettings(
    value: unknown,
): OpenAIProviderSettings {
    if (!isRecord(value)) return { ...DEFAULT_OPENAI_PROVIDER_SETTINGS };

    const provider = value.provider === "azure" ? "azure" : "openai";
    return {
        provider,
        azureEndpoint:
            typeof value.azureEndpoint === "string"
                ? value.azureEndpoint.trim()
                : "",
        azureDeployment:
            typeof value.azureDeployment === "string"
                ? value.azureDeployment.trim()
                : "",
    };
}

export function validateOpenAIProviderSettingsPayload(
    body: unknown,
):
    | { ok: true; settings: OpenAIProviderSettings }
    | { ok: false; detail: string } {
    if (!isRecord(body)) {
        return { ok: false, detail: "Expected a JSON object" };
    }

    const settings = normalizeOpenAIProviderSettings(body);
    if (body.provider !== "openai" && body.provider !== "azure") {
        return { ok: false, detail: "Unsupported OpenAI provider" };
    }

    if (settings.provider === "azure") {
        if (!settings.azureEndpoint) {
            return { ok: false, detail: "Foundry endpoint URL is required" };
        }
        if (!settings.azureDeployment) {
            return {
                ok: false,
                detail: "Foundry deployment/model name is required",
            };
        }
        try {
            const parsed = new URL(settings.azureEndpoint);
            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                return {
                    ok: false,
                    detail: "Foundry endpoint must be an HTTP(S) URL",
                };
            }
        } catch {
            return {
                ok: false,
                detail: "Foundry endpoint must be a valid URL",
            };
        }
    }

    return { ok: true, settings };
}

export async function getOpenAIProviderSettings(
    userId: string,
    db: Db = createServerSupabase(),
): Promise<OpenAIProviderSettings> {
    const { data, error } = await db
        .from("user_profiles")
        .select("openai_provider_settings")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return normalizeOpenAIProviderSettings(
        (data as { openai_provider_settings?: unknown } | null)
            ?.openai_provider_settings,
    );
}

export async function saveOpenAIProviderSettings(
    userId: string,
    settings: OpenAIProviderSettings,
    db: Db = createServerSupabase(),
): Promise<void> {
    const { error } = await db
        .from("user_profiles")
        .update({
            openai_provider_settings: settings,
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    if (error) throw error;
}
