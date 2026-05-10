import crypto from "crypto";
import { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export type ManagedModelProvider = "foundry" | "local_openai_compatible";

export type ManagedModelSafe = {
    id: string;
    provider: ManagedModelProvider;
    enabled: boolean;
    displayName: string;
    baseUrl: string;
    modelName: string;
    hasApiKey: boolean;
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
};

export type ManagedModelRuntime = ManagedModelSafe & {
    apiKey: string | null;
};

type ManagedModelRow = {
    id: string;
    provider: ManagedModelProvider;
    enabled: boolean;
    display_name: string;
    base_url: string;
    model_name: string;
    encrypted_api_key: string | null;
    iv: string | null;
    auth_tag: string | null;
    supports_streaming: boolean;
    supports_tools: boolean;
    supports_reasoning: boolean;
};

export type ManagedModelPayload = {
    provider: ManagedModelProvider;
    enabled?: boolean;
    displayName: string;
    baseUrl: string;
    modelName: string;
    apiKey?: string | null;
    clearApiKey?: boolean;
    supportsStreaming?: boolean;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
};

function encryptionKey(): Buffer {
    const secret =
        process.env.USER_API_KEYS_ENCRYPTION_SECRET ||
        process.env.API_KEYS_ENCRYPTION_SECRET ||
        process.env.SUPABASE_SECRET_KEY;
    if (!secret) {
        throw new Error("API key encryption secret is not configured");
    }
    return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    return {
        encrypted_api_key: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        auth_tag: cipher.getAuthTag().toString("base64"),
    };
}

function decrypt(row: ManagedModelRow): string | null {
    if (!row.encrypted_api_key || !row.iv || !row.auth_tag) return null;
    try {
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            encryptionKey(),
            Buffer.from(row.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
        return Buffer.concat([
            decipher.update(Buffer.from(row.encrypted_api_key, "base64")),
            decipher.final(),
        ]).toString("utf8");
    } catch (err) {
        console.error("[managed-models] failed to decrypt key", {
            id: row.id,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

function safeRow(row: ManagedModelRow): ManagedModelSafe {
    return {
        id: row.id,
        provider: row.provider,
        enabled: !!row.enabled,
        displayName: row.display_name,
        baseUrl: row.base_url,
        modelName: row.model_name,
        hasApiKey: !!row.encrypted_api_key,
        supportsStreaming: !!row.supports_streaming,
        supportsTools: !!row.supports_tools,
        supportsReasoning: !!row.supports_reasoning,
    };
}

function runtimeRow(row: ManagedModelRow): ManagedModelRuntime {
    return { ...safeRow(row), apiKey: decrypt(row) };
}

function normalizeProvider(value: unknown): ManagedModelProvider | null {
    return value === "foundry" || value === "local_openai_compatible"
        ? value
        : null;
}

function validateUrl(value: string): string | null {
    const trimmed = value.trim();
    try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        url.pathname = url.pathname.replace(/\/+$/, "");
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return null;
    }
}

export function parseManagedModelPayload(
    body: unknown,
): { ok: true; payload: ManagedModelPayload } | { ok: false; detail: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, detail: "Expected a JSON object" };
    }
    const raw = body as Record<string, unknown>;
    const provider = normalizeProvider(raw.provider);
    if (!provider)
        return { ok: false, detail: "Unsupported managed model provider" };

    const displayName =
        typeof raw.displayName === "string" ? raw.displayName.trim() : "";
    if (!displayName) return { ok: false, detail: "Display name is required" };

    const baseUrl =
        typeof raw.baseUrl === "string" ? validateUrl(raw.baseUrl) : null;
    if (!baseUrl)
        return { ok: false, detail: "Base URL must be a valid HTTP(S) URL" };

    const modelName =
        typeof raw.modelName === "string" ? raw.modelName.trim() : "";
    if (!modelName)
        return { ok: false, detail: "Model/deployment name is required" };

    return {
        ok: true,
        payload: {
            provider,
            enabled: raw.enabled !== false,
            displayName,
            baseUrl,
            modelName,
            apiKey:
                typeof raw.apiKey === "string"
                    ? raw.apiKey.trim() || null
                    : undefined,
            clearApiKey: raw.clearApiKey === true,
            supportsStreaming: raw.supportsStreaming !== false,
            supportsTools: raw.supportsTools === true,
            supportsReasoning: raw.supportsReasoning === true,
        },
    };
}

export async function listManagedModels(
    userId: string,
    db: Db = createServerSupabase(),
): Promise<ManagedModelSafe[]> {
    const { data, error } = await db
        .from("user_managed_models")
        .select(
            "id, provider, enabled, display_name, base_url, model_name, encrypted_api_key, iv, auth_tag, supports_streaming, supports_tools, supports_reasoning",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ManagedModelRow[]).map(safeRow);
}

export async function listRuntimeManagedModels(
    userId: string,
    db: Db = createServerSupabase(),
): Promise<ManagedModelRuntime[]> {
    const { data, error } = await db
        .from("user_managed_models")
        .select(
            "id, provider, enabled, display_name, base_url, model_name, encrypted_api_key, iv, auth_tag, supports_streaming, supports_tools, supports_reasoning",
        )
        .eq("user_id", userId)
        .eq("enabled", true);
    if (error) throw error;
    return ((data ?? []) as ManagedModelRow[]).map(runtimeRow);
}

export async function createManagedModel(
    userId: string,
    payload: ManagedModelPayload,
    db: Db = createServerSupabase(),
): Promise<ManagedModelSafe> {
    const encrypted = payload.apiKey ? encrypt(payload.apiKey) : {};
    const { data, error } = await db
        .from("user_managed_models")
        .insert({
            user_id: userId,
            provider: payload.provider,
            enabled: payload.enabled !== false,
            display_name: payload.displayName,
            base_url: payload.baseUrl,
            model_name: payload.modelName,
            supports_streaming: payload.supportsStreaming !== false,
            supports_tools: payload.supportsTools === true,
            supports_reasoning: payload.supportsReasoning === true,
            ...encrypted,
        })
        .select(
            "id, provider, enabled, display_name, base_url, model_name, encrypted_api_key, iv, auth_tag, supports_streaming, supports_tools, supports_reasoning",
        )
        .single();
    if (error) throw error;
    return safeRow(data as ManagedModelRow);
}

export async function updateManagedModel(
    userId: string,
    id: string,
    payload: ManagedModelPayload,
    db: Db = createServerSupabase(),
): Promise<ManagedModelSafe> {
    const update: Record<string, unknown> = {
        provider: payload.provider,
        enabled: payload.enabled !== false,
        display_name: payload.displayName,
        base_url: payload.baseUrl,
        model_name: payload.modelName,
        supports_streaming: payload.supportsStreaming !== false,
        supports_tools: payload.supportsTools === true,
        supports_reasoning: payload.supportsReasoning === true,
        updated_at: new Date().toISOString(),
    };
    if (payload.apiKey) Object.assign(update, encrypt(payload.apiKey));
    if (payload.clearApiKey) {
        update.encrypted_api_key = null;
        update.iv = null;
        update.auth_tag = null;
    }
    const { data, error } = await db
        .from("user_managed_models")
        .update(update)
        .eq("user_id", userId)
        .eq("id", id)
        .select(
            "id, provider, enabled, display_name, base_url, model_name, encrypted_api_key, iv, auth_tag, supports_streaming, supports_tools, supports_reasoning",
        )
        .single();
    if (error) throw error;
    return safeRow(data as ManagedModelRow);
}

export async function deleteManagedModel(
    userId: string,
    id: string,
    db: Db = createServerSupabase(),
): Promise<void> {
    const { error } = await db
        .from("user_managed_models")
        .delete()
        .eq("user_id", userId)
        .eq("id", id);
    if (error) throw error;
}
