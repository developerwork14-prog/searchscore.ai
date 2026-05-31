import * as cheerio from "cheerio";
import { crawlSite } from "./site-crawler.js";

export type GeoAeoSeverity = "BLOCKER" | "MAJOR" | "MINOR";
export type GeoAeoScope = "page" | "domain";
export type GeoAeoGrade = "A" | "B" | "C" | "D" | "F";
export type GeoAeoStatus = "Passed" | "Minor Attention" | "Needs Attention";

export interface GeoAeoCheckDefinition {
  id: number;
  category: string;
  name: string;
  severity: GeoAeoSeverity;
  scope: GeoAeoScope;
}

export interface GeoAeoCheckResult extends GeoAeoCheckDefinition {
  passed: boolean;
  evidence: string;
}

export interface GeoAeoCategorySummary {
  categoryName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  score: number;
  status: GeoAeoStatus;
}

export interface GeoAeoOpportunityCounts {
  high: number;
  medium: number;
  low: number;
}

export interface GeoAeoAuditResult {
  score: number;
  rawScore: number;
  pageScore: number;
  domainScore: number;
  grade: GeoAeoGrade;
  gradeDescription: string;
  blockerFailed: boolean;
  opportunityCounts: GeoAeoOpportunityCounts;
  checkedAt: string;
  categories: GeoAeoCategorySummary[];
  checks: GeoAeoCheckResult[];
}

const CHECKS: GeoAeoCheckDefinition[] = [
  { id: 1, category: "AI Bot Access", name: "GPTBot allowed", severity: "BLOCKER", scope: "domain" },
  { id: 2, category: "AI Bot Access", name: "ClaudeBot allowed", severity: "BLOCKER", scope: "domain" },
  { id: 3, category: "AI Bot Access", name: "PerplexityBot allowed", severity: "BLOCKER", scope: "domain" },
  { id: 4, category: "AI Bot Access", name: "Google-Extended allowed", severity: "BLOCKER", scope: "domain" },
  { id: 5, category: "AI Bot Access", name: "OAI-SearchBot allowed", severity: "BLOCKER", scope: "domain" },
  { id: 6, category: "AI Bot Access", name: "Grok allowed", severity: "BLOCKER", scope: "domain" },
  { id: 7, category: "AI Bot Access", name: "DeepSeek allowed", severity: "BLOCKER", scope: "domain" },
  { id: 8, category: "AI Readiness", name: "llms.txt exists", severity: "MAJOR", scope: "domain" },
  { id: 9, category: "AI Readiness", name: "llms.txt markdown format", severity: "MAJOR", scope: "domain" },
  { id: 10, category: "AI Readiness", name: "llms.txt word count", severity: "MAJOR", scope: "domain" },
  { id: 11, category: "AI Readiness", name: "llms.txt content completeness", severity: "MAJOR", scope: "domain" },
  { id: 12, category: "Entity & Trust Signals", name: "Organization sameAs depth", severity: "MAJOR", scope: "domain" },
  { id: 13, category: "Entity & Trust Signals", name: "LinkedIn present in sameAs", severity: "MAJOR", scope: "domain" },
  { id: 14, category: "Entity & Trust Signals", name: "Crunchbase or Wikidata present", severity: "MAJOR", scope: "domain" },
  { id: 15, category: "Entity & Trust Signals", name: "NAP schema-DOM match", severity: "BLOCKER", scope: "domain" },
  { id: 16, category: "Entity & Trust Signals", name: "Schema-DOM consistency", severity: "BLOCKER", scope: "page" },
  { id: 17, category: "FAQ & Answer Optimization", name: "FAQ section exists", severity: "MAJOR", scope: "page" },
  { id: 18, category: "FAQ & Answer Optimization", name: "FAQPage schema exists", severity: "MAJOR", scope: "page" },
  { id: 19, category: "FAQ & Answer Optimization", name: "FAQ schema completeness", severity: "MAJOR", scope: "page" },
  { id: 20, category: "FAQ & Answer Optimization", name: "BLUF detection", severity: "MAJOR", scope: "page" },
  { id: 21, category: "FAQ & Answer Optimization", name: "Question-based content structure", severity: "MAJOR", scope: "page" },
  { id: 22, category: "Content Authority", name: "Author byline quality", severity: "MINOR", scope: "page" },
  { id: 23, category: "Content Authority", name: "Author bio quality", severity: "MINOR", scope: "page" },
  { id: 24, category: "Content Authority", name: "Credentials/certifications", severity: "MINOR", scope: "page" },
  { id: 25, category: "Content Authority", name: "First-hand experience language", severity: "MINOR", scope: "page" },
  { id: 26, category: "Content Authority", name: "Last updated visible", severity: "MINOR", scope: "page" },
  { id: 27, category: "Content Authority", name: "Outbound authority links", severity: "MINOR", scope: "page" },
  { id: 28, category: "Local GEO Signals", name: "Local entity schema", severity: "MAJOR", scope: "domain" },
  { id: 29, category: "Local GEO Signals", name: "geo.latitude", severity: "MAJOR", scope: "domain" },
  { id: 30, category: "Local GEO Signals", name: "geo.longitude", severity: "MAJOR", scope: "domain" },
  { id: 31, category: "Local GEO Signals", name: "areaServed", severity: "MAJOR", scope: "domain" },
  { id: 32, category: "AI Crawlability", name: "JS-rendered content available in raw HTML", severity: "BLOCKER", scope: "page" },
  { id: 33, category: "AI Crawlability", name: "Hidden content under threshold", severity: "MAJOR", scope: "page" },
  { id: 34, category: "AI Crawlability", name: "Data point density", severity: "MAJOR", scope: "page" },
  { id: 35, category: "Structured Data Integrity", name: "FAQ schema-DOM match", severity: "BLOCKER", scope: "page" },
  { id: 36, category: "Structured Data Integrity", name: "Product schema-DOM match", severity: "BLOCKER", scope: "page" },
  { id: 37, category: "Structured Data Integrity", name: "Schema consistency validation", severity: "BLOCKER", scope: "page" }
];

