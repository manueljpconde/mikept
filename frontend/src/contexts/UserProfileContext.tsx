"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
    useCallback,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
    type ApiKeyState,
    type ApiKeyProvider,
    type ManagedModel,
    type ManagedModelPayload,
    type OpenAIProviderSettings,
    type UserProfile as ApiUserProfile,
    createManagedModel,
    deleteManagedModel,
    getUserProfile,
    saveApiKey,
    saveOpenAIProviderSettings,
    updateManagedModel,
    updateUserProfile,
} from "@/app/lib/mikeApi";

interface UserProfile {
    displayName: string | null;
    organisation: string | null;
    messageCreditsUsed: number;
    creditsResetDate: string;
    creditsRemaining: number;
    tier: string;
    tabularModel: string;
    apiKeys: ApiKeyState;
    openAIProviderSettings: OpenAIProviderSettings;
    managedModels: ManagedModel[];
}

interface UserProfileContextType {
    profile: UserProfile | null;
    loading: boolean;
    updateDisplayName: (name: string) => Promise<boolean>;
    updateOrganisation: (organisation: string) => Promise<boolean>;
    updateModelPreference: (
        field: "tabularModel",
        value: string,
    ) => Promise<boolean>;
    updateApiKey: (
        provider: ApiKeyProvider,
        value: string | null,
    ) => Promise<boolean>;
    updateOpenAIProviderSettings: (
        settings: OpenAIProviderSettings,
    ) => Promise<boolean>;
    createManagedModel: (payload: ManagedModelPayload) => Promise<boolean>;
    updateManagedModel: (
        id: string,
        payload: ManagedModelPayload,
    ) => Promise<boolean>;
    deleteManagedModel: (id: string) => Promise<boolean>;
    reloadProfile: () => Promise<void>;
    incrementMessageCredits: () => Promise<boolean>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(
    undefined,
);

const API_KEY_PROVIDERS: ApiKeyProvider[] = ["claude", "gemini", "openai"];
const DEFAULT_LOCAL_PROVIDER = {
    configured: false,
    source: null,
    modelId: "local:server",
    label: "Local model",
    supportsTools: false,
    supportsStreaming: true,
    supportsReasoning: false,
} as const;
const DEFAULT_OPENAI_PROVIDER_SETTINGS: OpenAIProviderSettings = {
    provider: "openai",
    azureEndpoint: "",
    azureDeployment: "",
};

function emptyApiKeys(): ApiKeyState {
    return {
        claude: { configured: false, source: null },
        gemini: { configured: false, source: null },
        openai: { configured: false, source: null },
        local: DEFAULT_LOCAL_PROVIDER,
        managedModels: [],
    };
}

function toProfile(data: ApiUserProfile): UserProfile {
    const { apiKeyStatus, ...profile } = data;
    const apiKeys = emptyApiKeys();
    for (const provider of API_KEY_PROVIDERS) {
        apiKeys[provider] = {
            configured: !!apiKeyStatus[provider],
            source:
                apiKeyStatus.sources?.[provider] ??
                (apiKeyStatus[provider] ? "user" : null),
        };
    }
    apiKeys.local = apiKeyStatus.local ?? DEFAULT_LOCAL_PROVIDER;
    apiKeys.managedModels = data.managedModels ?? [];

    return {
        ...profile,
        apiKeys,
        openAIProviderSettings:
            data.openAIProviderSettings ?? DEFAULT_OPENAI_PROVIDER_SETTINGS,
        managedModels: data.managedModels ?? [],
    };
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        try {
            const profileData = await getUserProfile();
            setProfile(toProfile(profileData));
        } catch {
            // Calculate a default future reset date for fallback
            const futureResetDate = new Date();
            futureResetDate.setDate(futureResetDate.getDate() + 30);

            // Set fallback profile data on exception
            setProfile({
                displayName: null,
                organisation: null,
                messageCreditsUsed: 0,
                creditsResetDate: futureResetDate.toISOString(),
                creditsRemaining: 999999, // temporarily unlimited
                tier: "Free",
                tabularModel: "gemini-3-flash-preview",
                apiKeys: emptyApiKeys(),
                openAIProviderSettings: DEFAULT_OPENAI_PROVIDER_SETTINGS,
                managedModels: [],
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && user) {
            setLoading(true);
            loadProfile();
        } else {
            setProfile(null);
            setLoading(false);
        }
    }, [isAuthenticated, user, loadProfile]);

    const updateDisplayName = useCallback(
        async (displayName: string): Promise<boolean> => {
            if (!user) {
                return false;
            }

            try {
                const updated = await updateUserProfile({ displayName });
                setProfile((prev) =>
                    prev ? { ...prev, ...toProfile(updated) } : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const updateOrganisation = useCallback(
        async (organisation: string): Promise<boolean> => {
            if (!user) return false;
            try {
                const updated = await updateUserProfile({ organisation });
                setProfile((prev) =>
                    prev ? { ...prev, ...toProfile(updated) } : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const updateModelPreference = useCallback(
        async (field: "tabularModel", value: string): Promise<boolean> => {
            if (!user) return false;
            if (field !== "tabularModel") return false;
            try {
                const updated = await updateUserProfile({
                    tabularModel: value,
                });
                setProfile((prev) =>
                    prev ? { ...prev, ...toProfile(updated) } : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const updateApiKey = useCallback(
        async (
            provider: ApiKeyProvider,
            value: string | null,
        ): Promise<boolean> => {
            if (!user) return false;
            const normalized = value?.trim() ? value.trim() : null;
            try {
                await saveApiKey(provider, normalized);
                setProfile((prev) =>
                    prev
                        ? {
                              ...prev,
                              apiKeys: {
                                  ...prev.apiKeys,
                                  [provider]: {
                                      configured: !!normalized,
                                      source: normalized ? "user" : null,
                                  },
                              },
                          }
                        : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const updateOpenAIProviderSettings = useCallback(
        async (settings: OpenAIProviderSettings): Promise<boolean> => {
            if (!user) return false;
            try {
                const result = await saveOpenAIProviderSettings(settings);
                setProfile((prev) =>
                    prev
                        ? {
                              ...prev,
                              openAIProviderSettings: result.settings,
                              apiKeys: {
                                  ...prev.apiKeys,
                                  claude: {
                                      configured: !!result.apiKeyStatus.claude,
                                      source:
                                          result.apiKeyStatus.sources?.claude ??
                                          (result.apiKeyStatus.claude
                                              ? "user"
                                              : null),
                                  },
                                  gemini: {
                                      configured: !!result.apiKeyStatus.gemini,
                                      source:
                                          result.apiKeyStatus.sources?.gemini ??
                                          (result.apiKeyStatus.gemini
                                              ? "user"
                                              : null),
                                  },
                                  openai: {
                                      configured: !!result.apiKeyStatus.openai,
                                      source:
                                          result.apiKeyStatus.sources?.openai ??
                                          (result.apiKeyStatus.openai
                                              ? "user"
                                              : null),
                                  },
                              },
                          }
                        : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const reloadProfile = useCallback(async () => {
        if (user) {
            await loadProfile();
        }
    }, [user, loadProfile]);

    const addManagedModel = useCallback(
        async (payload: ManagedModelPayload): Promise<boolean> => {
            if (!user) return false;
            try {
                const created = await createManagedModel(payload);
                setProfile((prev) =>
                    prev
                        ? {
                              ...prev,
                              managedModels: [...prev.managedModels, created],
                              apiKeys: {
                                  ...prev.apiKeys,
                                  managedModels: [
                                      ...prev.apiKeys.managedModels,
                                      created,
                                  ],
                              },
                          }
                        : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const editManagedModel = useCallback(
        async (id: string, payload: ManagedModelPayload): Promise<boolean> => {
            if (!user) return false;
            try {
                const updated = await updateManagedModel(id, payload);
                setProfile((prev) =>
                    prev
                        ? {
                              ...prev,
                              managedModels: prev.managedModels.map((item) =>
                                  item.id === id ? updated : item,
                              ),
                              apiKeys: {
                                  ...prev.apiKeys,
                                  managedModels:
                                      prev.apiKeys.managedModels.map((item) =>
                                          item.id === id ? updated : item,
                                      ),
                              },
                          }
                        : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const removeManagedModel = useCallback(
        async (id: string): Promise<boolean> => {
            if (!user) return false;
            try {
                await deleteManagedModel(id);
                setProfile((prev) =>
                    prev
                        ? {
                              ...prev,
                              managedModels: prev.managedModels.filter(
                                  (item) => item.id !== id,
                              ),
                              apiKeys: {
                                  ...prev.apiKeys,
                                  managedModels:
                                      prev.apiKeys.managedModels.filter(
                                          (item) => item.id !== id,
                                      ),
                              },
                          }
                        : null,
                );
                return true;
            } catch {
                return false;
            }
        },
        [user],
    );

    const incrementMessageCredits = useCallback(async (): Promise<boolean> => {
        if (!user || !profile) {
            return false;
        }

        // Check if user has credits remaining
        if (profile.creditsRemaining <= 0) {
            return false;
        }

        return false;
    }, [user, profile]);

    return (
        <UserProfileContext.Provider
            value={{
                profile,
                loading,
                updateDisplayName,
                updateOrganisation,
                updateModelPreference,
                updateApiKey,
                updateOpenAIProviderSettings,
                createManagedModel: addManagedModel,
                updateManagedModel: editManagedModel,
                deleteManagedModel: removeManagedModel,
                reloadProfile,
                incrementMessageCredits,
            }}
        >
            {children}
        </UserProfileContext.Provider>
    );
}

export function useUserProfile() {
    const context = useContext(UserProfileContext);
    if (context === undefined) {
        throw new Error(
            "useUserProfile must be used within a UserProfileProvider",
        );
    }
    return context;
}
