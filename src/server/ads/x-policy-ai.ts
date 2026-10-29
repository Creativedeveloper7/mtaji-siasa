import "server-only";
import type { AdCopy, CopyContext } from "@/server/ads/x-policy";

/**
 * Optional AI layer for Adly's X policy check: rewrites copy more naturally
 * than the rules can, and looks at what is in the photo (the rules only see
 * its size). Off unless OPENAI_API_KEY is set on this server (the Tracker's
 * Adly agent uses the same key). Every answer is re-checked by the rules, and
 * any failure falls back to the rules alone.
 */

const TIMEOUT_MS = 25_000;

export function aiReviewConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const POLICY_BRIEF = `You review ads for X (Twitter) before they are submitted, for M-Taji, a Kenyan civic platform where leaders and changemakers promote community projects. X's reviewers reject ads for:
- Political content: naming politicians, honorifics or offices (Hon., Governor, MP, MCA, Senator), parties, elections, voting or "support" appeals.
- Deceptive & Fraudulent Content: promising money, loans, grants, benefits or "you qualify"; implying government endorsement; claims the landing page can't back up; saying a planned project is finished.
- Unverifiable claims: guarantees, "the best", "number one", "instant".
- Personal attributes: implying the reader is poor, sick, in debt or unemployed.
- Low quality: clickbait, pressure ("act now", "last chance"), ALL CAPS, repeated punctuation, more than two hashtags.
For images X also rejects: people in uniform (police, military, officials), government insignia or coat of arms, flags used for campaigning, party colours, campaign posters or a politician as the subject, graphic or shocking content, people shown in distress to provoke pity, piles of cash, before/after comparisons that imply guaranteed results, and images that are mostly text.`;

async function chat(messages: unknown[]): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.ADLY_REVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("[adly] AI review failed:", response.status, (await response.text()).slice(0, 200));
      return null;
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    return content ? (JSON.parse(content) as Record<string, unknown>) : null;
  } catch (error) {
    console.warn("[adly] AI review failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export interface AiCopyIssue {
  field: "headline" | "body" | "keywords";
  found: string;
  why: string;
}

/** Problems the AI sees in the copy, and a rewrite that keeps the meaning. */
export async function aiReviewCopy(
  copy: AdCopy,
  context: CopyContext
): Promise<{ issues: AiCopyIssue[]; rewrite: AdCopy } | null> {
  const answer = await chat([
    { role: "system", content: POLICY_BRIEF },
    {
      role: "user",
      content: `Project: ${context.projectName}${context.county ? ` (${context.county} County)` : ""}, status: ${context.status ?? "unknown"}.
Ad: ${JSON.stringify(copy)}
List anything in the headline, body or keywords that X would likely reject, quoting the words and saying why in one plain sentence each. Then give a rewrite that keeps the useful meaning, stays factual about the project, and avoids every problem above. Headline at most ${context.limits.headline} characters, body at most ${context.limits.body}. If nothing is wrong, return no issues and the ad unchanged.
Answer JSON: {"issues":[{"field":"headline"|"body"|"keywords","found":"...","why":"..."}],"headline":"...","body":"...","keywords":["..."]}`,
    },
  ]);
  if (!answer) return null;
  const issues = (Array.isArray(answer.issues) ? answer.issues : [])
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      field: (["headline", "body", "keywords"].includes(String(i.field)) ? i.field : "body") as AiCopyIssue["field"],
      found: String(i.found ?? "").slice(0, 200),
      why: String(i.why ?? "").slice(0, 300),
    }))
    .filter((i) => i.found && i.why);
  const headline = typeof answer.headline === "string" ? answer.headline.trim() : "";
  const body = typeof answer.body === "string" ? answer.body.trim() : "";
  const keywords = Array.isArray(answer.keywords)
    ? answer.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean).slice(0, 20)
    : [];
  if (!headline || !body) return null;
  return { issues, rewrite: { headline, body, keywords: keywords.length ? keywords : copy.keywords } };
}

/** What the AI sees in a photo that X would likely reject. `null` when it could not look. */
export async function aiCheckImage(jpegDataUrl: string): Promise<{ ok: boolean; issues: string[] } | null> {
  const answer = await chat([
    { role: "system", content: POLICY_BRIEF },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: 'Would X likely reject this ad image? Answer JSON: {"ok":true|false,"issues":["one plain sentence per problem"]}. Only list real problems you can see.',
        },
        { type: "image_url", image_url: { url: jpegDataUrl, detail: "low" } },
      ],
    },
  ]);
  if (!answer) return null;
  const issues = (Array.isArray(answer.issues) ? answer.issues : []).map((i) => String(i).slice(0, 300)).filter(Boolean);
  return { ok: answer.ok !== false && issues.length === 0, issues };
}
