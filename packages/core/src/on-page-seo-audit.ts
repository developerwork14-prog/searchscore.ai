import * as cheerio from "cheerio";
import {
  OnPageSeoAuditResult,
  OnPageSeoCategorySummary,
  OnPageSeoCheckResult,
  OnPageSeoSeverity,
  TechnicalCategoryStatus
} from "./types.js";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: OnPageSeoSeverity;
}

const CHECKS: CheckDefinition[] = [
  [1, "Headings & Titles", "Heading Hierarchy No Skips", 3.26, "High"],
  [2, "Content Signals & Clarity", "Entity Bolding Quality", 2.72, "Medium"],
  [3, "Structured Markup & Lists", "HTML Tables for Comparisons", 3.26, "High"],
  [4, "Structured Markup & Lists", "Table Captions", 2.17, "Medium"],
  [5, "Structured Markup & Lists", "<blockquote>+<cite> for Quotes", 1.63, "Low"],
  [6, "Content Signals & Clarity", "<dfn> for Key Term Definitions", 1.63, "Low"],
  [7, "Content Signals & Clarity", "<time datetime> on Dates", 1.63, "Low"],
  [8, "Headings & Titles", "Breadcrumb Schema-DOM Match", 2.17, "High"],
  [9, "Structured Markup & Lists", "See Also Semantic Paths", 2.17, "Medium"],
  [10, "Internal Linking", "Contextual Internal Links", 2.72, "Medium"],
  [11, "Image & Media Optimisation", "Alt Text Non-Empty", 2.72, "High"],
  [12, "Headings & Titles", "Heading Capitalization Consistent", 1.63, "Low"],
  [13, "Headings & Titles", "H1 Length 20-70 Characters", 2.17, "Medium"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const CATEGORY_ORDER = [...new Set(CHECKS.map((check) => check.category))];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "AIVisibilityAnalyzer/1.0" }
    });
    return response.ok ? response.text() : "";
  } catch {
    return "";
  }
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/&nbsp;/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function compact(value: string) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function result(def: CheckDefinition, state: { passed?: boolean; skipped?: boolean; evidence?: Record<string, unknown> }): OnPageSeoCheckResult {
  const skipped = Boolean(state.skipped);
  const passed = skipped ? true : Boolean(state.passed);
  return {
    ...def,
    passed,
    skipped,
    warning: false,
    score: skipped ? 0 : passed ? def.weight : 0,
    evidence: state.evidence ?? {}
  };
}

function summarize(checks: OnPageSeoCheckResult[]): OnPageSeoCategorySummary[] {
  return CATEGORY_ORDER.map((categoryName) => {
    const categoryChecks = checks.filter((check) => check.category === categoryName);
    const scorable = categoryChecks.filter((check) => !check.skipped);
    const failed = scorable.filter((check) => !check.passed);
    const skippedChecks = categoryChecks.filter((check) => check.skipped).length;
    const score = scorable.length
      ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100)
      : 100;
    const status: TechnicalCategoryStatus = scorable.length === 0 ? "Skipped" : failed.length === 0 ? "Passed" : failed.length <= 1 ? "Minor Attention" : "Needs Attention";
    return {
      categoryName,
      totalChecks: categoryChecks.length,
      passedChecks: scorable.filter((check) => check.passed).length,
      failedChecks: failed.length,
      warningChecks: 0,
      skippedChecks,
      score,
      status
    };
  });
}

function headingHierarchy($: cheerio.CheerioAPI) {
  const levels = $("h1,h2,h3,h4,h5,h6").toArray().map((el) => Number(el.tagName.slice(1)));
  const skips: Array<{ from: number; to: number; index: number }> = [];
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) skips.push({ from: levels[index - 1], to: levels[index], index });
  }
  return { levels, skips };
}

function headingCase(value: string) {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (!words.length) return "unknown";
  const titleWords = words.filter((word) => /^[A-Z][a-z0-9]+/.test(word)).length;
  const sentence = /^[A-Z]/.test(value.trim()) && words.slice(1).filter((word) => /^[a-z0-9]/.test(word)).length >= Math.max(1, words.length - 2);
  if (titleWords / words.length >= 0.65) return "title";
  if (sentence) return "sentence";
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) return "upper";
  return "mixed";
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const flatten = (value: unknown): Record<string, unknown>[] => {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(flatten);
    const record = value as Record<string, unknown>;
    return [record, ...flatten(record["@graph"])];
  };
  return $("script[type='application/ld+json']").toArray().flatMap((el) => {
    try {
      return flatten(JSON.parse($(el).text()));
    } catch {
      return [];
    }
  });
}

