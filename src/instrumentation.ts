export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareSupabase } = await import("@/server/supabase/prepare");
  await prepareSupabase();
}
