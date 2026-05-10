import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { DEFAULT_TABULAR_MODEL, resolveModel } from "../lib/llm";
import { LOCAL_MODEL_ID, getLocalLlmConfig } from "../lib/llm/localConfig";
import {
    type ApiKeyStatus,
    getUserApiKeyStatus,
    normalizeApiKeyProvider,
    saveUserApiKey,
} from "../lib/userApiKeys";
import {
    getOpenAIProviderSettings,
    normalizeOpenAIProviderSettings,
    saveOpenAIProviderSettings,
    validateOpenAIProviderSettingsPayload,
    type OpenAIProviderSettings,
} from "../lib/openaiProviderSettings";
import {
    createManagedModel,
    deleteManagedModel,
    listManagedModels,
    parseManagedModelPayload,
    updateManagedModel,
} from "../lib/managedModels";

export const userRouter = Router();

const MONTHLY_CREDIT_LIMIT = 999999;

function isUniqueViolation(err: unknown): boolean {
    return (
        !!err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: unknown }).code === "23505"
    );
}

type UserProfileRow = {
    display_name: string | null;
    organisation: string | null;
    message_credits_used: number;
    credits_reset_date: string;
    tier: string;
    tabular_model: string;
    openai_provider_settings?: unknown;
};

function serializeProfile(row: UserProfileRow, apiKeyStatus?: ApiKeyStatus) {
    const creditsUsed = row.message_credits_used ?? 0;
    const localConfig = (() => {
        if (row.tabular_model !== LOCAL_MODEL_ID) return null;
        try {
            return getLocalLlmConfig();
        } catch {
            return null;
        }
    })();
    const tabularModel =
        row.tabular_model === LOCAL_MODEL_ID && !localConfig?.supportsTools
            ? DEFAULT_TABULAR_MODEL
            : resolveModel(row.tabular_model, DEFAULT_TABULAR_MODEL, {
                  localEnabled: !!localConfig?.enabled,
              });
    return {
        displayName: row.display_name,
        organisation: row.organisation,
        messageCreditsUsed: creditsUsed,
        creditsResetDate: row.credits_reset_date,
        creditsRemaining: Math.max(MONTHLY_CREDIT_LIMIT - creditsUsed, 0),
        tier: row.tier || "Free",
        tabularModel,
        openAIProviderSettings:
            row.openai_provider_settings === undefined
                ? undefined
                : getSerializableOpenAIProviderSettings(
                      row.openai_provider_settings,
                  ),
        ...(apiKeyStatus ? { apiKeyStatus } : {}),
    };
}

async function serializeProfileWithSettings(
    row: UserProfileRow,
    userId: string,
    db: ReturnType<typeof createServerSupabase>,
    apiKeyStatus?: ApiKeyStatus,
) {
    return {
        ...serializeProfile(row, apiKeyStatus),
        managedModels: await listManagedModels(userId, db),
    };
}

function getSerializableOpenAIProviderSettings(
    value: unknown,
): OpenAIProviderSettings {
    return normalizeOpenAIProviderSettings(value);
}