function schemaTypes(record: Record<string, unknown>) {
  const type = record["@type"];
  return (Array.isArray(type) ? type : type ? [type] : []).map(String);
}

function breadcrumbSchemaNames(records: Record<string, unknown>[]) {
  const breadcrumb = records.find((record) => schemaTypes(record).some((type) => type === "BreadcrumbList"));
  const items = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement : [];
  return items.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const nested = record.item && typeof record.item === "object" ? record.item as Record<string, unknown> : {};
    return String(record.name ?? nested.name ?? "").trim();
  }).filter(Boolean);
}

function domBreadcrumbNames($: cheerio.CheerioAPI) {
  const selectors = [
    "nav[aria-label*='breadcrumb' i] a, nav[aria-label*='breadcrumb' i] span",
    "[class*='breadcrumb' i] a, [class*='breadcrumb' i] span",
    "[id*='breadcrumb' i] a, [id*='breadcrumb' i] span"
  ];
  return selectors.flatMap((selector) => $(selector).toArray().map((el) => $(el).text().replace(/\s+/g, " ").trim())).filter(Boolean);
}

function hasDefinitionPattern(text: string) {
  return /\b[A-Z][A-Za-z0-9 -]{2,}\s+(?:is|are|means|refers to|is defined as)\b/.test(text);
}

function hasComparisonIntent($: cheerio.CheerioAPI, body: string) {
  return $("table").length > 0 || /\b(compare|comparison|versus| vs\.? |features|pricing|plans|pros and cons)\b/i.test(body);
}

function isSeeAlsoLinkText(value: string) {
  return /\b(see also|related|learn more|next|recommended|further reading|resources)\b/i.test(value);
}

