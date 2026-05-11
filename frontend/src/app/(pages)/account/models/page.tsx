"use client";

import { useState } from "react";
import {
    AlertCircle,
    Check,
    ChevronDown,
    Eye,
    EyeOff,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserProfile } from "@/contexts/UserProfileContext";
import type {
    ApiKeyState,
    ManagedModel,
    ManagedModelPayload,
    ManagedModelProvider,
} from "@/app/lib/mikeApi";
import { modelOptions } from "@/app/components/assistant/ModelToggle";
import {
    isModelAvailable,
    modelGroupToProvider,
    providerLabel,
} from "@/app/lib/modelAvailability";
import { useT } from "@/contexts/I18nContext";

const API_KEY_FIELDS = [
    {
        provider: "claude",
        labelKey: "settings.models.public.anthropicApiKey",
        placeholder: "sk-ant-...",
    },
    {
        provider: "gemini",
        labelKey: "settings.models.public.geminiApiKey",
        placeholder: "AI...",
    },
    {
        provider: "openai",
        labelKey: "settings.models.public.openaiApiKey",
        placeholder: "sk-...",
    },
] as const;

export default function ModelsAndApiKeysPage() {
    const {
        profile,
        updateModelPreference,
        updateApiKey,
        createManagedModel,
        updateManagedModel,
        deleteManagedModel,
    } = useUserProfile();
    const [providerTab, setProviderTab] = useState<"public" | "managed">(
        "public",
    );
    const { t } = useT();

    return (
        <div className="space-y-8">
            <section>
                <h2 className="text-2xl font-medium font-serif mb-4">
                    {t("settings.models.preferencesTitle")}
                </h2>
                <div className="space-y-4 max-w-md">
                    <div>
                        <label className="text-sm text-gray-600 block mb-2">
                            {t("settings.models.tabularReviewModel")}
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                            {t("settings.models.tabularReviewModelHelp")}
                        </p>
                        <TabularModelDropdown
                            value={
                                profile?.tabularModel ??
                                "gemini-3-flash-preview"
                            }
                            apiKeys={profile?.apiKeys}
                            onChange={(id) =>
                                updateModelPreference("tabularModel", id)
                            }
                        />
                    </div>
                </div>
            </section>

            <section className="py-2">
                <h2 className="text-2xl font-medium font-serif mb-2">
                    {t("settings.models.providersTitle")}
                </h2>
                <p className="text-sm text-gray-500 mb-4 max-w-xl">
                    {t("settings.models.providersHelp")}
                </p>
                <div className="mb-4 grid max-w-xl grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setProviderTab("public")}
                        className={`rounded-md border px-3 py-2 text-sm text-left ${providerTab === "public" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                    >
                        {t("settings.models.publicModels")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setProviderTab("managed")}
                        className={`rounded-md border px-3 py-2 text-sm text-left ${providerTab === "managed" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                    >
                        {t("settings.models.managedModels")}
                    </button>
                </div>

                {providerTab === "public" ? (
                    <div className="space-y-4 max-w-xl">
                        {API_KEY_FIELDS.map((field) => (
                            <ApiKeyField
                                key={`${field.provider}:${profile?.apiKeys[field.provider].configured}:${profile?.apiKeys[field.provider].source}`}
                                label={t(field.labelKey)}
                                placeholder={field.placeholder}
                                hasSavedKey={
                                    !!profile?.apiKeys[field.provider]
                                        .configured
                                }
                                onSave={(value) =>
                                    updateApiKey(
                                        field.provider,
                                        value.trim() || null,
                                    )
                                }
                                onRemove={() =>
                                    updateApiKey(field.provider, null)
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <ManagedModelsPanel
                        models={profile?.managedModels ?? []}
                        onCreate={createManagedModel}
                        onUpdate={updateManagedModel}
                        onDelete={deleteManagedModel}
                    />
                )}
            </section>
        </div>
    );
}

function ManagedModelsPanel({
    models,
    onCreate,
    onUpdate,
    onDelete,
}: {
    models: ManagedModel[];
    onCreate: (payload: ManagedModelPayload) => Promise<boolean>;
    onUpdate: (id: string, payload: ManagedModelPayload) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
}) {
    const [editing, setEditing] = useState<ManagedModel | null>(null);
    const { t } = useT();

    return (
        <div className="max-w-xl space-y-4">
            <div className="space-y-2">
                {models.length === 0 ? (
                    <p className="rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-600">
                        {t("settings.models.noManagedModels")}
                    </p>
                ) : (
                    models.map((model) => (
                        <div
                            key={model.id}
                            className="rounded-md border border-gray-200 bg-white px-3 py-3"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">
                                        {model.displayName}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {model.provider === "foundry"
                                            ? t("settings.models.providerFoundry")
                                            : t("settings.models.providerLocal")}{" "}
                                        · {model.modelName}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-gray-400">
                                        {model.baseUrl}
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setEditing(model)}
                                    >
                                        {t("common.edit")}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => onDelete(model.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <ManagedModelForm
                key={editing?.id ?? "new"}
                model={editing}
                onCancel={() => setEditing(null)}
                onSave={async (payload) => {
                    const ok = editing
                        ? await onUpdate(editing.id, payload)
                        : await onCreate(payload);
                    if (ok) setEditing(null);
                    return ok;
                }}
            />
        </div>
    );
}

function ManagedModelForm({
    model,
    onSave,
    onCancel,
}: {
    model: ManagedModel | null;
    onSave: (payload: ManagedModelPayload) => Promise<boolean>;
    onCancel: () => void;
}) {
    const { t } = useT();
    const [provider, setProvider] = useState<ManagedModelProvider>(
        model?.provider ?? "foundry",
    );
    const [enabled, setEnabled] = useState(model?.enabled ?? true);
    const [displayName, setDisplayName] = useState(model?.displayName ?? "");
    const [baseUrl, setBaseUrl] = useState(
        model?.baseUrl ??
            (provider === "foundry"
                ? "https://<resource>.openai.azure.com/openai/v1"
                : "http://host.docker.internal:1234/v1"),
    );
    const [modelName, setModelName] = useState(model?.modelName ?? "");
    const [apiKey, setApiKey] = useState("");
    const [supportsTools, setSupportsTools] = useState(
        model?.supportsTools ?? false,
    );
    const [supportsReasoning, setSupportsReasoning] = useState(
        model?.supportsReasoning ?? false,
    );
    const [isSaving, setIsSaving] = useState(false);

    const handleProvider = (next: ManagedModelProvider) => {
        setProvider(next);
        if (!model) {
            setBaseUrl(
                next === "foundry"
                    ? "https://<resource>.openai.azure.com/openai/v1"
                    : "http://host.docker.internal:1234/v1",
            );
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const ok = await onSave({
            provider,
            enabled,
            displayName: displayName.trim(),
            baseUrl: baseUrl.trim(),
            modelName: modelName.trim(),
            apiKey: apiKey.trim() || undefined,
            supportsStreaming: true,
            supportsTools,
            supportsReasoning,
        });
        setIsSaving(false);
        if (!ok) alert(t("settings.models.saveManagedModelFailed"));
    };

    return (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
            <p className="text-sm font-medium text-gray-900">
                {model
                    ? t("settings.models.editManagedModel")
                    : t("settings.models.addManagedModel")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => handleProvider("foundry")}
                    className={`rounded-md border px-3 py-2 text-sm text-left ${provider === "foundry" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700"}`}
                >
                    {t("settings.models.providerFoundry")}
                </button>
                <button
                    type="button"
                    onClick={() => handleProvider("local_openai_compatible")}
                    className={`rounded-md border px-3 py-2 text-sm text-left ${provider === "local_openai_compatible" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700"}`}
                >
                    {t("settings.models.providerLocalShort")}
                </button>
            </div>
            <div className="mt-3 space-y-3">
                <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("settings.models.displayNamePlaceholder")}
                />
                <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={t("settings.models.baseUrlPlaceholder")}
                />
                <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={
                        provider === "foundry"
                            ? "gpt-5-mini"
                            : "legal-llm-sft-v4-qwen25-7b"
                    }
                />
                <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                        model?.hasApiKey
                            ? t("settings.models.savedKeyHidden")
                            : provider === "foundry"
                              ? t("settings.models.apiKeyPlaceholder")
                              : t("settings.models.optionalApiKeyPlaceholder")
                    }
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                    />
                    {t("settings.models.enabled")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={supportsTools}
                        onChange={(e) => setSupportsTools(e.target.checked)}
                    />
                    {t("settings.models.supportsTools")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={supportsReasoning}
                        onChange={(e) => setSupportsReasoning(e.target.checked)}
                    />
                    {t("settings.models.supportsReasoning")}
                </label>
                <div className="flex justify-end gap-2">
                    {model && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                        >
                            {t("common.cancel")}
                        </Button>
                    )}
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={
                            isSaving ||
                            !displayName.trim() ||
                            !baseUrl.trim() ||
                            !modelName.trim()
                        }
                        className="bg-black text-white hover:bg-gray-900"
                    >
                        {isSaving ? t("account.saving") : t("common.save")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function TabularModelDropdown({
    value,
    onChange,
    apiKeys,
}: {
    value: string;
    onChange: (id: string) => void;
    apiKeys?: ApiKeyState;
}) {
    const { t } = useT();
    const [isOpen, setIsOpen] = useState(false);
    const options = modelOptions(apiKeys);
    const selected = options.find((m) => m.id === value);
    const selectedLabel = selected?.label ?? t("settings.models.selectModel");
    const selectedAvailable = apiKeys ? isModelAvailable(value, apiKeys) : true;
    const groups: ("Anthropic" | "Google" | "OpenAI" | "Managed")[] = [
        "Anthropic",
        "Google",
        "OpenAI",
        "Managed",
    ];
    const groupLabel = (
        group: "Anthropic" | "Google" | "OpenAI" | "Managed",
    ) => {
        if (group === "Managed") return t("settings.models.groupManaged");
        return group;
    };

    return (
        <DropdownMenu onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm flex items-center justify-between gap-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        {!selectedAvailable && (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        )}
                        <span className="truncate text-gray-900">
                            {selectedLabel}
                        </span>
                    </span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="z-50"
                style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                align="start"
            >
                {groups.map((group, gi) => {
                    const items = options.filter((m) => m.group === group);
                    if (items.length === 0) return null;
                    return (
                        <div key={group}>
                            {gi > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-gray-400">
                                {groupLabel(group)}
                            </DropdownMenuLabel>
                            {items.map((m) => {
                                const provider = modelGroupToProvider(m.group);
                                const available = apiKeys
                                    ? isModelAvailable(m.id, apiKeys)
                                    : true;
                                return (
                                    <DropdownMenuItem
                                        key={m.id}
                                        className="cursor-pointer"
                                        onSelect={() => onChange(m.id)}
                                        title={
                                            !available
                                                ? t(
                                                      "settings.models.addProviderKeyToUseModel",
                                                      {
                                                          provider:
                                                              providerLabel(
                                                                  provider,
                                                              ),
                                                      },
                                                  )
                                                : undefined
                                        }
                                    >
                                        <span
                                            className={`flex-1 ${available ? "" : "text-gray-400"}`}
                                        >
                                            {m.label}
                                        </span>
                                        {!available && (
                                            <AlertCircle className="h-3.5 w-3.5 text-red-500 ml-1" />
                                        )}
                                        {m.id === value && available && (
                                            <Check className="h-3.5 w-3.5 text-gray-600 ml-1" />
                                        )}
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ApiKeyField({
    label,
    placeholder,
    hasSavedKey,
    onSave,
    onRemove,
}: {
    label: string;
    placeholder: string;
    hasSavedKey: boolean;
    onSave: (value: string) => Promise<boolean>;
    onRemove: () => Promise<boolean>;
}) {
    const { t } = useT();
    const [value, setValue] = useState("");
    const [reveal, setReveal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        const ok = await onSave(value);
        setIsSaving(false);
        if (ok) {
            setValue("");
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } else {
            alert(t("settings.models.saveApiKeyFailed", { label }));
        }
    };

    const handleRemove = async () => {
        setIsSaving(true);
        const ok = await onRemove();
        setIsSaving(false);
        if (!ok) alert(t("settings.models.removeApiKeyFailed", { label }));
    };

    return (
        <div>
            <label className="text-sm text-gray-600 block mb-2">{label}</label>
            {hasSavedKey && (
                <p className="text-xs text-gray-500 mb-2">
                    {t("settings.models.savedKeyReplaceHelp")}
                </p>
            )}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Input
                        type={reveal ? "text" : "password"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={
                            hasSavedKey
                                ? t("settings.models.savedKeyHidden")
                                : placeholder
                        }
                        className="pr-10"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        onClick={() => setReveal((r) => !r)}
                        className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                        aria-label={
                            reveal
                                ? t("settings.models.hideKey")
                                : t("settings.models.showKey")
                        }
                    >
                        {reveal ? (
                            <EyeOff className="h-4 w-4" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </button>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !value.trim() || saved}
                    className="min-w-[80px] transition-all bg-black hover:bg-gray-900 text-white"
                >
                    {isSaving ? (
                        t("account.saving")
                    ) : saved ? (
                        <>
                            <Check className="h-4 w-3" />
                            {t("account.saved")}
                        </>
                    ) : (
                        t("common.save")
                    )}
                </Button>
                {hasSavedKey && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleRemove}
                        disabled={isSaving}
                    >
                        {t("common.remove")}
                    </Button>
                )}
            </div>
        </div>
    );
}
