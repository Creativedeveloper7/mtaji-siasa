import fs from "node:fs";

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const url = String(input.url || "").replace(/\/$/, "");
const key = String(input.key || "");
const calls = Array.isArray(input.calls) ? input.calls : [input.call];

async function once(call) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Accept-Profile": "mtaji",
    "Content-Profile": "mtaji",
  };
  let path = call.path;
  let method = call.method || "GET";
  let body;
  if (call.kind === "rpc") {
    path = `/rest/v1/rpc/${call.fn}`;
    method = "POST";
    body = JSON.stringify(call.args ?? {});
    headers["Content-Type"] = "application/json";
  } else if (call.body !== undefined) {
    body = JSON.stringify(call.body);
    headers["Content-Type"] = "application/json";
  }
  if (call.prefer) headers.Prefer = call.prefer;
  const response = await fetch(`${url}${path}`, { method, headers, body });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && data.message
        ? data.message
        : text || `Supabase ${response.status}`;
    return { ok: false, error: message };
  }
  return { ok: true, data };
}

const results = [];
for (const call of calls) {
  const result = await once(call);
  if (!result.ok) {
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
  results.push(result.data);
}

process.stdout.write(JSON.stringify({ ok: true, data: results }));
