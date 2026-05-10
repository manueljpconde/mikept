import { createServerSupabase } from "./supabase";
import {
    resolveModel,
    DEFAULT_TITLE_MODEL,
    DEFAULT_TABULAR_MODEL,
    OPENAI_LOW_MODELS,
    type UserApiKeys,
} from "./llm";
import { LOCAL_MODEL_ID, getLocalLlmConfig } from "./llm/localConfig";
import { getUserApiKeys as getStoredUserApiKeys } from "./userApiKeys";

export type UserModelSettings = {
    title_model: string;
    tabular_model: string;
    api_keys: UserApiKeys;
};

// Title generation is a lightweight task — always routed to the cheapest model
// of whichever provider the user has keys for: Gemini Flash Lite if Gemini is
// available, otherwise OpenAI nano, otherwise Claude Haiku. With no user keys
// set, defaults to Gemini (the dev-mode env fallback).
function resolveTitleModel(apiKeys: UserApiKeys): string {
    if (apiKeys.gemini?.trim()) return DEFAULT_TITLE_MODEL;
    if (
        apiKeys.openai?.trim() &&
        (apiKeys.openaiProviderSettings?.provider === "azure" ||
            apiKeys.openai.trim().startsWith("sk-"))
    ) {
        return OPENAI_LOW_MODELS[0];
    }
    if (apiKeys.claude?.trim()) return "claude-haiku-4-5";
    return DEFAULT_TITLE_MODEL;
}

export async function getUserModelSettings(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserModelSettings> {
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("tabular_model")
        .eq("user_id", userId)
        .single();
    const api_keys = await getStoredUserApiKeys(userId, client);
    const localConfig = (() => {
        if (data?.tabular_model !== LOCAL_MODEL_ID) return null;
        try {
            return getLocalLlmConfig();
        } catch {
            return null;
        }
    })();
    const tabular_model =
        data?.tabular_model === LOCAL_MODEL_ID && !localConfig?.supportsTools
            ? DEFAULT_TABULAR_MODEL
            : resolveModel(data?.tabular_model, DEFAULT_TABULAR_MODEL, {
                  localEnabled: !!localConfig?.enabled,
              });

    return {
        title_model: resolveTitleModel(api_keys),
        tabular_model,
        api_keys,
    };
}

export async function getUserApiKeys(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserApiKeys> {
    const client = db ?? createServerSupabase();
    return getStoredUserApiKeys(userId, client);
}