function validateProfilePayload(body: unknown):
    | {
          ok: true;
          update: {
              display_name?: string | null;
              organisation?: string | null;
              tabular_model?: string;
              updated_at: string;
          };
      }
    | { ok: false; detail: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, detail: "Expected a JSON object" };
    }

    const raw = body as Record<string, unknown>;
    const allowedFields = new Set([
        "displayName",
        "organisation",
        "tabularModel",
    ]);
    const invalidField = Object.keys(raw).find(
        (key) => !allowedFields.has(key),
    );
    if (invalidField) {
        return {
            ok: false,
            detail: `Unsupported profile field: ${invalidField}`,
        };
    }

    const update: {
        display_name?: string | null;
        organisation?: string | null;
        tabular_model?: string;
        updated_at: string;
    } = { updated_at: new Date().toISOString() };

    if ("displayName" in raw) {
        if (raw.displayName !== null && typeof raw.displayName !== "string") {
            return {
                ok: false,
                detail: "displayName must be a string or null",
            };
        }
        update.display_name = raw.displayName?.trim() || null;
    }

    if ("organisation" in raw) {
        if (raw.organisation !== null && typeof raw.organisation !== "string") {
            return {
                ok: false,
                detail: "organisation must be a string or null",
            };
        }
        update.organisation = raw.organisation?.trim() || null;
    }

    if ("tabularModel" in raw) {
        if (typeof raw.tabularModel !== "string") {
            return { ok: false, detail: "tabularModel must be a string" };
        }
        const isLocalTabularModel = raw.tabularModel === LOCAL_MODEL_ID;
        let localEnabled = false;
        if (isLocalTabularModel) {
            const localConfig = getLocalLlmConfig();
            localEnabled = localConfig.enabled;
            if (!localConfig.supportsTools) {
                return {
                    ok: false,
                    detail: "Local model is not supported for tabular reviews",
                };
            }
        }
        const resolved = resolveModel(raw.tabularModel, "", {
            localEnabled,
        });
        if (!resolved) {
            return { ok: false, detail: "Unsupported tabularModel" };
        }
        update.tabular_model = resolved;
    }

    return { ok: true, update };
}

async function ensureProfileRow(
    db: ReturnType<typeof createServerSupabase>,
    userId: string,
) {
    const { error } = await db
        .from("user_profiles")
        .upsert(
            { user_id: userId },
            { onConflict: "user_id", ignoreDuplicates: true },
        );
    return error;
}

async function loadProfile(
    db: ReturnType<typeof createServerSupabase>,
    userId: string,
    options: { repairMissing?: boolean } = {},
) {
    let { data, error } = await db
        .from("user_profiles")
        .select(
            "display_name, organisation, message_credits_used, credits_reset_date, tier, tabular_model, openai_provider_settings",
        )
        .eq("user_id", userId)
        .maybeSingle();

    if (error) return { data: null, error };
    if (!data) {
        if (!options.repairMissing) {
            return { data: null, error: new Error("Profile not found") };
        }

        const ensureError = await ensureProfileRow(db, userId);
        if (ensureError) return { data: null, error: ensureError };

        const created = await db
            .from("user_profiles")
            .select(
                "display_name, organisation, message_credits_used, credits_reset_date, tier, tabular_model, openai_provider_settings",
            )
            .eq("user_id", userId)
            .single();
        if (created.error) return { data: null, error: created.error };
        data = created.data;
    }

    let row = data as UserProfileRow;
    if (
        row.credits_reset_date &&
        new Date() > new Date(row.credits_reset_date)
    ) {
        const creditsResetDate = new Date();
        creditsResetDate.setDate(creditsResetDate.getDate() + 30);
        const { data: resetData, error: resetError } = await db
            .from("user_profiles")
            .update({
                message_credits_used: 0,
                credits_reset_date: creditsResetDate.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .select(
                "display_name, organisation, message_credits_used, credits_reset_date, tier, tabular_model, openai_provider_settings",
            )
            .single();

        if (resetError) return { data: null, error: resetError };
        row = resetData as UserProfileRow;
    }

    return { data: row, error: null };
}

// POST /user/profile
userRouter.post("/profile", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const error = await ensureProfileRow(db, userId);
    if (error) return void res.status(500).json({ detail: error.message });
    res.json({ ok: true });
});

// GET /user/profile
userRouter.get("/profile", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const { data, error } = await loadProfile(db, userId, {
        repairMissing: true,
    });
    if (error) return void res.status(500).json({ detail: error.message });
    const apiKeyStatus = await getUserApiKeyStatus(userId, db);
    res.json(
        await serializeProfileWithSettings(
            data as UserProfileRow,
            userId,
            db,
            apiKeyStatus,
        ),
    );
});

