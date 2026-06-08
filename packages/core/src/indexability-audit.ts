import * as cheerio from "cheerio";
import { fetchSitemapUrls } from "./site-crawler.js";

export type IndexabilitySeverity = "Critical" | "High" | "Medium" | "Low";
export type IndexabilityStatus = "Passed" | "Minor Attention" | "Needs Attention" | "Skipped";

export interface IndexabilityCheckDefinition {
  id: number;
  category: string;
  name: string;
  severity: IndexabilitySeverity;
  maxScore: number;
}

export interface IndexabilityCheckResult extends IndexabilityCheckDefinition {
  passed: boolean;
  skipped: boolean;
  score: number;
  evidence: Record<string, unknown>;
}

export interface IndexabilityCategorySummary {
  categoryName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  skippedChecks: number;
  score: number;
  status: IndexabilityStatus;
}

export interface IndexabilityAuditResult {
  score: number;
  checkedAt: string;
  categories: IndexabilityCategorySummary[];
  checks: IndexabilityCheckResult[];
}

const CHECKS: IndexabilityCheckDefinition[] = [
  { id: 1, category: "Index Status", name: "No noindex Anywhere", severity: "Critical", maxScore: 10 },
  { id: 2, category: "Index Status", name: "Google Index Verified", severity: "Critical", maxScore: 10 },
  { id: 3, category: "Index Status", name: "Bing Index Verified", severity: "Critical", maxScore: 10 },
  { id: 4, category: "Index Status", name: "GSC Coverage Zero Errors", severity: "High", maxScore: 8 },
  { id: 5, category: "Index Status", name: "Canonical Not -> Noindex", severity: "Critical", maxScore: 10 },
  { id: 6, category: "Index Status", name: "No noindex in Sitemap", severity: "High", maxScore: 8 },
  { id: 7, category: "Canonicalization", name: "Self-Referencing Canonical", severity: "Critical", maxScore: 10 },
  { id: 8, category: "Canonicalization", name: "Canonical Absolute HTTPS", severity: "High", maxScore: 8 },
  { id: 9, category: "Canonicalization", name: "Canonical Target Returns 200", severity: "Critical", maxScore: 10 },
  { id: 10, category: "Canonicalization", name: "No Canonical Chains", severity: "High", maxScore: 8 },
  { id: 11, category: "Canonicalization", name: "No HTTP Header Canonical Conflict", severity: "High", maxScore: 8 },
  { id: 12, category: "Snippet Controls", name: "No nosnippet on Key Pages", severity: "Critical", maxScore: 10 },
  { id: 13, category: "Snippet Controls", name: "No max-snippet:0 / Low", severity: "Critical", maxScore: 10 },
  { id: 14, category: "Snippet Controls", name: "No data-nosnippet Key Content", severity: "High", maxScore: 8 },
  { id: 15, category: "Snippet Controls", name: "No max-image-preview:none", severity: "Low", maxScore: 4 },
  { id: 16, category: "URL & Redirect Management", name: "HTTP->HTTPS No Dual Serving", severity: "Critical", maxScore: 10 },
  { id: 17, category: "URL & Redirect Management", name: "WWW/Non-WWW Handled", severity: "Critical", maxScore: 10 },
  { id: 18, category: "URL & Redirect Management", name: "Parameter URL Managed", severity: "High", maxScore: 8 },
  { id: 19, category: "International & Pagination", name: "Pagination rel=next/prev", severity: "Low", maxScore: 4 },
  { id: 20, category: "International & Pagination", name: "Hreflang Correct", severity: "High", maxScore: 8 },
  { id: 21, category: "Access & Gating", name: "No Login/Paywall Gate", severity: "Critical", maxScore: 10 },
  { id: 22, category: "Access & Gating", name: "No Consent Wall Blocking", severity: "Critical", maxScore: 10 },
  { id: 23, category: "Access & Gating", name: "No Back-Button Hijack", severity: "Critical", maxScore: 10 },
  { id: 24, category: "Rendering & Content Access", name: "CSS Hidden <100 Words", severity: "High", maxScore: 8 },
  { id: 25, category: "Rendering & Content Access", name: "No Soft-404s", severity: "High", maxScore: 8 },
  { id: 26, category: "Rendering & Content Access", name: "No Infinite Scroll Dependency", severity: "High", maxScore: 8 }
];