const CATEGORY_ORDER = [
  "AI Bot Access",
  "AI Readiness",
  "Entity & Trust Signals",
  "FAQ & Answer Optimization",
  "Content Authority",
  "Local GEO Signals",
  "AI Crawlability",
  "Structured Data Integrity"
];

const CATEGORY_WEIGHTS: Record<string, number> = {
  "AI Bot Access": 20,
  "AI Readiness": 10,
  "Entity & Trust Signals": 20,
  "FAQ & Answer Optimization": 15,
  "Content Authority": 10,
  "Local GEO Signals": 15,
  "AI Crawlability": 5,
  "Structured Data Integrity": 5
};

function weightedCategoryScore(categories: GeoAeoCategorySummary[]) {
  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);

  const weighted = categories.reduce((sum, category) => {
    const weight = CATEGORY_WEIGHTS[category.categoryName] ?? 0;
    return sum + category.score * weight;
  }, 0);

  return clamp(weighted / totalWeight);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function statusFor(failedChecks: number): GeoAeoStatus {
  if (failedChecks === 0) return "Passed";
  if (failedChecks <= 2) return "Minor Attention";
  return "Needs Attention";
}

function gradeFor(score: number): { grade: GeoAeoGrade; description: string } {
  if (score >= 85) return { grade: "A", description: "High AI citation probability" };
  if (score >= 70) return { grade: "B", description: "Good AI visibility" };
  if (score >= 55) return { grade: "C", description: "Needs improvement" };
  if (score >= 40) return { grade: "D", description: "Poor AI visibility" };
  return { grade: "F", description: "Critical GEO issues" };
}