// PATCH /user/profile
userRouter.patch("/profile", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = validateProfilePayload(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });

    const db = createServerSupabase();
    const ensureError = await ensureProfileRow(db, userId);
    if (ensureError)
        return void res.status(500).json({ detail: ensureError.message });

    const { error: updateError } = await db
        .from("user_profiles")
        .update(parsed.update)
        .eq("user_id", userId);
    if (updateError)
        return void res.status(500).json({ detail: updateError.message });

    const { data, error } = await loadProfile(db, userId);
    if (error) return void res.status(500).json({ detail: error.message });
    const apiKeyStatus = await getUserApiKeyStatus(userId, db);
    res.json(
        await serializeProfileWithSettings(
            data as UserProfileRow,
            userId,
            db,
            apiKeyStatus,
        ),
    );
});

// GET /user/api-keys
userRouter.get("/api-keys", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const status = await getUserApiKeyStatus(userId, db);
    res.json(status);
});

// PUT /user/api-keys/:provider
userRouter.put("/api-keys/:provider", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const provider = normalizeApiKeyProvider(req.params.provider);
    if (!provider)
        return void res.status(400).json({ detail: "Unsupported provider" });

    const apiKey =
        typeof req.body?.api_key === "string" ? req.body.api_key : null;
    const db = createServerSupabase();
    try {
        await saveUserApiKey(userId, provider, apiKey, db);
        const status = await getUserApiKeyStatus(userId, db);
        res.json(status);
    } catch (err) {
        console.error("[user/api-keys] save failed", {
            provider,
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ detail: "Failed to save API key" });
    }
});

// GET /user/openai-provider-settings
userRouter.get("/openai-provider-settings", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const settings = await getOpenAIProviderSettings(userId, db);
        res.json(settings);
    } catch (err) {
        console.error("[user/openai-provider-settings] load failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({
            detail: "Failed to load OpenAI provider settings",
        });
    }
});

// PUT /user/openai-provider-settings
userRouter.put("/openai-provider-settings", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = validateOpenAIProviderSettingsPayload(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });

    const db = createServerSupabase();
    try {
        const ensureError = await ensureProfileRow(db, userId);
        if (ensureError) {
            return void res.status(500).json({ detail: ensureError.message });
        }
        await saveOpenAIProviderSettings(userId, parsed.settings, db);
        const apiKeyStatus = await getUserApiKeyStatus(userId, db);
        res.json({ settings: parsed.settings, apiKeyStatus });
    } catch (err) {
        console.error("[user/openai-provider-settings] save failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({
            detail: "Failed to save OpenAI provider settings",
        });
    }
});

userRouter.get("/managed-models", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        res.json(await listManagedModels(userId, db));
    } catch (err) {
        console.error("[user/managed-models] load failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ detail: "Failed to load managed models" });
    }
});

userRouter.post("/managed-models", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = parseManagedModelPayload(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });
    const db = createServerSupabase();
    try {
        res.status(201).json(
            await createManagedModel(userId, parsed.payload, db),
        );
    } catch (err) {
        if (isUniqueViolation(err)) {
            return void res.status(409).json({
                detail: "A managed model with this provider, endpoint, and model already exists.",
            });
        }
        console.error("[user/managed-models] create failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ detail: "Failed to create managed model" });
    }
});

userRouter.patch("/managed-models/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = parseManagedModelPayload(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });
    const db = createServerSupabase();
    try {
        res.json(
            await updateManagedModel(userId, req.params.id, parsed.payload, db),
        );
    } catch (err) {
        if (isUniqueViolation(err)) {
            return void res.status(409).json({
                detail: "A managed model with this provider, endpoint, and model already exists.",
            });
        }
        console.error("[user/managed-models] update failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ detail: "Failed to update managed model" });
    }
});

userRouter.delete("/managed-models/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        await deleteManagedModel(userId, req.params.id, db);
        res.status(204).send();
    } catch (err) {
        console.error("[user/managed-models] delete failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ detail: "Failed to delete managed model" });
    }
});

// DELETE /user/account
userRouter.delete("/account", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) return void res.status(500).json({ detail: error.message });
    res.status(204).send();
});
