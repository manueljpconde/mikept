import { createServerSupabase } from "./supabase";
import {
    DEFAULT_LOCALE,
    isValidLocale,
    type SupportedLocale,
} from "./i18n/locales";

export async function getUserLocale(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<SupportedLocale> {
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("locale")
        .eq("user_id", userId)
        .maybeSingle();
    return isValidLocale(data?.locale) ? data.locale : DEFAULT_LOCALE;
}