const CATEGORY_ORDER = [
  "Index Status",
  "Canonicalization",
  "Snippet Controls",
  "URL & Redirect Management",
  "International & Pagination",
  "Access & Gating",
  "Rendering & Content Access"
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeUrl(value: string) {
  const withProtocol = value.startsWith("http") ? value : `https://${value}`;
  return new URL(withProtocol).toString();
}

async function fetchText(url: string, timeoutMs = 8000, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: init?.redirect ?? "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AIVisibilityAnalyzer/1.0",
        accept: "text/html,application/xhtml+xml,text/plain,*/*",
        ...(init?.headers ?? {})
      }
    });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function robotsDirectives(html: string, response?: Response | null) {
  const $ = cheerio.load(html);
  const meta = $("meta[name='robots' i],meta[name='googlebot' i],meta[name='bingbot' i]")
    .toArray()
    .map((el) => $(el).attr("content") ?? "")
    .join(",");
  const header = response?.headers.get("x-robots-tag") ?? "";
  return `${meta},${header}`;
}

function noindexFoundIn(html: string, response?: Response | null) {
  return /(^|,|\s)noindex(,|\s|$)/i.test(robotsDirectives(html, response));
}

function canonicalHref(html: string, baseUrl: string, response?: Response | null) {
  const $ = cheerio.load(html);
  const htmlCanonical = $("link[rel='canonical' i]").first().attr("href") ?? "";
  const headerCanonical = response?.headers.get("link")?.match(/<([^>]+)>;\s*rel=["']canonical["']/i)?.[1] ?? "";
  const value = htmlCanonical || headerCanonical;
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

function maxSnippetValue(html: string, response?: Response | null) {
  const match = robotsDirectives(html, response).match(/max-snippet\s*:\s*(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

function maxImagePreviewValue(html: string, response?: Response | null) {
  return robotsDirectives(html, response).match(/max-image-preview\s*:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? "";
}

function dataNosnippetEvidence($: cheerio.CheerioAPI) {
  const affectedElements = $("[data-nosnippet]")
    .toArray()
    .map((el) => ({ tag: el.tagName?.toLowerCase() ?? "element", words: wordCount($(el).text()) }))
    .filter((item) => item.words > 50);
  return { pass: affectedElements.length === 0, count: $("[data-nosnippet]").length, affectedElements };
}

async function httpToHttpsEvidence(url: URL) {
  if (url.protocol === "http:") return { pass: false, reason: "Audited URL is HTTP" };
  const httpUrl = new URL(url.toString());
  httpUrl.protocol = "http:";
  const result = await fetchText(httpUrl.toString(), 5000, { redirect: "manual" }).catch(() => null);
  const location = result?.response.headers.get("location") ?? "";
  return {
    pass: Boolean(result && [301, 302, 307, 308].includes(result.response.status) && /^https:/i.test(location)),
    status: result?.response.status ?? 0,
    location
  };
}

async function wwwVariantEvidence(url: URL) {
  const alternate = new URL(url.toString());
  alternate.hostname = url.hostname.startsWith("www.") ? url.hostname.replace(/^www\./, "") : `www.${url.hostname}`;
  const result = await fetchText(alternate.toString(), 5000, { redirect: "manual" }).catch(() => null);
  const location = result?.response.headers.get("location") ?? "";
  const pass = !result || [301, 302, 307, 308, 404, 410].includes(result.response.status) || comparableUrl(location) === comparableUrl(url.toString());
  return { pass, alternate: alternate.toString(), status: result?.response.status ?? 0, location };
}

function parameterUrlEvidence(url: URL, canonicalUrl: string) {
  const trapParams = ["sort", "filter", "color", "size", "page", "q", "s"];
  const present = trapParams.filter((param) => url.searchParams.has(param));
  if (!present.length) return { pass: true, parameterUrlsFound: 0, canonicalized: 0, params: [] };
  const canonicalClean = canonicalUrl ? new URL(canonicalUrl).searchParams.size === 0 : false;
  return { pass: canonicalClean, parameterUrlsFound: present.length, canonicalized: canonicalClean ? present.length : 0, params: present, canonicalUrl };
}

function paginationEvidence($: cheerio.CheerioAPI, canonicalUrl: string) {
  const paginationDetected = $("a[href*='page='],a[href*='/page/'],link[rel='next' i],link[rel='prev' i]").length > 0;
  if (!paginationDetected) return { skipped: true, reason: "Pagination not detected" };
  const next = $("link[rel='next' i]").attr("href") ?? "";
  const prev = $("link[rel='prev' i]").attr("href") ?? "";
  return { pass: Boolean(next || prev || canonicalUrl), paginationDetected, next, prev, canonicalUrl };
}

function hreflangEvidence($: cheerio.CheerioAPI) {
  const alternates = $("link[rel='alternate' i][hreflang]").toArray();
  if (!alternates.length) return { skipped: true, reason: "Multilingual hreflang not detected" };
  const values = alternates.map((el) => ($(el).attr("hreflang") ?? "").toLowerCase()).filter(Boolean);
  const hrefs = alternates.map((el) => $(el).attr("href") ?? "").filter(Boolean);
  const hasXDefault = values.includes("x-default");
  const malformed = values.filter((value) => value !== "x-default" && !/^[a-z]{2}(-[a-z]{2})?$/i.test(value));
  return { pass: hrefs.length === values.length && malformed.length === 0, count: values.length, hasXDefault, malformed };
}

function gatingEvidence($: cheerio.CheerioAPI, bodyText: string) {
  const gatePattern = /\b(login|sign in|subscribe|paywall|members only|create an account|restricted access)\b/i;
  const formCount = $("input[type='password'],form[action*='login' i],form[action*='signin' i]").length;
  const words = wordCount(bodyText);
  return { pass: !(gatePattern.test(bodyText) && words < 250) && formCount === 0, words, formCount, gateTextDetected: gatePattern.test(bodyText) };
}

function consentEvidence($: cheerio.CheerioAPI, bodyText: string) {
  const overlays = $("[class*='cookie' i],[class*='consent' i],[id*='cookie' i],[id*='consent' i],[class*='gdpr' i]").length;
  return { pass: overlays === 0 || wordCount(bodyText) >= 100, overlays, rawWordCount: wordCount(bodyText) };
}

function backButtonHijackEvidence(html: string) {
  const scriptsFound = (html.match(/history\.(?:pushState|replaceState)|onpopstate/gi) ?? []);
  const loopSignals = (html.match(/setInterval\s*\([^)]*history\.|while\s*\([^)]*\)\s*{[^}]*history\./gi) ?? []);
  return { pass: scriptsFound.length === 0 || loopSignals.length === 0, scriptsFound: [...new Set(scriptsFound)], loopSignals };
}

function hiddenContentEvidence($: cheerio.CheerioAPI) {
  const excluded = "nav,header,footer,[role='navigation'],[aria-modal='true'],[class*='modal' i],[class*='menu' i],[class*='accordion' i],[class*='tab' i]";
  let hiddenWords = 0;
  $("[hidden],[style*='display:none' i],[style*='visibility:hidden' i],[style*='opacity:0' i]").each((_, el) => {
    if ($(el).closest(excluded).length) return;
    hiddenWords += wordCount($(el).text());
  });
  return { pass: hiddenWords < 100, hiddenWords, threshold: 100 };
}

async function soft404Evidence(url: URL) {
  const samples = ["/random-url-123456789-test/", "/nonexistent-page-seo-audit-test/"];
  const results = await Promise.all(samples.map(async (path) => {
    const target = new URL(path, url.origin).toString();
    const result = await fetchText(target, 5000).catch(() => null);
    return { url: target, status: result?.response.status ?? 0, words: wordCount(cheerio.load(result?.text ?? "")("body").text()) };
  }));
  return { pass: results.every((result) => result.status === 404 || result.status === 410), results };
}

function infiniteScrollEvidence(html: string, $: cheerio.CheerioAPI, pagination: { skipped?: boolean; pass?: boolean }) {
  const hasInfiniteSignal = /infinite[-_\s]?scroll|IntersectionObserver|loadMore|load-more/i.test(html);
  const hasPagination = !pagination.skipped || $("a[href*='page='],a[href*='/page/']").length > 0;
  return { pass: !hasInfiniteSignal || hasPagination, infiniteScrollDetected: hasInfiniteSignal, paginationDetected: hasPagination };
}

async function searchIndexEvidence(engine: "google" | "bing", hostname: string) {
  const envKey = engine === "google" ? "GSC_ACCESS_TOKEN" : "BING_WEBMASTER_API_KEY";
  if (process.env[envKey]) return { skipped: true, reason: `${envKey} configured but API integration is not implemented in this audit runtime` };
  const searchUrl = engine === "google"
    ? `https://www.google.com/search?q=site:${encodeURIComponent(hostname)}`
    : `https://www.bing.com/search?q=site:${encodeURIComponent(hostname)}`;
  const result = await fetchText(searchUrl, 6000).catch(() => null);
  if (!result || result.response.status >= 400) return { skipped: true, reason: `${engine} site: validation unavailable`, status: result?.response.status ?? 0 };
  const body = result.text.toLowerCase();
  return { pass: body.includes(hostname.toLowerCase()) && !/did not match any documents|no results/i.test(result.text), method: "site_operator", status: result.response.status };
}

function gscCoverageEvidence() {
  if (!process.env.GSC_ACCESS_TOKEN) return { skipped: true, reason: "Search Console not connected" };
  return { skipped: true, reason: "Search Console coverage API integration pending" };
}

function categorySummaries(checks: IndexabilityCheckResult[]): IndexabilityCategorySummary[] {
  return CATEGORY_ORDER.map((categoryName) => {
    const categoryChecks = checks.filter((check) => check.category === categoryName);
    const scorable = categoryChecks.filter((check) => !check.skipped);
    const failed = scorable.filter((check) => !check.passed);
    const skippedChecks = categoryChecks.filter((check) => check.skipped).length;
    const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.maxScore, 0)) * 100) : 0;
    const status: IndexabilityStatus = scorable.length === 0 && skippedChecks > 0
      ? "Skipped"
      : failed.length === 0
        ? "Passed"
        : failed.some((check) => check.severity === "Critical" || check.severity === "High")
          ? "Needs Attention"
          : "Minor Attention";
    return {
      categoryName,
      totalChecks: categoryChecks.length,
      passedChecks: scorable.length - failed.length,
      failedChecks: failed.length,
      warningChecks: failed.filter((check) => check.severity === "Low").length,
      skippedChecks,
      score,
      status
    };
  }).filter((category) => category.totalChecks > 0);
}

function resultFor(id: number, evidence: Record<string, unknown>): IndexabilityCheckResult {
  const definition = CHECKS.find((check) => check.id === id);
  if (!definition) throw new Error(`Unknown indexability check ${id}`);
  const skipped = Boolean(evidence.skipped);
  const passed = skipped ? true : Boolean(evidence.pass);
  return { ...definition, passed, skipped, score: skipped ? 0 : passed ? definition.maxScore : 0, evidence };
}

export async function runIndexabilityAudit(inputUrl: string, html?: string): Promise<IndexabilityAuditResult> {
  const normalizedUrl = normalizeUrl(inputUrl);
  const url = new URL(normalizedUrl);
  const serverPage = html ? { text: html, response: null as Response | null } : await fetchText(normalizedUrl).catch(() => ({ text: "", response: null as Response | null }));
  const pageHtml = serverPage.text;
  const $ = cheerio.load(pageHtml);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const canonicalUrl = canonicalHref(pageHtml, normalizedUrl, serverPage.response);
  const canonicalTarget = canonicalUrl ? await fetchText(canonicalUrl, 5000).catch(() => null) : null;
  const secondCanonicalUrl = canonicalTarget ? canonicalHref(canonicalTarget.text, canonicalUrl, canonicalTarget.response) : "";
  const sitemapUrls = await fetchSitemapUrls(url.origin, 10000, 100).then((result) => result.urls.slice(0, 100)).catch(() => []);
  const sitemapSamples = await Promise.all(sitemapUrls.slice(0, 100).map(async (sampleUrl) => {
    const page = await fetchText(sampleUrl, 3000).catch(() => null);
    const sampleCanonical = page ? canonicalHref(page.text, sampleUrl, page.response) : "";
    const canonicalPage = sampleCanonical ? await fetchText(sampleCanonical, 2500).catch(() => null) : null;
    return {
      url: sampleUrl,
      noindex: Boolean(page && noindexFoundIn(page.text, page.response)),
      canonicalNoindex: Boolean(canonicalPage && noindexFoundIn(canonicalPage.text, canonicalPage.response))
    };
  }));
  const pagination = paginationEvidence($, canonicalUrl);
  const googleIndex = await searchIndexEvidence("google", url.hostname);
  const bingIndex = await searchIndexEvidence("bing", url.hostname);
  const soft404 = await soft404Evidence(url);
  const httpHttps = await httpToHttpsEvidence(url);
  const wwwVariant = await wwwVariantEvidence(url);
  const checks = [
    resultFor(1, { pass: !noindexFoundIn(pageHtml, serverPage.response), directives: robotsDirectives(pageHtml, serverPage.response) }),
    resultFor(2, googleIndex),
    resultFor(3, bingIndex),
    resultFor(4, gscCoverageEvidence()),
    resultFor(5, { pass: !canonicalTarget || !noindexFoundIn(canonicalTarget.text, canonicalTarget.response), canonicalUrl, targetNoindex: Boolean(canonicalTarget && noindexFoundIn(canonicalTarget.text, canonicalTarget.response)) }),
    resultFor(6, { pass: sitemapSamples.every((sample) => !sample.noindex && !sample.canonicalNoindex), checked: sitemapSamples.length, noindexedUrls: sitemapSamples.filter((sample) => sample.noindex || sample.canonicalNoindex).slice(0, 10) }),
    resultFor(7, { pass: Boolean(canonicalUrl && comparableUrl(canonicalUrl) === comparableUrl(normalizedUrl)), canonicalUrl, pageUrl: normalizedUrl }),
    resultFor(8, { pass: /^https:\/\//i.test(canonicalUrl), canonicalUrl }),
    resultFor(9, { pass: canonicalTarget?.response.status === 200, canonicalUrl, status: canonicalTarget?.response.status ?? 0 }),
    resultFor(10, { pass: !canonicalUrl || !secondCanonicalUrl || comparableUrl(secondCanonicalUrl) === comparableUrl(canonicalUrl), chain: [normalizedUrl, canonicalUrl, secondCanonicalUrl].filter(Boolean), maxDepth: 1 }),
    resultFor(11, { pass: !serverPage.response?.headers.get("link") || !canonicalUrl || comparableUrl(canonicalUrl) === comparableUrl(canonicalHref(pageHtml, normalizedUrl)), headerCanonical: serverPage.response?.headers.get("link") ?? "" }),
    resultFor(12, { pass: !/nosnippet/i.test(robotsDirectives(pageHtml, serverPage.response)), directives: robotsDirectives(pageHtml, serverPage.response) }),
    resultFor(13, { pass: maxSnippetValue(pageHtml, serverPage.response) === null || maxSnippetValue(pageHtml, serverPage.response) === -1 || (maxSnippetValue(pageHtml, serverPage.response) ?? 0) >= 50, value: maxSnippetValue(pageHtml, serverPage.response), lowThreshold: 50 }),
    resultFor(14, dataNosnippetEvidence($)),
    resultFor(15, { pass: maxImagePreviewValue(pageHtml, serverPage.response) !== "none", value: maxImagePreviewValue(pageHtml, serverPage.response) || "default" }),
    resultFor(16, httpHttps),
    resultFor(17, wwwVariant),
    resultFor(18, parameterUrlEvidence(url, canonicalUrl)),
    resultFor(19, pagination),
    resultFor(20, hreflangEvidence($)),
    resultFor(21, gatingEvidence($, bodyText)),
    resultFor(22, consentEvidence($, bodyText)),
    resultFor(23, backButtonHijackEvidence(pageHtml)),
    resultFor(24, hiddenContentEvidence($)),
    resultFor(25, soft404),
    resultFor(26, infiniteScrollEvidence(pageHtml, $, pagination))
  ];
  const categories = categorySummaries(checks);
  const scorable = checks.filter((check) => !check.skipped);
  const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.maxScore, 0)) * 100) : 0;
  return { score, checkedAt: new Date().toISOString(), categories, checks };
}
