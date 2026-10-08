import fs from "node:fs";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq);
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[key] ??= value;
}

async function main(): Promise<void> {
  const { seedSupabase } = await import("../src/server/supabase/seed");
  const { rpc } = await import("../src/server/supabase/rpc");
  await seedSupabase();
  console.log(JSON.stringify(await rpc("counts")));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "seed failed";
  console.error(message);
  process.exit(1);
});
