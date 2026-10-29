import type { AdPolicyFinding, ProjectStatus, XPolicyRule } from "@/types";

/**
 * Adly's X ad policy check for ad copy: finds wording X's reviewers reject and
 * rewrites the ad so it should pass. Rules come from X's ads policies and from
 * what X actually rejected on this platform (the Faida ads: "grants, loans,
 * benefits you qualify for" was flagged as Deceptive & Fraudulent Content).
 *
 * Plain rules, no network calls: the same check runs in the review dialog and
 * again on the server before an ad is created or published.
 */

export interface AdCopy {
  headline: string;
  body: string;
  keywords: string[];
}

export interface CopyContext {
  projectName: string;
  county?: string;
  status?: ProjectStatus;
  limits: { headline: number; body: number };
}

export interface CopyReview {
  findings: AdPolicyFinding[];
  suggested: AdCopy;
}

type Action = "drop_sentence" | "remove_phrase";

interface Rule {
  rule: XPolicyRule;
  action: Action;
  patterns: RegExp[];
  why: string;
  /** Only when the project is not finished yet */
  unlessCompleted?: boolean;
}

const RULES: Rule[] = [
  {
    rule: "political",
    action: "drop_sentence",
    patterns: [
      /\b(vote|votes|voting|voters?|elect|elected|re-?elect|elections?|ballot|manifesto|nominations?|running mate|campaign(?:ing)? for)\b/i,
      /\b(ODM|UDA|Jubilee|Azimio|Kenya Kwanza|Wiper|DCP)\b/,
      /\b(Hon\.?|Honou?rable|H\.E\.?|His Excellency|Her Excellency|Governor|Senator|MCA|MP|Member of Parliament|Women Rep(?:resentative)?|aspirant|candidate)(?=\s|$|[.,;:!?'’])/i,
      /\b2027\b/,
    ],
    why:
      "X restricts political ads: ads that name politicians, offices, parties or elections need special certification. Adly keeps the ad about the project itself.",
  },
  {
    rule: "financial_promise",
    action: "drop_sentence",
    patterns: [
      /\b(free money|easy money|quick cash|cash prizes?|get paid|make money|double your|earn (?:money|cash|ksh|kes))\b/i,
      /\byou (?:qualify|are eligible|can get|will get|deserve|are entitled)\b/i,
      /\b(loans?|grants?|cash transfers?|stipends?|handouts?|benefits)\b[^.!?]*\b(for you|waiting|today|instantly|now)\b/i,
      /\bwin (?:cash|money|ksh|kes|prizes?)\b/i,
    ],
    why:
      "X's Deceptive & Fraudulent Content and financial services policies reject ads that promise money, loans, grants or benefits. This is why the earlier Faida ads were rejected.",
  },
  {
    rule: "impersonation",
    action: "drop_sentence",
    patterns: [
      /\bofficial (?:government|county|state|national)\b/i,
      /\bgovernment[- ](?:approved|backed|endorsed|official|programme|program)\b/i,
      /\bendorsed by (?:the )?(?:government|county|state|president|ministry)\b/i,
      /\bin partnership with (?:the )?(?:government|ministry|national government)\b/i,
    ],
    why: "X rejects ads that suggest a government connection or endorsement the advertiser can't show (Deceptive & Fraudulent Content).",
  },
  {
    rule: "progress_claim",
    action: "drop_sentence",
    unlessCompleted: true,
    patterns: [
      /\b(?:has|have|we've|we have|was|were|is now|are now) (?:completed|finished|delivered|built|launched|opened)\b/i,
      /\b(now open|fully operational|already complete[d]?|successfully completed)\b/i,
    ],
    why: "The project isn't finished yet, so saying it is done would mislead people. X rejects ads with claims the landing page can't back up.",
  },
  {
    rule: "personal_attributes",
    action: "drop_sentence",
    patterns: [
      /\bare you (?:poor|broke|unemployed|jobless|in debt|sick|struggling|desperate|disabled|pregnant)\b/i,
      /\b(?:you're|you are) (?:poor|broke|in debt|sick|unemployed|jobless|desperate)\b/i,
    ],
    why: "X doesn't allow ads that assert or imply someone's personal circumstances (money, health, job). Speak to everyone instead.",
  },
  {
    rule: "unproven_claim",
    action: "remove_phrase",
    patterns: [/\b(?:100% )?guaranteed?\b/i, /\brisk[- ]free\b/i, /\b100% (?:free|success|sure)\b/i, /\binstant(?:ly)?\b/i],
    why: "Guarantees and absolute claims need proof X can check. Adly removes them.",
  },
  {
    rule: "unproven_claim",
    action: "drop_sentence",
    patterns: [/\b(?:the best|best in Kenya|No\.? ?1|number one|#1)\b/i],
    why: "\"The best\" or \"number one\" claims need proof X can check. Adly removes the sentence.",
  },
  {
    rule: "clickbait",
    action: "remove_phrase",
    patterns: [
      /\b(?:click here|act now|hurry(?: up)?|last chance|limited time(?: only)?|don'?t miss (?:out|this)|you won'?t believe|before it'?s too late|shocking)\b[!.]*/i,
    ],
    why: "X's ad quality rules reject pressure and clickbait phrases. Adly removes them.",
  },
];

/** Acronyms that are fine in capitals. */
const ACRONYMS = new Set(["KES", "KSH", "USD", "NGO", "CBO", "ICT", "GIS", "SME", "SMES", "TVET", "HELB", "KCSE", "KCPE", "CBC", "NHIF", "SHA", "WASH", "LED", "PWD", "PWDS"]);

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tidy(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[.!?])/g, "")
    .replace(/^[\s,;:—–-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Shorten to a limit without cutting a word in half. */
export function clipWords(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit + 1);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.5 ? cut.slice(0, space) : clean.slice(0, limit)).replace(/[\s,.;:&—–-]+$/, "");
}

function activeRules(status?: ProjectStatus): Rule[] {
  return RULES.filter((r) => !(r.unlessCompleted && status === "completed"));
}

function firstMatch(rule: Rule, text: string): string | null {
  for (const pattern of rule.patterns) {
    const m = text.match(pattern);
    if (m) return m[0].trim();
  }
  return null;
}

function quote(text: string, max = 90): string {
  return `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
}

/** Apply the rules to one piece of text; returns the cleaned text and what changed. */
function cleanText(
  text: string,
  field: "headline" | "body",
  rules: Rule[]
): { text: string; findings: AdPolicyFinding[]; dropped: boolean } {
  const findings: AdPolicyFinding[] = [];
  let dropped = false;
  const kept: string[] = [];
  for (const sentence of sentences(text)) {
    let current = sentence;
    let drop: { rule: Rule; found: string } | null = null;
    for (const rule of rules.filter((r) => r.action === "drop_sentence")) {
      const found = firstMatch(rule, current);
      if (found) {
        drop = { rule, found };
        break;
      }
    }
    if (drop) {
      dropped = true;
      findings.push({
        rule: drop.rule.rule,
        field,
        severity: "fix",
        found: drop.found,
        why: drop.rule.why,
        change: field === "headline" ? `Replaced the headline ${quote(text)}` : `Removed ${quote(sentence)}`,
      });
      continue;
    }
    for (const rule of rules.filter((r) => r.action === "remove_phrase")) {
      for (const pattern of rule.patterns) {
        const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
        const matches = current.match(global);
        if (!matches) continue;
        current = tidy(current.replace(global, " "));
        for (const found of matches) {
          findings.push({ rule: rule.rule, field, severity: "fix", found: found.trim(), why: rule.why, change: `Removed ${quote(found.trim())}` });
        }
      }
    }
    if (current) kept.push(capitalize(current));
  }

  // Formatting: shouting, repeated punctuation, hashtag walls.
  let out = kept.join(" ");
  const shouted = out.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})+\b/g)?.filter((run) => run.split(/\s+/).some((w) => !ACRONYMS.has(w))) ?? [];
  const lettersOnly = out.replace(/[^A-Za-z]/g, "");
  const mostlyCaps = lettersOnly.length >= 12 && lettersOnly.replace(/[^A-Z]/g, "").length / lettersOnly.length > 0.7;
  if (mostlyCaps || shouted.length) {
    const before = out;
    out = sentences(out.replace(/\b[A-Z][A-Z']+\b/g, (w) => (ACRONYMS.has(w) ? w : w.toLowerCase())))
      .map(capitalize)
      .join(" ");
    if (out !== before) {
      findings.push({
        rule: "formatting",
        field,
        severity: "fix",
        found: shouted[0] ?? before,
        why: "X's ad quality rules reject text written in capital letters. Adly puts it in normal case.",
        change: "Changed capital letters to normal case",
      });
    }
  }
  if (/([!?])\1+/.test(out)) {
    out = out.replace(/([!?])\1+/g, "$1");
    findings.push({
      rule: "formatting",
      field,
      severity: "fix",
      found: "!!",
      why: "Repeated punctuation breaks X's ad quality rules.",
      change: "Kept one punctuation mark",
    });
  }
  const tags = out.match(/#\w+/g) ?? [];
  if (tags.length > 2) {
    let seen = 0;
    out = tidy(out.replace(/#\w+/g, (tag) => (++seen <= 2 ? tag : "")));
    findings.push({
      rule: "formatting",
      field,
      severity: "fix",
      found: tags.slice(2).join(" "),
      why: "X recommends at most two hashtags in an ad; more looks like spam.",
      change: `Removed ${tags.length - 2} extra hashtag${tags.length - 2 === 1 ? "" : "s"}`,
    });
  }
  return { text: tidy(out), findings, dropped };
}

function keywordProblem(keyword: string, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    if (rule.rule === "unproven_claim" || rule.rule === "clickbait" || rule.rule === "progress_claim") continue;
    if (firstMatch(rule, keyword)) return rule;
  }
  return null;
}

/** A neutral line about the project, used when nothing of the original text can stay. */
export function neutralBody(context: CopyContext): string {
  const where = context.county ? ` in ${context.county} County` : "";
  const what =
    context.status === "completed"
      ? "see what was done and how it went"
      : context.status === "in-progress"
        ? "see the plan, the progress so far and the milestones"
        : "see the plan and its milestones";
  return `${context.projectName}${where}: ${what}.`;
}

/**
 * Check an ad's copy against X's policies. `suggested` is the original when
 * nothing needs to change.
 */
export function reviewCopyForX(copy: AdCopy, context: CopyContext): CopyReview {
  const rules = activeRules(context.status);
  const findings: AdPolicyFinding[] = [];

  // Headline: if a sentence-level rule hits, use the project name instead.
  const head = cleanText(copy.headline, "headline", rules);
  let headline = head.text;
  findings.push(...head.findings);
  if (head.dropped || !headline) {
    const fromName = cleanText(context.projectName, "headline", rules);
    headline = fromName.dropped || !fromName.text ? "Community project update" : fromName.text;
  }
  headline = clipWords(headline, context.limits.headline);

  const main = cleanText(copy.body, "body", rules);
  findings.push(...main.findings);
  let body = main.text;
  // Short text is fine as written; only fill in when the cleanup left too little.
  if (!body || (main.findings.length > 0 && body.replace(/[^A-Za-z]/g, "").length < 20)) {
    const fallback = cleanText(neutralBody(context), "body", rules);
    body = fallback.dropped ? "See the plan and its milestones." : fallback.text;
    if (copy.body.trim() && body !== copy.body.trim()) {
      findings.push({
        rule: findings.find((f) => f.field === "body")?.rule ?? "formatting",
        field: "body",
        severity: "fix",
        found: copy.body.trim(),
        why: "After removing what X would reject, too little of the text was left, so Adly wrote a plain description of the project.",
        change: `Replaced the text with ${quote(body)}`,
      });
    }
  }
  body = clipWords(body, context.limits.body);

  const keywords: string[] = [];
  for (const keyword of copy.keywords) {
    const problem = keywordProblem(keyword, rules);
    if (problem) {
      findings.push({
        rule: problem.rule,
        field: "keywords",
        severity: "fix",
        found: keyword,
        why: problem.why,
        change: `Removed the keyword ${quote(keyword)}`,
      });
    } else {
      keywords.push(keyword);
    }
  }
  if (!keywords.length) keywords.push(...[context.county && `${context.county} County`, "community projects"].filter((k): k is string => Boolean(k)));

  return { findings, suggested: { headline, body, keywords } };
}

/** The copy problems X would likely reject the ad for (empty when it should pass). */
export function xCopyProblems(copy: AdCopy, context: CopyContext): AdPolicyFinding[] {
  return reviewCopyForX(copy, context).findings.filter((f) => f.severity === "fix");
}

/** One line for an error message: what X would reject and why. */
export function describeProblems(findings: AdPolicyFinding[]): string {
  const seen = new Set<XPolicyRule>();
  const parts: string[] = [];
  for (const f of findings) {
    if (seen.has(f.rule)) continue;
    seen.add(f.rule);
    parts.push(`${quote(f.found, 40)} (${RULE_LABELS[f.rule]})`);
  }
  return parts.join("; ");
}

export const RULE_LABELS: Record<XPolicyRule, string> = {
  political: "political content",
  financial_promise: "money or benefit promise",
  unproven_claim: "claim X can't verify",
  progress_claim: "says the project is done",
  impersonation: "suggests a government endorsement",
  personal_attributes: "personal circumstances",
  clickbait: "clickbait",
  formatting: "formatting",
  image: "image",
};
