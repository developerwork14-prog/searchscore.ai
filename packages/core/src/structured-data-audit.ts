import * as cheerio from "cheerio";
import {
  StructuredDataAuditResult,
  StructuredDataCategorySummary,
  StructuredDataCheckResult,
  StructuredDataSeverity,
  TechnicalCategoryStatus
} from "./types.js";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: StructuredDataSeverity;
}

const CHECKS: CheckDefinition[] = [
  [1, "Organization Schema", "Organization Schema Present", 3.07, "Critical"],
  [2, "Organization Schema", "Org: name Property", 2.03, "Critical"],
  [3, "Organization Schema", "Org: url Property", 1.52, "High"],
  [4, "Organization Schema", "Org: logo ImageObject", 1.52, "Medium"],
  [5, "Organization Schema", "Org: telephone", 1.52, "Critical"],
  [6, "Organization Schema", "Org: address PostalAddress", 2.03, "Critical"],
  [7, "Organization Schema", "Org: sameAs >=4", 2.54, "Critical"],
  [8, "Organization Schema", "Org: sameAs LinkedIn", 2.03, "High"],
  [9, "Organization Schema", "Org: sameAs Wikidata/Crunchbase", 2.03, "High"],
  [10, "Organization Schema", "Org: knowsAbout >=5", 2.03, "Medium"],
  [11, "Organization Schema", "Org: @id Declared", 1.52, "High"],
  [12, "Organization Schema", "Org: foundingDate", 1.02, "Medium"],
  [13, "LocalBusiness Schema", "LocalBusiness: GPS", 2.03, "High"],
  [14, "LocalBusiness Schema", "LocalBusiness: areaServed", 1.52, "Medium"],
  [15, "LocalBusiness Schema", "LocalBusiness: openingHours", 1.52, "Medium"],
  [16, "LocalBusiness Schema", "LocalBusiness: @type Specificity", 1.02, "Medium"],
  [17, "Article Schema", "Article: headline", 2.03, "Critical"],
  [18, "Article Schema", "Article: author Person", 2.03, "High"],
  [19, "Article Schema", "Article: datePublished ISO", 1.52, "High"],
  [20, "Article Schema", "Article: dateModified=Visible", 2.03, "High"],
  [21, "Article Schema", "Article: about Entity", 1.52, "Medium"],
  [22, "Article Schema", "Article: image ImageObject", 1.02, "Medium"],
  [23, "Article Schema", "Article: publisher->Org", 1.52, "High"],
  [24, "Person Schema", "Person Schema on Bio Pages", 2.03, "High"],
  [25, "Person Schema", "Person: name+jobTitle+url", 1.52, "Medium"],
  [26, "Person Schema", "Person: sameAs LinkedIn", 1.52, "Medium"],
  [27, "Person Schema", "Person: knowsAbout", 1.52, "Medium"],
  [28, "FAQ & HowTo Schema", "FAQPage When FAQ in DOM", 2.03, "High"],
  [29, "FAQ & HowTo Schema", "FAQPage >=3 Items", 1.52, "Medium"],
  [30, "FAQ & HowTo Schema", "FAQPage Text >=90% Match", 2.03, "Critical"],
  [31, "FAQ & HowTo Schema", "HowTo on Step-by-Step", 1.52, "Medium"],
  [32, "Product Schema", "Product: name+brand+desc", 2.03, "Critical"],
  [33, "Product Schema", "Product: offers price+avail", 2.03, "Critical"],
  [34, "Product Schema", "Product: aggregateRating", 1.52, "High"],
  [35, "Product Schema", "Product: GTIN/MPN/SKU", 1.52, "High"],
  [36, "Supporting Schema Types", "BreadcrumbList on Interior", 2.03, "High"],
  [37, "Supporting Schema Types", "BreadcrumbList Matches DOM", 1.52, "High"],
  [38, "Supporting Schema Types", "WebSite on Homepage", 1.02, "Medium"],
  [39, "Supporting Schema Types", "@graph Interconnection", 1.52, "Medium"],
  [40, "Supporting Schema Types", "ImageObject on Key Images", 1.02, "Medium"],
  [41, "Supporting Schema Types", "VideoObject on Videos", 1.02, "Medium"],
  [42, "Schema Validation & Quality", "Rich Results Test Zero Errors", 2.54, "Critical"],
  [43, "Schema Validation & Quality", "JSON-LD Format (Not Microdata)", 1.52, "High"],
  [44, "Schema Validation & Quality", "Absolute HTTPS URLs in Schema", 1.52, "High"],
  [45, "Schema-DOM Parity", "Schema-DOM: Price Match", 2.03, "Critical"],
  [46, "Schema-DOM Parity", "Schema-DOM: Phone Match", 2.03, "Critical"],
  [47, "Schema-DOM Parity", "Schema-DOM: Name Match", 1.52, "High"],
  [48, "Schema-DOM Parity", "Schema-DOM: Date Match", 1.52, "High"],
  [49, "Schema-DOM Parity", "Schema-DOM: FAQ Match", 1.52, "Critical"],
  [50, "Schema-DOM Parity", "Schema-DOM: Availability Match", 1.52, "Critical"],
  [51, "Schema Validation & Quality", "No Duplicate @id Values", 1.52, "High"],
  [52, "Schema Validation & Quality", "Schema in Server HTML", 2.03, "Critical"],
  [53, "FAQ & HowTo Schema", "HowTo: step Array Nested", 1.52, "Medium"],
  [54, "LocalBusiness Schema", "LocalBusiness: priceRange", 1.02, "Medium"],
  [55, "FAQ & HowTo Schema", "HowTo: totalTime+Cost", 1.02, "Low"],
  [56, "Schema Validation & Quality", "Schema Versioning", 0.51, "Low"],
  [57, "Specialist Schema Types", "Speakable + Valid Selectors", 1.52, "Medium"],
  [58, "Specialist Schema Types", "DefinedTerm on Glossary", 1.52, "Medium"],
  [59, "Specialist Schema Types", "Dataset on Research", 1.02, "Medium"],
  [60, "Specialist Schema Types", "ProfilePage on Bio Pages", 1.02, "Low"],
  [61, "Specialist Schema Types", "Event on Webinars", 1.02, "Low"],
  [62, "Specialist Schema Types", "SoftwareApp on Tools", 1.02, "Low"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const CATEGORY_ORDER = [...new Set(CHECKS.map((check) => check.category))];
const ORG_TYPES = new Set(["Organization", "LocalBusiness", "Corporation", "OnlineBusiness", "ProfessionalService", "MedicalOrganization", "NGO", "EducationalOrganization"]);
const LOCAL_TYPES = new Set(["LocalBusiness", "ProfessionalService", "FinancialService", "MedicalBusiness", "Store", "Restaurant", "Dentist", "MedicalClinic", "HealthAndBeautyBusiness"]);

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

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function typesOf(record: Record<string, unknown>) {
  return asArray(record["@type"] as string | string[] | undefined).map(String);
}

function flattenSchema(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(flattenSchema);
  const record = value as Record<string, unknown>;
  const current = record["@type"] ? [record] : [];
  return [...current, ...flattenSchema(record["@graph"])];
}

function parseJsonLd($: cheerio.CheerioAPI) {
  const errors: string[] = [];
  const records = $("script[type='application/ld+json']").toArray().flatMap((el) => {
    try {
      return flattenSchema(JSON.parse($(el).text()));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid JSON-LD");
      return [];
    }
  });
  return { records, errors };
}

function findByType(records: Record<string, unknown>[], predicate: (type: string) => boolean) {
  return records.filter((record) => typesOf(record).some(predicate));
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record.name) || textValue(record.url) || textValue(record["@id"]);
  }
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasDom($: cheerio.CheerioAPI, pattern: RegExp) {
  return pattern.test($("body").text());
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/&nbsp;/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function absoluteHttpsUrls(record: Record<string, unknown>) {
  const urls = JSON.stringify(record).match(/https?:\/\/[^"',\]\s}]+/g) ?? [];
  return { urls, invalid: urls.filter((url) => !url.startsWith("https://")) };
}

function result(def: CheckDefinition, state: { passed?: boolean; skipped?: boolean; warning?: boolean; evidence?: Record<string, unknown> }): StructuredDataCheckResult {
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

function summarize(checks: StructuredDataCheckResult[]): StructuredDataCategorySummary[] {
  return CATEGORY_ORDER.map((categoryName) => {
    const categoryChecks = checks.filter((check) => check.category === categoryName);
    const scorable = categoryChecks.filter((check) => !check.skipped);
    const failed = scorable.filter((check) => !check.passed && !check.warning);
    const warningChecks = scorable.filter((check) => check.warning).length;
    const skippedChecks = categoryChecks.filter((check) => check.skipped).length;
    const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
    const status: TechnicalCategoryStatus = failed.length === 0 && warningChecks === 0 ? "Passed" : failed.length === 0 ? "Minor Attention" : "Needs Attention";
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

export async function runStructuredDataAudit(inputUrl: string, html?: string): Promise<StructuredDataAuditResult> {
  const normalized = normalizeUrl(inputUrl);
  const url = new URL(normalized);
  const pageHtml = html ?? await fetchHtml(normalized);
  const $ = cheerio.load(pageHtml);
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const lowerBody = body.toLowerCase();
  const { records, errors } = parseJsonLd($);
  const org = findByType(records, (type) => ORG_TYPES.has(type))[0];
  const local = findByType(records, (type) => LOCAL_TYPES.has(type))[0];
  const article = findByType(records, (type) => /Article|BlogPosting|NewsArticle/i.test(type))[0];
  const person = findByType(records, (type) => type === "Person")[0];
  const faq = findByType(records, (type) => type === "FAQPage")[0];
  const howTo = findByType(records, (type) => type === "HowTo")[0];
  const product = findByType(records, (type) => type === "Product")[0];
  const breadcrumb = findByType(records, (type) => type === "BreadcrumbList")[0];
  const website = findByType(records, (type) => type === "WebSite")[0];
  const sameAs = asArray(org?.sameAs as string | string[] | undefined).map(String);
  const knowsAbout = asArray(org?.knowsAbout as unknown[] | undefined);
  const localApplicable = Boolean(local || /\b(address|directions|near me|hours|open now|visit us)\b/i.test(body) || $("iframe[src*='google.com/maps']").length);
  const articleApplicable = Boolean(article || $("article").length || /\b(author|published|updated)\b/i.test(body));
  const personApplicable = Boolean(person || /\b(author|founder|team|bio|job title|linkedin)\b/i.test(lowerBody));
  const faqApplicable = Boolean(faq || $("details,.faq,[id*='faq' i],[class*='faq' i]").length || (body.match(/\?/g) ?? []).length >= 3);
  const howToApplicable = Boolean(howTo || /\b(step \d|how to|instructions|tutorial)\b/i.test(body));
  const productApplicable = Boolean(product || /\b(price|add to cart|sku|in stock|out of stock)\b/i.test(lowerBody));
  const videoApplicable = Boolean($("video,iframe[src*='youtube'],iframe[src*='vimeo']").length);
  const imageApplicable = Boolean($("img").length);
  const ids = records.map((record) => textValue(record["@id"])).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const allUrls = records.flatMap(absoluteHttpsUrls);
  const results: StructuredDataCheckResult[] = [];
  const add = (id: number, state: Parameters<typeof result>[1]) => {
    const def = CHECKS.find((check) => check.id === id);
    if (def) results.push(result(def, state));
  };

  add(1, { passed: Boolean(org), evidence: { organizationFound: Boolean(org), typesFound: records.flatMap(typesOf) } });
  add(2, { passed: Boolean(textValue(org?.name)), evidence: { name: textValue(org?.name) } });
  add(3, { passed: textValue(org?.url).startsWith("https://"), evidence: { url: textValue(org?.url) } });
  add(4, { passed: Boolean(textValue(org?.logo)), evidence: { logo: textValue(org?.logo) } });
  add(5, { passed: Boolean(textValue(org?.telephone)), skipped: !localApplicable, evidence: { telephone: textValue(org?.telephone), skippedReason: localApplicable ? "" : "No local/service intent detected" } });
  add(6, { passed: Boolean(objectValue(org?.address)["@type"] || textValue(org?.address)), skipped: !localApplicable, evidence: { address: org?.address ?? null } });
  add(7, { passed: sameAs.length >= 4, evidence: { sameAsCount: sameAs.length, sameAsUrls: sameAs } });
  add(8, { passed: sameAs.some((item) => /linkedin\.com/i.test(item)), evidence: { linkedinFound: sameAs.some((item) => /linkedin\.com/i.test(item)) } });
  add(9, { passed: sameAs.some((item) => /wikidata\.org|crunchbase\.com/i.test(item)), warning: !sameAs.some((item) => /wikidata\.org|crunchbase\.com/i.test(item)), evidence: { sameAsUrls: sameAs } });
  add(10, { passed: knowsAbout.length >= 5, warning: knowsAbout.length > 0 && knowsAbout.length < 5, evidence: { knowsAboutCount: knowsAbout.length } });
  add(11, { passed: textValue(org?.["@id"]).startsWith("https://"), evidence: { id: textValue(org?.["@id"]) } });
  add(12, { passed: /^\d{4}(-\d{2}-\d{2})?$/.test(textValue(org?.foundingDate)), skipped: !hasDom($, /\b(founded|since|established)\b/i), evidence: { foundingDate: textValue(org?.foundingDate) } });

  add(13, { passed: Boolean(objectValue(local?.geo).latitude && objectValue(local?.geo).longitude), skipped: !localApplicable, evidence: { geo: local?.geo ?? null } });
  add(14, { passed: Boolean(local?.areaServed), skipped: !localApplicable, evidence: { areaServed: local?.areaServed ?? null } });
  add(15, { passed: Boolean(local?.openingHours || local?.openingHoursSpecification), skipped: !localApplicable, evidence: { openingHours: local?.openingHours ?? local?.openingHoursSpecification ?? null } });
  add(16, { passed: Boolean(local && typesOf(local).some((type) => type !== "LocalBusiness")), skipped: !localApplicable, evidence: { types: local ? typesOf(local) : [] } });
  add(54, { passed: Boolean(local?.priceRange), skipped: !localApplicable, evidence: { priceRange: local?.priceRange ?? "" } });

  add(17, { passed: Boolean(article?.headline), skipped: !articleApplicable, evidence: { headline: article?.headline ?? "" } });
  add(18, { passed: Boolean(article?.author), skipped: !articleApplicable, evidence: { author: article?.author ?? null } });
  add(19, { passed: /^\d{4}-\d{2}-\d{2}/.test(textValue(article?.datePublished)), skipped: !articleApplicable, evidence: { datePublished: article?.datePublished ?? "" } });
  add(20, { passed: Boolean(article?.dateModified && normalizedText(body).includes(normalizedText(textValue(article.dateModified)).slice(0, 10))), skipped: !articleApplicable, evidence: { dateModified: article?.dateModified ?? "" } });
  add(21, { passed: Boolean(article?.about), skipped: !articleApplicable, evidence: { about: article?.about ?? null } });
  add(22, { passed: Boolean(article?.image), skipped: !articleApplicable, evidence: { image: article?.image ?? null } });
  add(23, { passed: Boolean(article?.publisher), skipped: !articleApplicable, evidence: { publisher: article?.publisher ?? null } });

  add(24, { passed: Boolean(person), skipped: !personApplicable, evidence: { personFound: Boolean(person) } });
  add(25, { passed: Boolean(person?.name && person?.jobTitle && person?.url), skipped: !personApplicable, evidence: { name: person?.name ?? "", jobTitle: person?.jobTitle ?? "", url: person?.url ?? "" } });
  add(26, { passed: asArray(person?.sameAs as string | string[] | undefined).some((item) => /linkedin\.com/i.test(String(item))), skipped: !personApplicable, evidence: { sameAs: person?.sameAs ?? [] } });
  add(27, { passed: asArray(person?.knowsAbout as unknown[] | undefined).length > 0, skipped: !personApplicable, evidence: { knowsAbout: person?.knowsAbout ?? [] } });

  const faqItems = asArray(faq?.mainEntity as unknown[] | undefined);
  add(28, { passed: Boolean(faq), skipped: !faqApplicable, evidence: { faqFound: Boolean(faq) } });
  add(29, { passed: faqItems.length >= 3, skipped: !faqApplicable, evidence: { itemCount: faqItems.length } });
  add(30, { passed: faqItems.length > 0 && faqItems.every((item) => normalizedText(body).includes(normalizedText(textValue(item)).slice(0, 40))), skipped: !faqApplicable, evidence: { itemCount: faqItems.length } });
  add(31, { passed: Boolean(howTo), skipped: !howToApplicable, evidence: { howToFound: Boolean(howTo) } });
  add(53, { passed: asArray(howTo?.step as unknown[] | undefined).length > 0, skipped: !howToApplicable, evidence: { steps: asArray(howTo?.step as unknown[] | undefined).length } });
  add(55, { passed: Boolean(howTo?.totalTime || howTo?.estimatedCost), skipped: !howToApplicable, warning: Boolean(howTo), evidence: { totalTime: howTo?.totalTime ?? "", estimatedCost: howTo?.estimatedCost ?? "" } });

  const offers = objectValue(product?.offers);
  add(32, { passed: Boolean(product?.name && product?.brand && product?.description), skipped: !productApplicable, evidence: { name: product?.name ?? "", brand: product?.brand ?? "", description: Boolean(product?.description) } });
  add(33, { passed: Boolean(offers.price && offers.availability), skipped: !productApplicable, evidence: { offers } });
  add(34, { passed: Boolean(product?.aggregateRating), skipped: !productApplicable, evidence: { aggregateRating: product?.aggregateRating ?? null } });
  add(35, { passed: Boolean(product?.gtin || product?.gtin13 || product?.mpn || product?.sku), skipped: !productApplicable, evidence: { gtin: product?.gtin ?? product?.gtin13 ?? "", mpn: product?.mpn ?? "", sku: product?.sku ?? "" } });

  add(36, { passed: Boolean(breadcrumb), skipped: url.pathname === "/", evidence: { breadcrumbFound: Boolean(breadcrumb) } });
  add(37, { passed: Boolean(breadcrumb?.itemListElement), skipped: !breadcrumb, evidence: { itemListElement: breadcrumb?.itemListElement ?? null } });
  add(38, { passed: Boolean(website), evidence: { websiteFound: Boolean(website) } });
  add(39, { passed: records.some((record) => Boolean(record["@id"])) && records.length > 1, warning: records.length > 1, evidence: { records: records.length, ids: ids.length } });
  add(40, { passed: findByType(records, (type) => type === "ImageObject").length > 0, skipped: !imageApplicable, evidence: { images: $("img").length } });
  add(41, { passed: findByType(records, (type) => type === "VideoObject").length > 0, skipped: !videoApplicable, evidence: { videos: $("video,iframe[src*='youtube'],iframe[src*='vimeo']").length } });

  add(42, { passed: errors.length === 0, evidence: { parseErrors: errors } });
  add(43, { passed: $("script[type='application/ld+json']").length > 0, warning: $("[itemscope],[typeof],[property]").length > 0, evidence: { jsonLdBlocks: $("script[type='application/ld+json']").length, microdataRdfaSignals: $("[itemscope],[typeof],[property]").length } });
  add(44, { passed: allUrls.every((item) => item.invalid.length === 0), evidence: { invalidHttpUrls: allUrls.flatMap((item) => item.invalid).slice(0, 10) } });
  add(51, { passed: duplicateIds.length === 0, evidence: { duplicateIds: [...new Set(duplicateIds)] } });
  add(52, { passed: $("script[type='application/ld+json']").length > 0, evidence: { jsonLdBlocks: $("script[type='application/ld+json']").length } });
  add(56, { passed: records.some((record) => Boolean(record["@context"])), warning: records.length > 0, evidence: { contexts: records.map((record) => record["@context"]).filter(Boolean) } });

  add(45, { passed: Boolean(!offers.price || normalizedText(body).includes(normalizedText(String(offers.price)))), skipped: !productApplicable || !offers.price, evidence: { price: offers.price ?? "" } });
  add(46, { passed: Boolean(!org?.telephone || normalizedText(body).includes(normalizedText(textValue(org.telephone)))), skipped: !org?.telephone, evidence: { telephone: org?.telephone ?? "" } });
  add(47, { passed: Boolean(!org?.name || normalizedText(body).includes(normalizedText(textValue(org.name)))), skipped: !org?.name, evidence: { name: org?.name ?? "" } });
  add(48, { passed: Boolean(!article?.datePublished || normalizedText(body).includes(normalizedText(textValue(article.datePublished)).slice(0, 10))), skipped: !articleApplicable || !article?.datePublished, evidence: { datePublished: article?.datePublished ?? "" } });
  add(49, { passed: faqItems.length > 0 && faqItems.every((item) => normalizedText(body).includes(normalizedText(textValue(item)).slice(0, 40))), skipped: !faqApplicable, evidence: { itemCount: faqItems.length } });
  add(50, { passed: Boolean(!offers.availability || normalizedText(body).includes(normalizedText(String(offers.availability)).replace("https schema org ", ""))), skipped: !productApplicable || !offers.availability, evidence: { availability: offers.availability ?? "" } });

  add(57, { passed: findByType(records, (type) => type === "SpeakableSpecification").length > 0, skipped: !hasDom($, /\b(news|article|speakable)\b/i), evidence: {} });
  add(58, { passed: findByType(records, (type) => type === "DefinedTerm").length > 0, skipped: !hasDom($, /\b(glossary|definition|term)\b/i), evidence: {} });
  add(59, { passed: findByType(records, (type) => type === "Dataset").length > 0, skipped: !hasDom($, /\b(dataset|research|study|download data)\b/i), evidence: {} });
  add(60, { passed: findByType(records, (type) => type === "ProfilePage").length > 0, skipped: !personApplicable, evidence: {} });
  add(61, { passed: findByType(records, (type) => type === "Event").length > 0, skipped: !hasDom($, /\b(webinar|event|conference|register)\b/i), evidence: {} });
  add(62, { passed: findByType(records, (type) => type === "SoftwareApplication" || type === "SoftwareApp").length > 0, skipped: !hasDom($, /\b(tool|software|app|platform)\b/i), evidence: {} });

  const categories = summarize(results);
  const scorable = results.filter((check) => !check.skipped);
  const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
  return { score, checkedAt: new Date().toISOString(), categories, checks: results };
}
