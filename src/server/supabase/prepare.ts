import { seedSupabase } from "@/server/supabase/seed";
import { loadSupabaseCache } from "@/server/supabase/database";

export async function prepareSupabase(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  await seedSupabase();
  await loadSupabaseCache();
}
