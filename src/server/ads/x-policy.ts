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
  /**
   * Names of the politicians or officials behind the project (the leader on
   * the project page, the Tracker changemaker). X counts an ad that names one
   * as political content, even without a title like "Hon.".
   */
  officialNames?: string[];
  /**
   * Whether the project lists opportunities (jobs, training ...). false turns
   * on the "jobs" rule; undefined (not known) leaves it off.
   */
  hasOpportunities?: boolean;
}

/**
 * X's Political Content policy: an ad is political when it references a
 * candidate, party, elected or appointed official, election, referendum,
 * legislation, regulation, directive or judicial outcome, or advocates for or
 * against one. Political content ads are only allowed in a list of countries
 * that does not include Kenya, so for M-Taji there is no certification route:
 * the ad, and the page it links to, have to stay off politics.
 */
const POLITICAL_PATTERNS: RegExp[] = [
  // Elections and voting
  /\b(vote|votes|voting|voters?|elect|elected|re-?elect|elections?|by-?elections?|ballot|manifesto|nominations?|running mate|campaign(?:ing)? for|referendum|polling stations?|IEBC)\b/i,
  // Parties (names are case-sensitive: "Wiper" and "Safina" are also ordinary words in lower case)
  /\b(ODM|UDA|Jubilee|Azimio|Kenya Kwanza|Wiper|DCP|ANC|KANU|DAP-K|Ford[- ]Kenya|Roots Party|Safina)\b/,
  // Titles and offices of elected or appointed officials
  /\b(Hon\.?|Honou?rable|H\.E\.?|His Excellency|Her Excellency|Governor|Deputy Governor|Senator|MCA|MP|Member of Parliament|Women Rep(?:resentative)?|aspirant|candidate|President|Deputy President|Prime Cabinet Secretary|Cabinet Secretary|Principal Secretary|Minister|Speaker of|Majority Leader|Minority Leader|Chief Whip)(?=\s|$|[.,;:!?'’])/i,
  /\b(?:CS|PS|CEC|DP)(?= [A-Z])/,
  /\b2027\b/,
  // Legislation, regulation, directives and judicial outcomes
  /\b(legislation|parliament(?:ary)?|the senate|county assembly|national assembly|(?:finance|housing) bill|bills? (?:before|in) (?:parliament|the senate|the assembly)|constitutional amendment|court (?:ruling|order|judge?ment)|(?:high|supreme) court|presidential directive|government directive|executive order)\b/i,
  // Parties, movements and advocacy for a government or political agenda
  /\b(political (?:part(?:y|ies)|affiliations?|movements?|mobili[sz]ation)|party (?:members?|leaders?|tickets?|nominations?)|regardless of political|government['’]?s? (?:development )?agenda|(?:Kenya|the nation|the country|national)['’]?s? development agenda|Kazi (?:ni )?Delivery|bottom[- ]up (?:economic|economy|agenda)|hustler (?:nation|movement)|national secretariat)\b/i,
  /\bmobili[sz](?:e|es|ed|ing|ation of) (?:young|youth|voters?|supporters?|(?:young )?Kenyans|the youth|the people|the masses)\b/i,
  /\b(?:support|back|stand with|rally behind|donate to) (?:our|my|the) (?:leader|candidate|party|campaign|MP|MCA|governor|senator)\b/i,
];

const POLITICAL_WHY =
  "X's Political Content policy: ads that mention a politician or official, an office, a party, an election, legislation, a court outcome, or support for a government or political agenda are political ads, and X doesn't allow political ads aimed at Kenya. Adly keeps the ad about the project itself.";


const HONORIFIC = /^(?:hon\.?|honou?rable|h\.e\.?|dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|eng\.?)\s+/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The ways a person's name shows up in text: as given, without the title, and with the two names swapped. */
export function nameVariants(names: string[] = []): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim().replace(HONORIFIC, "").trim();
    if (name.replace(/[^A-Za-z]/g, "").length < 4) continue;
    out.add(name);
    const words = name.split(" ");
    if (words.length === 2) out.add(`${words[1]} ${words[0]}`);
  }
  return Array.from(out);
}

function officialNameRule(names?: string[]): Rule | null {
  const variants = nameVariants(names);
  if (!variants.length) return null;
  return {
    rule: "political",
    action: "drop_sentence",
    patterns: variants.map((n) => new RegExp(`(?<![\\w])${escapeRegExp(n).replace(/ /g, "\\s+")}(?![\\w])`, "i")),
    why: "This names the politician or official behind the project. X counts an ad that names one as a political ad, and X doesn't allow political ads aimed at Kenya. Adly keeps the ad about the project itself.",
  };
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
  /** Only when the project is known to list no opportunities (hasOpportunities === false) */
  onlyWithoutOpportunities?: boolean;
}