export async function runOnPageSeoAudit(inputUrl: string, html?: string): Promise<OnPageSeoAuditResult> {
  const normalized = normalizeUrl(inputUrl);
  const url = new URL(normalized);
  const pageHtml = html ?? await fetchHtml(normalized);
  const $ = cheerio.load(pageHtml);
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const headings = $("h1,h2,h3,h4,h5,h6").toArray().map((el) => $(el).text().replace(/\s+/g, " ").trim()).filter(Boolean);
  const h1Text = $("h1").first().text().replace(/\s+/g, " ").trim();
  const hierarchy = headingHierarchy($);
  const boldPhrases = $("strong,b").toArray().map((el) => $(el).text().replace(/\s+/g, " ").trim()).filter(Boolean);
  const totalWords = wordCount(body);
  const boldWords = boldPhrases.reduce((sum, phrase) => sum + wordCount(phrase), 0);
  const boldDensity = totalWords ? (boldWords / totalWords) * 100 : 0;
  const maxBoldDensity = totalWords < 250 ? 15 : 8;
  const qualityBold = boldPhrases.filter((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    return words.length <= 6 && (/[A-Z][a-z]+/.test(phrase) || /\b[A-Z]{2,}\b/.test(phrase) || /\b(?:service|product|platform|brand|company|software|audit|seo|ai)\b/i.test(phrase));
  }).length;
  const boldQualityRatio = boldPhrases.length ? qualityBold / boldPhrases.length : 0;
  const tables = $("table").toArray();
  const comparisonTables = tables.filter((table) => /\b(compare|comparison|feature|price|plan|versus|vs|pros|cons)\b/i.test($(table).text()));
  const blockquotes = $("blockquote").toArray();
  const blockquotesWithCite = blockquotes.filter((quote) => $(quote).find("cite").length > 0 || $(quote).next("cite").length > 0);
  const dfnCount = $("dfn").filter((_, el) => $(el).text().trim().length > 0).length;
  const dateTextCount = (body.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []).length;
  const timeDatetimeCount = $("time[datetime]").filter((_, el) => Boolean($(el).attr("datetime")?.trim())).length;
  const records = parseJsonLd($);
  const schemaBreadcrumbs = breadcrumbSchemaNames(records);
  const domBreadcrumbs = domBreadcrumbNames($);
  const schemaBreadcrumbText = schemaBreadcrumbs.map(compact).join(" > ");
  const domBreadcrumbText = domBreadcrumbs.map(compact).join(" > ");
  const seeAlsoLinks = $("section,article,main,aside,footer").toArray().flatMap((section) =>
    $(section).find("a[href]").toArray().filter((link) => isSeeAlsoLinkText($(link).text()) || isSeeAlsoLinkText($(link).parent().text()))
  );
  const paragraphLinks = $("main p a[href],article p a[href],body p a[href]").toArray().map((el) => {
    try {
      return new URL($(el).attr("href") ?? "", url).toString();
    } catch {
      return "";
    }
  }).filter((href) => {
    try {
      if (!href) return false;
      const parsed = new URL(href);
      return parsed.hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, "");
    } catch {
      return false;
    }
  });
  const images = $("img").toArray();
  const imagesMissingAlt = images.filter((img) => !($(img).attr("alt") ?? "").trim());
  const headingCases = headings.map(headingCase).filter((item) => item !== "unknown");
  const dominantCase = headingCases.reduce((best, current) => headingCases.filter((item) => item === current).length > headingCases.filter((item) => item === best).length ? current : best, headingCases[0] ?? "unknown");
  const caseConsistency = headingCases.length ? headingCases.filter((item) => item === dominantCase).length / headingCases.length : 1;
  const checks: OnPageSeoCheckResult[] = [];
  const add = (id: number, state: Parameters<typeof result>[1]) => {
    const def = CHECKS.find((check) => check.id === id);
    if (def) checks.push(result(def, state));
  };

  add(1, { passed: hierarchy.levels.length > 0 && hierarchy.skips.length === 0, evidence: { headingLevels: hierarchy.levels, skips: hierarchy.skips } });
  add(2, {
    passed: boldPhrases.length > 0 && boldDensity >= 0.5 && boldDensity <= maxBoldDensity && boldQualityRatio >= 0.6,
    evidence: { boldPhrases: boldPhrases.length, boldDensity: Number(boldDensity.toFixed(2)), maxBoldDensity, qualityRatio: Number(boldQualityRatio.toFixed(2)), sample: boldPhrases.slice(0, 8) }
  });
  add(3, {
    passed: !hasComparisonIntent($, body) || comparisonTables.length > 0,
    evidence: { comparisonIntent: hasComparisonIntent($, body), tables: tables.length, comparisonTables: comparisonTables.length }
  });
  add(4, {
    passed: tables.length > 0 && tables.every((table) => $(table).find("caption").first().text().trim().length > 0),
    skipped: tables.length === 0,
    evidence: { tables: tables.length, captions: $("table caption").length }
  });
  add(5, {
    passed: blockquotes.length > 0 && blockquotesWithCite.length === blockquotes.length,
    skipped: blockquotes.length === 0 && !/[“”"']/.test(body),
    evidence: { blockquotes: blockquotes.length, blockquotesWithCite: blockquotesWithCite.length }
  });
  add(6, {
    passed: dfnCount > 0,
    skipped: !hasDefinitionPattern(body),
    evidence: { dfnCount, definitionPatternDetected: hasDefinitionPattern(body) }
  });
  add(7, {
    passed: dateTextCount === 0 || timeDatetimeCount >= dateTextCount,
    evidence: { dateTextCount, timeDatetimeCount }
  });
  add(8, {
    passed: schemaBreadcrumbs.length === 0 || (domBreadcrumbs.length > 0 && (domBreadcrumbText.includes(schemaBreadcrumbText) || schemaBreadcrumbText.includes(domBreadcrumbText))),
    skipped: schemaBreadcrumbs.length === 0 && domBreadcrumbs.length === 0,
    evidence: { schemaBreadcrumbs, domBreadcrumbs }
  });
  add(9, {
    passed: seeAlsoLinks.length > 0,
    evidence: { seeAlsoLinks: seeAlsoLinks.length }
  });
  add(10, {
    passed: paragraphLinks.length >= 2,
    evidence: { contextualInternalLinks: paragraphLinks.length, sampleUrls: paragraphLinks.slice(0, 8) }
  });
  add(11, {
    passed: images.length === 0 || imagesMissingAlt.length === 0,
    evidence: { images: images.length, missingAlt: imagesMissingAlt.length }
  });
  add(12, {
    passed: headingCases.length <= 1 || caseConsistency >= 0.8,
    evidence: { headingCases, dominantCase, consistency: Number(caseConsistency.toFixed(2)) }
  });
  add(13, {
    passed: h1Text.length >= 20 && h1Text.length <= 70,
    evidence: { h1: h1Text, length: h1Text.length }
  });

  const categories = summarize(checks);
  const scorable = checks.filter((check) => !check.skipped);
  const score = scorable.length
    ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100)
    : 100;
  return { score, checkedAt: new Date().toISOString(), categories, checks };
}
