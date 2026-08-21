/**
 * Supabase service-role client — SERVER ONLY.
 *
 * Bypasses RLS so we can read the shared BirgenAI `users` table. Never import
 * this from client code; the service key must never reach the browser.
 * Mirrors movie-recommender/web/lib/supabase/server.ts getSupabaseServiceClient().
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    cached = null;
    return null;
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