const RULES: Rule[] = [
  {
    rule: "political",
    action: "drop_sentence",
    patterns: POLITICAL_PATTERNS,
    why: POLITICAL_WHY,
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
    rule: "financial_promise",
    action: "drop_sentence",
    onlyWithoutOpportunities: true,
    patterns: [/\b(jobs?|employment|hiring|vacanc(?:y|ies)|recruit(?:ing|ment)|job opportunities|get (?:a )?job)\b/i],
    why: "The ad mentions jobs, but the project lists no job openings. X's Deceptive & Fraudulent Content policy rejects ads that suggest work or income the landing page doesn't offer. Add the openings as opportunities on the project, or leave jobs out.",
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

function activeRules(context: CopyContext): Rule[] {
  const rules = RULES.filter(
    (r) =>
      !(r.unlessCompleted && context.status === "completed") &&
      !(r.onlyWithoutOpportunities && context.hasOpportunities !== false)
  );
  const names = officialNameRule(context.officialNames);
  return names ? [names, ...rules] : rules;
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
  const rules = activeRules(context);
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

/** What X's reviewers read on the ad's landing page: the project page. */
export interface LandingPage {
  name: string;
  description: string;
}

/**
 * Political content on the project page the ad links to. Adly can't rewrite
 * that page, and X doesn't allow political ads aimed at Kenya, so each finding
 * is a "block": the owner edits the project or leaves X out.
 */
function landingRules(context: Pick<CopyContext, "officialNames">): Rule[] {
  const names = officialNameRule(context.officialNames);
  return [RULES.find((r) => r.rule === "political")!, ...(names ? [names] : [])];
}

function politicalMatch(rules: Rule[], text: string): string | null {
  return rules.map((r) => firstMatch(r, text)).find((m): m is string => Boolean(m)) ?? null;
}

export function xLandingProblems(page: LandingPage, context: Pick<CopyContext, "officialNames">): AdPolicyFinding[] {
  const rules = landingRules(context);
  const findings: AdPolicyFinding[] = [];
  for (const [part, text] of [
    ["name", page.name],
    ["description", page.description],
  ] as const) {
    for (const sentence of sentences(text ?? "")) {
      const found = politicalMatch(rules, sentence);
      if (!found) continue;
      findings.push({
        rule: "political",
        field: "landing",
        severity: "block",
        found,
        why: `The project ${part} says ${quote(sentence, 220)}`,
      });
      if (findings.length >= 3) return findings;
    }
  }
  return findings;
}

/**
 * Adly's rule-based suggestion for a project page X would reject: keeps every
 * sentence that is not political, drops a political lead-in clause ("Structured
 * from the Ward Level to the National Secretariat, MYM provides ...") and
 * drops the rest of a political sentence. A name with political content is
 * replaced with a plain one. When too little is left, it writes a plain line
 * about the project. Nothing is invented: the owner reviews it and fills in
 * what the work is.
 */
export function suggestLandingForX(page: LandingPage, context: Pick<CopyContext, "officialNames" | "county">): LandingPage {
  const rules = landingRules(context);
  const kept: string[] = [];
  for (const sentence of sentences(page.description ?? "")) {
    if (!politicalMatch(rules, sentence)) {
      kept.push(sentence);
      continue;
    }
    const comma = sentence.indexOf(", ");
    if (comma > 0) {
      const lead = sentence.slice(0, comma);
      const rest = sentence.slice(comma + 2);
      // Only a short lead-in ("Structured from ..., MYM provides ..."): when the
      // comma comes late, what follows is the tail of a list, not a sentence.
      if (
        politicalMatch(rules, lead) &&
        !politicalMatch(rules, rest) &&
        lead.length < rest.length &&
        rest.replace(/[^A-Za-z]/g, "").length >= 20
      ) {
        kept.push(capitalize(rest));
      }
    }
  }
  const where = context.county ? ` in ${context.county} County` : "";
  const nameIsPolitical = Boolean(politicalMatch(rules, page.name ?? ""));
  const name = nameIsPolitical ? `Community project${where}` : page.name;
  let description = tidy(kept.join(" "));
  if (description.replace(/[^A-Za-z]/g, "").length < 40) {
    description = `${name}${nameIsPolitical ? "" : where}: what is being done, where, and who takes part. Follow the plan, the progress so far and the milestones.`;
  }
  return { name, description };
}

/**
 * Political words in the text printed on an ad's photo (read by the AI
 * review): slogans, movement names, leaders' names. X's reviewers read text
 * in images as part of the ad.
 */
export function imageTextProblems(text: string, context: Pick<CopyContext, "officialNames">): string[] {
  const rules = landingRules(context);
  const found: string[] = [];
  for (const line of (text ?? "").split(/[\n.!?|•·]+/)) {
    const match = politicalMatch(rules, line.trim());
    if (match && !found.some((f) => f.toLowerCase() === match.toLowerCase())) found.push(match);
    if (found.length >= 3) break;
  }
  return found;
}

const GENERIC_NAME_WORDS = new Set(["project", "projects", "community", "county", "programme", "program", "initiative", "the", "and", "for"]);

function nameWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !GENERIC_NAME_WORDS.has(w));
}

/**
 * The photo shows a name close to the project's but not the same (the ad
 * says "Mashinani Youth Usawa Movement", the photo "Mashinani Youth Kazi
 * Delivery Movement"). Returns the project-name words missing from the photo,
 * or null when the names agree or the photo shows no such name.
 */
export function imageNameMismatch(text: string, projectName: string): string[] | null {
  const words = Array.from(new Set(nameWords(projectName)));
  if (words.length < 2) return null;
  const inImage = new Set(nameWords(text));
  const present = words.filter((w) => inImage.has(w));
  const missing = words.filter((w) => !inImage.has(w));
  // Most of the name is on the photo, but not all of it: a different version of the name.
  if (present.length >= 2 && present.length / words.length > 0.5 && missing.length > 0) return missing;
  return null;
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