async function fetchText(url: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AIVisibilityAnalyzer/1.0", accept: "text/plain,text/markdown,text/html,*/*" }
    });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

function sameOrigin(url: URL, href: string) {
  try {
    return new URL(href, url).hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

interface LocalPageHtml {
  source: string;
  html: string;
}

async function fetchLikelyLocalPageEntries(origin: string): Promise<LocalPageHtml[]> {
  const pages = [
    ["/contact/", "contact page"],
    ["/contact-us/", "contact page"],
    ["/about/", "about page"],
    ["/about-us/", "about page"],
    ["/locations/", "location page"],
    ["/location/", "location page"]
  ] satisfies Array<[string, string]>;

  const fetched = await Promise.all(pages.map(async ([path, source]) => {
    try {
      const { response, text } = await fetchText(`${origin}${path}`, 5000);
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !/html|text/i.test(contentType) || !text.trim()) return null;
      return { source, html: text } satisfies LocalPageHtml;
    } catch {
      return null;
    }
  }));

  return fetched.filter((page): page is LocalPageHtml => Boolean(page));
}

export async function fetchLikelyLocalPages(origin: string): Promise<string[]> {
  return (await fetchLikelyLocalPageEntries(origin)).map((page) => page.html);
}

function parseJsonLd($: cheerio.CheerioAPI) {
  const blocks: unknown[] = [];
  const errors: string[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) blocks.push(value);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid JSON-LD");
    }
  });

  return { blocks, errors };
}

function flattenSchemaTypes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record["@graph"]) ? record["@graph"] : [];
  const ownType = record["@type"];
  const ownTypes = Array.isArray(ownType) ? ownType : ownType ? [ownType] : [];
  return [
    ...ownTypes.filter((item): item is string => typeof item === "string"),
    ...graph.flatMap(flattenSchemaTypes)
  ];
}

function findObjects(value: unknown, predicate: (record: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => findObjects(item, predicate));

  const record = value as Record<string, unknown>;
  return [
    ...(predicate(record) ? [record] : []),
    ...Object.values(record).flatMap((item) => findObjects(item, predicate))
  ];
}

function hasSchemaType(blocks: unknown[], pattern: RegExp) {
  return blocks.some((block) => flattenSchemaTypes(block).some((type) => pattern.test(type)));
}

function isLocalEntityType(type: string) {
  return /LocalBusiness|MedicalBusiness|ProfessionalService|HealthAndBeautyBusiness|BeautySalon|MedicalClinic|Dermatology|Dentist|Physician/i.test(type);
}

function localEntityObjectsFromJsonLd(blocks: unknown[]) {
  return findObjects(blocks, (record) => flattenSchemaTypes(record).some(isLocalEntityType));
}

function organizationObjectsFromJsonLd(blocks: unknown[]) {
  return findObjects(blocks, (record) => flattenSchemaTypes(record).some((type) => /Organization/i.test(type)));
}

function sameAsUrls(blocks: unknown[]) {
  return findObjects(blocks, (record) => flattenSchemaTypes(record).some((type) => /Organization/i.test(type) || isLocalEntityType(type)))
    .flatMap((record) => {
      const sameAs = record.sameAs;
      if (Array.isArray(sameAs)) return sameAs.filter((item): item is string => typeof item === "string");
      return typeof sameAs === "string" ? [sameAs] : [];
    });
}

function microdataRdfaLocalSignals($: cheerio.CheerioAPI) {
  const localTypes = [
    "LocalBusiness",
    "MedicalBusiness",
    "HealthAndBeautyBusiness",
    "BeautySalon",
    "MedicalClinic",
    "ProfessionalService",
    "Dermatology",
    "Dentist",
    "Physician"
  ];
  const selectors = localTypes.flatMap((type) => [
    `[itemscope][itemtype*='schema.org/${type}']`,
    `[typeof~='${type}']`
  ]);
  const localNodes = $(selectors.join(","));

  const propertyExists = (name: string) =>
    localNodes.filter((_, node) =>
      $(node).find(`[itemprop='${name}'],[property='${name}'],[property='schema:${name}']`).length > 0 ||
      Boolean($(node).attr("itemprop") === name || $(node).attr("property") === name || $(node).attr("property") === `schema:${name}`)
    ).length > 0;

  const textFor = (name: string) =>
    localNodes.find(`[itemprop='${name}'],[property='${name}'],[property='schema:${name}']`).map((_, node) => $(node).attr("content") ?? $(node).text()).get().join(" ");

  return {
    hasLocalEntity: localNodes.length > 0,
    hasAddress: propertyExists("address") || propertyExists("streetAddress"),
    hasPhone: propertyExists("telephone") || propertyExists("phone"),
    hasLatitude: propertyExists("latitude"),
    hasLongitude: propertyExists("longitude"),
    hasAreaServed: propertyExists("areaServed") || propertyExists("serviceArea"),
    name: textFor("name"),
    phone: textFor("telephone") || textFor("phone")
  };
}

function mapsCoordinateSignals($: cheerio.CheerioAPI, html: string) {
  const mapSources = $("iframe[src*='maps.google'],iframe[src*='google.com/maps'],a[href*='maps.google'],a[href*='google.com/maps']")
    .map((_, node) => $(node).attr("src") ?? $(node).attr("href") ?? "")
    .get()
    .join(" ");
  const haystack = `${mapSources} ${html}`;
  const hasMapsEmbed = /maps\.google|google\.com\/maps/i.test(mapSources);
  const decimalPair = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(haystack);
  const googleEmbedPair = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(haystack);
  const namedLatitude = /\b(latitude|lat)\b["'\s:=]+(-?\d{1,2}\.\d+)/i.test(haystack);
  const namedLongitude = /\b(longitude|lng|lon)\b["'\s:=]+(-?\d{1,3}\.\d+)/i.test(haystack);

  return {
    hasMapsEmbed,
    hasLatitude: Boolean(decimalPair || googleEmbedPair || namedLatitude || hasMapsEmbed),
    hasLongitude: Boolean(decimalPair || googleEmbedPair || namedLongitude || hasMapsEmbed)
  };
}

function visibleAreaServedSignal(text: string) {
  return /\b(serving|serves|areas served|service area|locations served|available in|serving clients in|located in)\b.{0,100}\b[A-Z][A-Za-z]+/i.test(text);
}

function visiblePhoneSignal(text: string) {
  return /\+?\d[\d\s().-]{7,}/.test(text);
}

function visibleAddressSignal(text: string) {
  return /\b(address|visit us|find us|located at|clinic|office|suite|floor|street|st\.|road|rd\.|avenue|ave\.|lane|sector|block|near|opp\.|opposite|bangalore|bengaluru|delhi|mumbai|pune|hyderabad|chennai|kolkata|ncr)\b/i.test(text);
}

function visibleNapSignal(text: string) {
  return visiblePhoneSignal(text) && visibleAddressSignal(text);
}

function schemaHasAddressAndPhone(records: Record<string, unknown>[]) {
  return records.some((record) => {
    const hasPhone = typeof record.telephone === "string" || typeof record.phone === "string" || typeof record.contactPoint === "object";
    const hasAddress = typeof record.address === "object" || typeof record.address === "string";
    return hasPhone && hasAddress;
  });
}

function schemaHasLocation(records: Record<string, unknown>[]) {
  return records.some((record) => Boolean(record.address || record.addressLocality || record.addressRegion || record.areaServed || record.serviceArea));
}

function jsonLdHasProperty(records: Record<string, unknown>[], property: string) {
  return findObjects(records, (record) => {
    if (Object.prototype.hasOwnProperty.call(record, property)) return true;

    if (record.geo && typeof record.geo === "object") {
      return Object.prototype.hasOwnProperty.call(record.geo, property);
    }

    if (record.address && typeof record.address === "object") {
      return Object.prototype.hasOwnProperty.call(record.address, property);
    }

    return false;
  }).length > 0;
}

function localGeoEvidence(pages: LocalPageHtml[]) {
  const pageSignals = pages.map((page) => {
    const page$ = cheerio.load(page.html);
    const pageText = page$("body").text().replace(/\s+/g, " ").trim();
    const pageJsonLd = parseJsonLd(page$);
    const pageLocalObjects = localEntityObjectsFromJsonLd(pageJsonLd.blocks);
    const pageOrganizationObjects = organizationObjectsFromJsonLd(pageJsonLd.blocks);
    const pageMicrodataRdfa = microdataRdfaLocalSignals(page$);
    const pageMaps = mapsCoordinateSignals(page$, page.html);
    const hasVisibleNap = visibleNapSignal(pageText);
    const hasContactNap = /contact/i.test(page.source) && hasVisibleNap;

    return {
      source: page.source,
      hasLocalEntity:
        pageLocalObjects.length > 0 ||
        pageMicrodataRdfa.hasLocalEntity ||
        schemaHasAddressAndPhone(pageOrganizationObjects) ||
        hasVisibleNap ||
        hasContactNap ||
        pageMaps.hasMapsEmbed,
      hasLatitude: jsonLdHasProperty(pageLocalObjects, "latitude") || pageMicrodataRdfa.hasLatitude || pageMaps.hasLatitude,
      hasLongitude: jsonLdHasProperty(pageLocalObjects, "longitude") || pageMicrodataRdfa.hasLongitude || pageMaps.hasLongitude,
      hasAreaServed:
        jsonLdHasProperty(pageLocalObjects, "areaServed") ||
        jsonLdHasProperty(pageLocalObjects, "serviceArea") ||
        jsonLdHasProperty(pageLocalObjects, "addressLocality") ||
        jsonLdHasProperty(pageLocalObjects, "addressRegion") ||
        schemaHasLocation(pageOrganizationObjects) ||
        pageMicrodataRdfa.hasAreaServed ||
        visibleAreaServedSignal(pageText),
      hasMapsEmbed: pageMaps.hasMapsEmbed
    };
  });

  const sourceFor = (key: keyof Omit<(typeof pageSignals)[number], "source">) =>
    pageSignals.find((page) => page[key])?.source;

  return {
    schemaSource: sourceFor("hasLocalEntity"),
    latitudeSource: sourceFor("hasLatitude"),
    longitudeSource: sourceFor("hasLongitude"),
    areaServedSource: sourceFor("hasAreaServed"),
    mapsSource: sourceFor("hasMapsEmbed")
  };
}

function robotGroupAllows(robotsText: string, bot: string) {
  if (!robotsText.trim()) return true;

  const groups = robotsText
    .split(/\n(?=user-agent\s*:)/i)
    .map((group) => group.trim())
    .filter(Boolean);
  const matchingGroups = groups.filter((group) => {
    const agents = [...group.matchAll(/^user-agent\s*:\s*(.+)$/gim)].map((match) => match[1].trim().toLowerCase());
    return agents.includes("*") || agents.includes(bot.toLowerCase());
  });

  if (!matchingGroups.length) return true;
  return matchingGroups.every((group) => {
    const disallows = [...group.matchAll(/^disallow\s*:\s*(.*)$/gim)].map((match) => match[1].trim());
    return !disallows.includes("/");
  });
}

function addCheck(results: GeoAeoCheckResult[], id: number, passed: boolean, evidence: string) {
  const def = CHECKS.find((check) => check.id === id);
  if (!def) return;
  results.push({ ...def, passed, evidence });
}

function categorySummaries(checks: GeoAeoCheckResult[]): GeoAeoCategorySummary[] {
  return CATEGORY_ORDER.map((categoryName) => {
    const categoryChecks = checks.filter((check) => check.category === categoryName);
    const failedChecks = categoryChecks.filter((check) => !check.passed).length;
    const warningChecks = categoryChecks.filter((check) => !check.passed && check.severity === "MINOR").length;

    return {
      categoryName,
      totalChecks: categoryChecks.length,
      passedChecks: categoryChecks.length - failedChecks,
      failedChecks,
      warningChecks,
      score: categoryChecks.length ? clamp(((categoryChecks.length - failedChecks) / categoryChecks.length) * 100) : 0,
      status: statusFor(failedChecks)
    };
  });
}

function scoreByScope(checks: GeoAeoCheckResult[], scope: GeoAeoScope) {
  const scoped = checks.filter((check) => check.scope === scope);
  if (!scoped.length) return 0;
  return clamp((scoped.filter((check) => check.passed).length / scoped.length) * 100);
}

function opportunityCounts(checks: GeoAeoCheckResult[]): GeoAeoOpportunityCounts {
  const failed = checks.filter((check) => !check.passed);
  return {
    high: failed.filter((check) => check.severity === "BLOCKER").length,
    medium: failed.filter((check) => check.severity === "MAJOR").length,
    low: failed.filter((check) => check.severity === "MINOR").length
  };
}

export async function runGeoAeoAudit(inputUrl: string, html?: string): Promise<GeoAeoAuditResult> {
  const normalizedUrl = normalizeUrl(inputUrl);
  const url = new URL(normalizedUrl);
  const origin = `${url.protocol}//${url.host}`;
  const pageHtml = html ?? await fetchText(normalizedUrl).then((result) => result.text).catch(() => "");
  const [robots, llms, localPages, crawled] = await Promise.all([
    fetchText(`${origin}/robots.txt`, 4500).catch(() => null),
    fetchText(`${origin}/llms.txt`, 3500).catch(() => null),
    fetchLikelyLocalPageEntries(origin),
    crawlSite(normalizedUrl, { maxPages: 50, maxDepth: 3, timeoutMs: 4000, concurrency: 8 })
  ]);
  const crawledPages: LocalPageHtml[] = crawled.pages.map((page) => ({
    source: page.source === "homepage" ? "homepage" : page.source === "sitemap" ? "sitemap page" : "internal page",
    html: page.html
  }));
  const sitePages = crawledPages.length ? crawledPages : [{ source: "homepage", html: pageHtml }];
  const siteHtml = sitePages.map((page) => page.html).join("\n");
  const localGeoPages: LocalPageHtml[] = [...sitePages, ...localPages];
  const localGeoHtml = localGeoPages.map((page) => page.html).join("\n");
  const $ = cheerio.load(siteHtml);
  const localGeo$ = cheerio.load(localGeoHtml);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const lowerBody = bodyText.toLowerCase();
  const localGeoBodyText = localGeo$("body").text().replace(/\s+/g, " ").trim();
  const localGeoLowerBody = localGeoBodyText.toLowerCase();
  const jsonLd = parseJsonLd($);
  const localGeoJsonLd = parseJsonLd(localGeo$);
  const schemaTypes = jsonLd.blocks.flatMap(flattenSchemaTypes);
  const localGeoSchemaTypes = localGeoJsonLd.blocks.flatMap(flattenSchemaTypes);
  const sameAs = sameAsUrls(jsonLd.blocks);
  const faqDomCount = $("details, .faq, [class*='faq'], [id*='faq']").length;
  const questionCount = (bodyText.match(/\?/g) ?? []).length + $("h2,h3").toArray().filter((el) => /\?|\b(what|how|why|when|where|who|can|does|is|are)\b/i.test($(el).text())).length;
  const links = $("a[href]").toArray().map((el) => String($(el).attr("href") ?? "")).filter((href) => /^https?:/i.test(href) && !sameOrigin(url, href));
  const hiddenWords = $("[style*='display:none'],[hidden],[aria-hidden='true']").toArray().reduce((sum, el) => sum + wordCount($(el).text()), 0);
  const dataPointCount = (bodyText.match(/\b\d+(?:\.\d+)?%|\b\d{4}\b|\b\d+(?:,\d{3})+\b/g) ?? []).length;
  const localBusinessObjects = localEntityObjectsFromJsonLd(localGeoJsonLd.blocks);
  const localOrganizationObjects = organizationObjectsFromJsonLd(localGeoJsonLd.blocks);
  const localMicrodataRdfa = microdataRdfaLocalSignals(localGeo$);
  const localMapSignals = mapsCoordinateSignals(localGeo$, localGeoHtml);
  const localEvidence = localGeoEvidence(localGeoPages);
  const productObjects = findObjects(jsonLd.blocks, (record) => flattenSchemaTypes(record).some((type) => /Product/i.test(type)));
  const faqObjects = findObjects(jsonLd.blocks, (record) => flattenSchemaTypes(record).some((type) => /FAQPage/i.test(type)));
  const result: GeoAeoCheckResult[] = [];

  [
    ["GPTBot", 1],
    ["ClaudeBot", 2],
    ["PerplexityBot", 3],
    ["Google-Extended", 4],
    ["OAI-SearchBot", 5],
    ["Grok", 6],
    ["DeepSeek", 7]
  ].forEach(([bot, id]) => {
    addCheck(result, Number(id), robotGroupAllows(robots?.text ?? "", String(bot)), robots?.response.status ? `robots.txt ${robots.response.status}` : "robots.txt unavailable");
  });

  addCheck(result, 8, llms?.response.ok === true, `Status ${llms?.response.status ?? "missing"}`);
  addCheck(result, 9, llms?.response.ok === true && /^#|\n[-*]\s|\[[^\]]+\]\([^)]+\)/m.test(llms.text), "llms.txt markdown scan");
  addCheck(result, 10, llms?.response.ok === true && wordCount(llms.text) >= 200, `${wordCount(llms?.text ?? "")} words`);
  addCheck(result, 11, llms?.response.ok === true && ["about", "service", "contact", "policy"].filter((term) => llms.text.toLowerCase().includes(term)).length >= 2, "llms.txt completeness scan");
  addCheck(result, 12, sameAs.length >= 4, `${sameAs.length} sameAs URLs`);
  addCheck(result, 13, sameAs.some((href) => /linkedin\.com/i.test(href)), "sameAs social scan");
  addCheck(result, 14, sameAs.some((href) => /crunchbase\.com|wikidata\.org/i.test(href)), "sameAs authority scan");
  addCheck(result, 15, (
    !localBusinessObjects.length &&
    !localOrganizationObjects.length &&
    !localMicrodataRdfa.hasLocalEntity &&
    !visibleNapSignal(localGeoBodyText)
  ) || localBusinessObjects.some((record) => {
    const phone = typeof record.telephone === "string" ? record.telephone.replace(/\D/g, "") : "";
    const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
    return (!phone || localGeoBodyText.replace(/\D/g, "").includes(phone.slice(-7))) && (!name || localGeoLowerBody.includes(name));
  }) || localOrganizationObjects.some((record) => {
    const phone = typeof record.telephone === "string" ? record.telephone.replace(/\D/g, "") : "";
    const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
    return (!phone || localGeoBodyText.replace(/\D/g, "").includes(phone.slice(-7))) && (!name || localGeoLowerBody.includes(name));
  }) || (
    localMicrodataRdfa.hasLocalEntity &&
    (!localMicrodataRdfa.phone || localGeoBodyText.replace(/\D/g, "").includes(localMicrodataRdfa.phone.replace(/\D/g, "").slice(-7))) &&
    (!localMicrodataRdfa.name || localGeoLowerBody.includes(localMicrodataRdfa.name.toLowerCase().trim()))
  ) || visibleNapSignal(localGeoBodyText), "NAP consistency scan");
  addCheck(result, 16, jsonLd.errors.length === 0 && schemaTypes.length > 0, `${jsonLd.errors.length} JSON-LD errors`);
  addCheck(result, 17, faqDomCount > 0 || questionCount >= 3, `${faqDomCount} FAQ elements, ${questionCount} questions`);
  addCheck(result, 18, hasSchemaType(jsonLd.blocks, /FAQPage/), schemaTypes.join(", ") || "none");
  addCheck(result, 19, !faqObjects.length || faqObjects.some((record) => Array.isArray(record.mainEntity) && record.mainEntity.length >= 2), "FAQ mainEntity scan");
  addCheck(result, 20, /\b(in short|bottom line|summary|answer:|tl;dr)\b/i.test(bodyText) || $("p").first().text().length >= 80, "answer-first content scan");
  addCheck(result, 21, questionCount >= 3, `${questionCount} question structures`);
  addCheck(result, 22, /author|byline|written by|reviewed by/i.test(pageHtml), "byline scan");
  addCheck(result, 23, $("a[href*='/author/'],a[href*='/team/'],a[href*='/about']").length > 0, "bio link scan");
  addCheck(result, 24, /\b(certified|credential|licensed|award|degree|accredited|partner)\b/i.test(bodyText), "credential language scan");
  addCheck(result, 25, /\b(we tested|our experience|case study|results|client|customer|first-hand|hands-on)\b/i.test(bodyText), "experience language scan");
  addCheck(result, 26, /dateModified|last updated|updated on|last-modified/i.test(pageHtml), "updated date scan");
  addCheck(result, 27, links.length >= 2, `${links.length} outbound links`);
  addCheck(
    result,
    28,
    localBusinessObjects.length > 0 ||
      localMicrodataRdfa.hasLocalEntity ||
      schemaHasAddressAndPhone(localOrganizationObjects) ||
      visibleNapSignal(localGeoBodyText) ||
      localMapSignals.hasMapsEmbed,
    localEvidence.schemaSource ? `${localEvidence.schemaSource}: local entity/location signal` : localGeoSchemaTypes.join(", ") || "none"
  );
  addCheck(result, 29, jsonLdHasProperty(localBusinessObjects, "latitude") || localMicrodataRdfa.hasLatitude || localMapSignals.hasLatitude, localEvidence.latitudeSource ? `${localEvidence.latitudeSource}${localEvidence.mapsSource ? " / maps iframe" : ""}: latitude signal` : "latitude schema/maps scan");
  addCheck(result, 30, jsonLdHasProperty(localBusinessObjects, "longitude") || localMicrodataRdfa.hasLongitude || localMapSignals.hasLongitude, localEvidence.longitudeSource ? `${localEvidence.longitudeSource}${localEvidence.mapsSource ? " / maps iframe" : ""}: longitude signal` : "longitude schema/maps scan");
  addCheck(
    result,
    31,
    jsonLdHasProperty(localBusinessObjects, "areaServed") ||
      jsonLdHasProperty(localBusinessObjects, "serviceArea") ||
      jsonLdHasProperty(localBusinessObjects, "addressLocality") ||
      jsonLdHasProperty(localBusinessObjects, "addressRegion") ||
      schemaHasLocation(localOrganizationObjects) ||
      localMicrodataRdfa.hasAreaServed ||
      visibleAreaServedSignal(localGeoBodyText) ||
      visibleAddressSignal(localGeoBodyText),
    localEvidence.areaServedSource ? `${localEvidence.areaServedSource}: area served/location signal` : "areaServed text/schema scan"
  );
  addCheck(result, 32, wordCount(bodyText) >= 100, `${wordCount(bodyText)} visible raw HTML words`);
  addCheck(result, 33, hiddenWords < 100, `${hiddenWords} hidden words`);
  addCheck(result, 34, dataPointCount >= 5, `${dataPointCount} data points`);
  addCheck(result, 35, !faqObjects.length || questionCount >= 2, "FAQ schema-DOM consistency scan");
  addCheck(result, 36, !productObjects.length || productObjects.some((record) => {
    const productName = typeof record.name === "string" ? record.name.toLowerCase() : "";
    return !productName || lowerBody.includes(productName);
  }), "Product schema-DOM consistency scan");
  addCheck(result, 37, jsonLd.errors.length === 0, `${jsonLd.errors.length} JSON-LD errors`);

  const pageScore = scoreByScope(result, "page");
  const domainScore = scoreByScope(result, "domain");
  const categories = categorySummaries(result);
const rawScore = weightedCategoryScore(categories);
  const blockerFailed = result.some((check) => check.severity === "BLOCKER" && !check.passed);
  const score = blockerFailed ? Math.min(rawScore, 50) : rawScore;
  const grade = gradeFor(score);

  return {
    score,
    rawScore,
    pageScore,
    domainScore,
    grade: grade.grade,
    gradeDescription: grade.description,
    blockerFailed,
    opportunityCounts: opportunityCounts(result),
    checkedAt: new Date().toISOString(),
    categories,
    checks: result
  };
}
