import * as cheerio from "cheerio";
import { EeatAuditResult, EeatCategorySummary, EeatCheckResult, EeatSeverity, TechnicalCategoryStatus } from "./types.js";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: EeatSeverity;
}

const CHECKS: CheckDefinition[] = [
  [1, "Author & Expertise", "Author Byline on Every Article", 3.55, "Critical"],
  [2, "Author & Expertise", "Byline Hyperlinked to Bio", 2.65, "High"],
  [3, "Author & Expertise", "Author Bio Page Exists", 3.17, "Critical"],
  [4, "Author & Expertise", "Bio Page >=150 Words", 2.12, "High"],
  [5, "Author & Expertise", "LinkedIn Linked from Bio", 2.65, "High"],
  [6, "Author & Expertise", "Author Content Volume >=3", 2.12, "Medium"],
  [7, "Editorial Standards", "Editorial Policy Page", 2.65, "High"],
  [8, "Trust & Transparency", "Contact Page Physical Address", 2.65, "Critical"],
  [9, "Trust & Transparency", "Contact Page Phone Number", 2.12, "High"],
  [10, "Trust & Transparency", "Contact Page Company Email", 2.12, "High"],
  [11, "Trust & Transparency", "Contact Form Functional", 2.12, "High"],
  [12, "Trust & Transparency", "Privacy Policy Substantive", 2.12, "Medium"],
  [13, "Trust & Transparency", "Terms of Service", 1.59, "Medium"],
  [14, "Trust Signals & Reviews", "Client Logo Section", 1.59, "Medium"],
  [15, "Trust & Transparency", "About Page >=300w Depth", 2.65, "High"],
  [16, "Citations & Evidence", "Outbound .edu/.gov Links", 2.65, "High"],
  [17, "Citations & Evidence", "Inline Source Citations", 2.65, "High"],
  [18, "Citations & Evidence", "Verifiable Claim Ratio", 2.65, "High"],
  [19, "Citations & Evidence", "Case Studies with Metrics", 2.65, "High"],
  [20, "Trust & Transparency", "Team Page Complete", 2.12, "High"],
  [21, "Author & Expertise", "Author Experience Quantified", 2.12, "Medium"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const CATEGORY_ORDER = [...new Set(CHECKS.map((check) => check.category))];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "AIVisibilityAnalyzer/1.0" }
    });
    return response.ok ? { url: response.url, html: await response.text(), status: response.status } : null;
  } catch {
    return null;
  }
}

function absolute(base: URL, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function sameOrigin(base: URL, href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function findLink($: cheerio.CheerioAPI, base: URL, pattern: RegExp) {
  return $("a[href]").toArray()
    .map((el) => ({ href: absolute(base, $(el).attr("href") ?? ""), text: $(el).text().replace(/\s+/g, " ").trim() }))
    .find((link) => link.href && sameOrigin(base, link.href) && (pattern.test(link.href) || pattern.test(link.text)));
}

function result(def: CheckDefinition, state: { passed?: boolean; skipped?: boolean; warning?: boolean; evidence?: Record<string, unknown> }): EeatCheckResult {
  const skipped = Boolean(state.skipped);
  const warning = !skipped && Boolean(state.warning);
  const passed = skipped ? true : Boolean(state.passed);
  return {
    ...def,
    passed,
    skipped,
    warning,
    score: skipped ? 0 : passed ? def.weight : warning ? def.weight / 2 : 0,
    evidence: state.evidence ?? {}
  };
}

function summarize(checks: EeatCheckResult[]): EeatCategorySummary[] {
  return CATEGORY_ORDER.map((categoryName) => {
    const categoryChecks = checks.filter((check) => check.category === categoryName);
    const scorable = categoryChecks.filter((check) => !check.skipped);
    const failed = scorable.filter((check) => !check.passed && !check.warning);
    const warningChecks = scorable.filter((check) => check.warning).length;
    const skippedChecks = categoryChecks.filter((check) => check.skipped).length;
    const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
    const status: TechnicalCategoryStatus = scorable.length === 0 ? "Skipped" : failed.length === 0 && warningChecks === 0 ? "Passed" : failed.length === 0 ? "Minor Attention" : "Needs Attention";
    return {
      categoryName,
      totalChecks: categoryChecks.length,
      passedChecks: scorable.filter((check) => check.passed && !check.warning).length,
      failedChecks: failed.length,
      warningChecks,
      skippedChecks,
      score,
      status
    };
  });
}

function hasByline($: cheerio.CheerioAPI) {
  return $('[rel="author"],.author,.byline,[class*="author" i],[class*="byline" i]').length > 0 || /\b(by|written by|reviewed by)\s+[A-Z][a-z]+/i.test($("body").text());
}

function bylineBioLink($: cheerio.CheerioAPI, base: URL) {
  return $("a[href]").toArray()
    .map((el) => ({ href: absolute(base, $(el).attr("href") ?? ""), text: $(el).text().trim() }))
    .find((link) => link.href && sameOrigin(base, link.href) && /author|team|about|bio|profile/i.test(link.href + " " + link.text));
}

function phoneFound(text: string) {
  return /\+?\d[\d\s().-]{7,}\d/.test(text);
}

function emailFound(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function addressFound(text: string) {
  return /\b(street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|suite|floor|building|city|state|zip|postal|india|usa|uk)\b/i.test(text) && /\d{2,}/.test(text);
}

export async function runEeatAudit(inputUrl: string, html?: string): Promise<EeatAuditResult> {
  const normalized = normalizeUrl(inputUrl);
  const base = new URL(normalized);
  const fetchedHomepage = html === undefined ? await fetchHtml(normalized) : null;
  const homepage = html ?? fetchedHomepage?.html ?? "";
  const $ = cheerio.load(homepage);
  const links = {
    about: findLink($, base, /about/i),
    contact: findLink($, base, /contact|get in touch/i),
    privacy: findLink($, base, /privacy/i),
    terms: findLink($, base, /terms|conditions|tos/i),
    team: findLink($, base, /team|people|leadership|authors/i),
    editorial: findLink($, base, /editorial|fact.check|review.policy|correction/i),
    caseStudy: findLink($, base, /case.stud|results|customer.story|success.story/i),
    article: findLink($, base, /blog|article|insight|news|guide/i)
  };
  const fetched = await Promise.all(Object.entries(links).map(async ([key, link]) => ({
    key,
    href: link?.href ?? "",
    page: link?.href ? await fetchHtml(link.href) : null
  })));
  const pageFor = (key: string) => fetched.find((item) => item.key === key)?.page?.html ?? "";
  const articleHtml = pageFor("article");
  const article$ = cheerio.load(articleHtml || homepage);
  const articleApplicable = Boolean(articleHtml || $("article").length || /blog|article|news|insight/i.test(homepage));
  const bioLink = bylineBioLink(article$, base) || bylineBioLink($, base);
  const bioPage = bioLink?.href ? await fetchHtml(bioLink.href) : null;
  const bio$ = cheerio.load(bioPage?.html ?? "");
  const bioText = bio$("body").text().replace(/\s+/g, " ").trim();
  const contact$ = cheerio.load(pageFor("contact"));
  const contactText = contact$("body").text().replace(/\s+/g, " ").trim();
  const aboutText = cheerio.load(pageFor("about"))("body").text().replace(/\s+/g, " ").trim();
  const privacyText = cheerio.load(pageFor("privacy"))("body").text().replace(/\s+/g, " ").trim();
  const termsText = cheerio.load(pageFor("terms"))("body").text().replace(/\s+/g, " ").trim();
  const team$ = cheerio.load(pageFor("team"));
  const teamText = team$("body").text().replace(/\s+/g, " ").trim();
  const caseText = cheerio.load(pageFor("caseStudy"))("body").text().replace(/\s+/g, " ").trim();
  const outboundLinks = $("a[href^='http']").toArray().map((el) => $(el).attr("href") ?? "").filter((href) => !sameOrigin(base, href));
  const sourceCitations = $("article a[href^='http'],main a[href^='http'],cite,blockquote,sup a[href]").length;
  const results: EeatCheckResult[] = [];
  const add = (id: number, state: Parameters<typeof result>[1]) => {
    const def = CHECKS.find((check) => check.id === id);
    if (def) results.push(result(def, state));
  };

  add(1, { passed: articleApplicable && hasByline(article$), evidence: { articleUrl: links.article?.href ?? normalized, articleDetected: articleApplicable } });
  add(2, { passed: articleApplicable && Boolean(bioLink), evidence: { bioLink: bioLink?.href ?? "", articleDetected: articleApplicable } });
  add(3, { passed: Boolean(bioPage?.html), evidence: { bioUrl: bioLink?.href ?? "", status: bioPage?.status ?? 0 } });
  add(4, { passed: wordCount(bioText) >= 150, evidence: { bioUrl: bioLink?.href ?? "", words: wordCount(bioText) } });
  add(5, { passed: bio$("a[href*='linkedin.com']").length > 0, evidence: { linkedinLinks: bio$("a[href*='linkedin.com']").length } });
  add(6, { passed: bio$("a[href*='/blog'],a[href*='/article'],a[href*='/news'],a[href*='/insight']").length >= 3, evidence: { contentLinks: bio$("a[href*='/blog'],a[href*='/article'],a[href*='/news'],a[href*='/insight']").length } });
  add(21, { passed: /\b\d+\+?\s+(years?|yrs?)\b|\b(since|experience)\s+\d{4}\b/i.test(bioText), evidence: { bioUrl: bioLink?.href ?? "" } });

  add(7, { passed: Boolean(pageFor("editorial")) && wordCount(cheerio.load(pageFor("editorial"))("body").text()) >= 100, evidence: { editorialUrl: links.editorial?.href ?? "" } });
  add(8, { passed: addressFound(contactText), evidence: { contactUrl: links.contact?.href ?? "" } });
  add(9, { passed: phoneFound(contactText), evidence: { contactUrl: links.contact?.href ?? "" } });
  add(10, { passed: emailFound(contactText), evidence: { contactUrl: links.contact?.href ?? "" } });
  add(11, { skipped: true, evidence: { reason: "Form functionality cannot be verified with 100% accuracy without submitting a form." } });
  add(12, { passed: wordCount(privacyText) >= 300, evidence: { privacyUrl: links.privacy?.href ?? "", words: wordCount(privacyText) } });
  add(13, { passed: Boolean(pageFor("terms")) && wordCount(termsText) >= 100, evidence: { termsUrl: links.terms?.href ?? "", words: wordCount(termsText) } });
  add(15, { passed: wordCount(aboutText) >= 300, evidence: { aboutUrl: links.about?.href ?? "", words: wordCount(aboutText) } });
  add(20, { passed: Boolean(pageFor("team")) && (team$("img").length >= 2 || team$("a[href*='linkedin.com']").length >= 2 || (teamText.match(/\b(CEO|Founder|Director|Manager|Lead|Head of)\b/g) ?? []).length >= 2), evidence: { teamUrl: links.team?.href ?? "" } });

  add(14, { passed: /trusted by|clients|customers|partners|featured in/i.test(homepage) && $("img[alt]").length >= 2, evidence: { logoImages: $("img[alt]").length } });
  add(16, { passed: outboundLinks.some((href) => /\.(edu|gov)(?:\/|$)/i.test(new URL(href).hostname)), evidence: { eduGovLinks: outboundLinks.filter((href) => /\.(edu|gov)(?:\/|$)/i.test(new URL(href).hostname)).slice(0, 10) } });
  add(17, { passed: articleApplicable && sourceCitations > 0, evidence: { sourceCitations, articleDetected: articleApplicable } });
  add(18, { skipped: true, evidence: { reason: "Verifiable claim ratio requires claim extraction and source validation; static HTML alone cannot verify it exactly." } });
  add(19, { passed: Boolean(pageFor("caseStudy")) && /\b\d+(?:\.\d+)?%|\b\d+x\b|\bROI\b|\brevenue\b|\bsaved\b/i.test(caseText), evidence: { caseStudyUrl: links.caseStudy?.href ?? "" } });

  const categories = summarize(results);
  const scorable = results.filter((check) => !check.skipped);
  const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
  return { score, checkedAt: new Date().toISOString(), categories, checks: results };
}
