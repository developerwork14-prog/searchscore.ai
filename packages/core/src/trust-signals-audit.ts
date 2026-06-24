import * as cheerio from "cheerio";
import {
  TechnicalCategoryStatus,
  TrustSignalsAuditResult,
  TrustSignalsCategorySummary,
  TrustSignalsCheckResult,
  TrustSignalsSeverity
} from "./types.js";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: TrustSignalsSeverity;
}

interface PageFetch {
  url: string;
  html: string;
  status: number;
  headers: Record<string, string>;
}

const CHECKS: CheckDefinition[] = [
  [1, "NAP & Brand Consistency", "NAP: Footer vs Schema vs Contact", 4.86, "Critical"],
  [2, "NAP & Brand Consistency", "City Name Consistent Sitewide", 3.74, "High"],
  [3, "NAP & Brand Consistency", "Brand Name Consistent Sitewide", 3.74, "High"],
  [4, "NAP & Brand Consistency", "Business Email Company Domain", 2.67, "High"],
  [5, "NAP & Brand Consistency", "Address Matches Schema", 3.74, "Critical"],
  [6, "NAP & Brand Consistency", "Phone Format Consistent", 2.67, "High"],
  [7, "Schema-DOM Parity", "Schema-DOM Price Parity", 4.28, "Critical"],
  [8, "NAP & Brand Consistency", "Schema-DOM Name Parity", 3.21, "High"],
  [9, "NAP & Brand Consistency", "Schema-DOM Phone Parity", 3.74, "Critical"],
  [10, "Schema-DOM Parity", "Schema-DOM Date Parity", 2.67, "High"],
  [11, "Technical Trust", "Contact Form Functional", 2.67, "High"],
  [12, "Technical Trust", "No Outdated Copyright Year", 2.14, "Medium"],
  [13, "Technical Trust", "HTTPS Security Headers", 2.14, "Medium"],
  [14, "Technical Trust", "Legal Registration Number", 2.14, "Medium"],
  [15, "Technical Trust", "Privacy Policy <24 Months Old", 2.14, "Medium"]
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

async function fetchPage(url: string): Promise<PageFetch | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { "user-agent": "AIVisibilityAnalyzer/1.0" }
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      url: response.url,
      html: response.ok ? await response.text() : "",
      status: response.status,
      headers
    };
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
  return $("script[type='application/ld+json']").toArray().flatMap((el) => {
    try {
      return flattenSchema(JSON.parse($(el).text()));
    } catch {
      return [];
    }
  });
}

function findByType(records: Record<string, unknown>[], predicate: (type: string) => boolean) {
  return records.filter((record) => typesOf(record).some(predicate));
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record.name) || textValue(record.url) || textValue(record["@id"]);
  }
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/&nbsp;/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function compact(value: string) {
  return normalizedText(value).replace(/\s+/g, " ");
}

function digits(value: string) {
  return value.replace(/\D+/g, "");
}

function phoneCandidates(text: string) {
  return Array.from(new Set((text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? []).map((phone) => phone.trim()).filter((phone) => digits(phone).length >= 8)));
}

function emailCandidates(text: string) {
  return Array.from(new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
}

function domainFromEmail(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function rootDomain(hostname: string) {
  const parts = hostname.replace(/^www\./, "").toLowerCase().split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
}

function schemaAddress(record: Record<string, unknown> | undefined) {
  const address = objectValue(record?.address);
  const parts = [
    textValue(address.streetAddress),
    textValue(address.addressLocality),
    textValue(address.addressRegion),
    textValue(address.postalCode),
    textValue(address.addressCountry)
  ].filter(Boolean);
  return {
    full: parts.join(", "),
    city: textValue(address.addressLocality),
    region: textValue(address.addressRegion),
    postalCode: textValue(address.postalCode)
  };
}

function schemaDates(records: Record<string, unknown>[]) {
  return records.flatMap((record) => [textValue(record.datePublished), textValue(record.dateModified), textValue(record.uploadDate), textValue(record.startDate), textValue(record.endDate)]).filter(Boolean);
}

function schemaPrices(records: Record<string, unknown>[]) {
  return records.flatMap((record) => {
    const offerRecords = asArray(record.offers as Record<string, unknown> | Record<string, unknown>[] | undefined).map(objectValue);
    return offerRecords.flatMap((offer) => [textValue(offer.price), textValue(offer.lowPrice), textValue(offer.highPrice)]).filter(Boolean);
  });
}

function schemaPhones(record: Record<string, unknown> | undefined) {
  return [textValue(record?.telephone), ...asArray(record?.contactPoint as Record<string, unknown> | Record<string, unknown>[] | undefined).map((item) => textValue(objectValue(item).telephone))].filter(Boolean);
}

function containsExactText(haystack: string, needle: string) {
  const normalizedNeedle = compact(needle);
  return Boolean(normalizedNeedle) && compact(haystack).includes(normalizedNeedle);
}

function footerText($: cheerio.CheerioAPI) {
  const footer = $("footer").text().replace(/\s+/g, " ").trim();
  return footer || $("[class*='footer' i],[id*='footer' i]").text().replace(/\s+/g, " ").trim();
}

function result(def: CheckDefinition, state: { passed?: boolean; skipped?: boolean; warning?: boolean; evidence?: Record<string, unknown> }): TrustSignalsCheckResult {
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

function summarize(checks: TrustSignalsCheckResult[]): TrustSignalsCategorySummary[] {
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

function copyrightYears(text: string) {
  return Array.from(new Set((text.match(/(?:copyright|\u00a9|\(c\))\s*(?:\d{4}\s*[-\u2013]\s*)?(\d{4})/gi) ?? [])
    .map((match) => Number(match.match(/(\d{4})(?!.*\d{4})/)?.[1] ?? 0))
    .filter((year) => year >= 1990 && year <= new Date().getFullYear() + 1)));
}

function legalRegistrationNumbers(text: string) {
  const patterns = [
    /\b(?:GSTIN|GST|VAT|EIN|TIN|CIN|LLPIN|Company Registration(?: Number)?|Registration(?: Number)?|Reg\.?\s*No\.?)[:#\s-]*[A-Z0-9-]{6,25}\b/gi
  ];
  return Array.from(new Set(patterns.flatMap((pattern) => text.match(pattern) ?? [])));
}

function policyDate(text: string) {
  const direct = text.match(/\b(?:last updated|last modified|effective date|updated on|effective)\s*:?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  if (!direct) return null;
  const parsed = new Date(direct);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export async function runTrustSignalsAudit(inputUrl: string, html?: string, brandName = "", businessEmail = ""): Promise<TrustSignalsAuditResult> {
  const normalized = normalizeUrl(inputUrl);
  const base = new URL(normalized);
  const fetchedHomepagePromise = fetchPage(normalized);
  const fetchedHomepage = html === undefined ? await fetchedHomepagePromise : null;
  const homepage = html ?? fetchedHomepage?.html ?? "";
  const $ = cheerio.load(homepage);
  const records = parseJsonLd($);
  const org = findByType(records, (type) => ORG_TYPES.has(type))[0];
  const local = findByType(records, (type) => LOCAL_TYPES.has(type))[0];
  const entity = local ?? org;
  const schemaName = textValue(entity?.name);
  const address = schemaAddress(entity);
  const schemaPhoneValues = schemaPhones(entity);
  const productRecords = findByType(records, (type) => type === "Product");
  const pageDates = schemaDates(records);
  const prices = schemaPrices(productRecords);
  const footer = footerText($);
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const contactLink = findLink($, base, /contact|get in touch/i);
  const privacyLink = findLink($, base, /privacy/i);
  const [headerPage, contactPage, privacyPage] = await Promise.all([
    html === undefined ? Promise.resolve(fetchedHomepage) : fetchedHomepagePromise,
    contactLink?.href ? fetchPage(contactLink.href) : Promise.resolve(null),
    privacyLink?.href ? fetchPage(privacyLink.href) : Promise.resolve(null)
  ]);
  const headers = headerPage?.headers ?? {};
  const contactText = cheerio.load(contactPage?.html ?? "")("body").text().replace(/\s+/g, " ").trim();
  const privacyText = cheerio.load(privacyPage?.html ?? "")("body").text().replace(/\s+/g, " ").trim();
  const allText = [body, footer, contactText, privacyText].join(" ");
  const footerPhones = phoneCandidates(footer);
  const contactPhones = phoneCandidates(contactText);
  const allPhones = Array.from(new Set([...phoneCandidates(body), ...footerPhones, ...contactPhones]));
  const allPhoneDigits = Array.from(new Set(allPhones.map(digits).filter(Boolean)));
  const schemaPhoneDigits = Array.from(new Set(schemaPhoneValues.map(digits).filter(Boolean)));
  const allEmails = emailCandidates(allText);
  const brandCandidate = brandName || schemaName;
  const currentYear = new Date().getFullYear();
  const checks: TrustSignalsCheckResult[] = [];
  const add = (id: number, state: Parameters<typeof result>[1]) => {
    const def = CHECKS.find((check) => check.id === id);
    if (def) checks.push(result(def, state));
  };

  add(1, {
    passed: Boolean(address.full && schemaPhoneDigits.length && containsExactText(footer, address.full) && containsExactText(contactText, address.full) && schemaPhoneDigits.some((phone) => footerPhones.map(digits).includes(phone)) && schemaPhoneDigits.some((phone) => contactPhones.map(digits).includes(phone))),
    evidence: { schemaAddress: address.full, schemaPhones: schemaPhoneValues, contactUrl: contactLink?.href ?? "", footerPhones, contactPhones }
  });
  add(2, {
    passed: Boolean(address.city && [body, footer, contactText].every((text) => !text || containsExactText(text, address.city))),
    evidence: { city: address.city, checkedSurfaces: ["homepage", "footer", "contact"] }
  });
  add(3, {
    passed: Boolean(brandCandidate && containsExactText(body, brandCandidate) && (!schemaName || compact(schemaName) === compact(brandCandidate)) && (!contactText || containsExactText(contactText, brandCandidate))),
    evidence: { inputBrand: brandName, schemaName, contactUrl: contactLink?.href ?? "" }
  });
  add(4, {
    passed: allEmails.length > 0 && allEmails.every((email) => {
      const emailDomain = domainFromEmail(email);
      const expected = businessEmail ? rootDomain(domainFromEmail(businessEmail)) : rootDomain(base.hostname);
      return rootDomain(emailDomain) === expected;
    }),
    evidence: { emails: allEmails, expectedDomain: businessEmail ? rootDomain(domainFromEmail(businessEmail)) : rootDomain(base.hostname) }
  });
  add(5, {
    passed: Boolean(address.full && (containsExactText(body, address.full) || containsExactText(contactText, address.full) || containsExactText(footer, address.full))),
    evidence: { schemaAddress: address.full, contactUrl: contactLink?.href ?? "" }
  });
  add(6, {
    passed: allPhoneDigits.length === 1,
    evidence: { phones: allPhones, normalizedPhones: allPhoneDigits }
  });
  add(7, {
    passed: prices.length > 0 && prices.every((price) => containsExactText(body, price)),
    evidence: { schemaPrices: prices }
  });
  add(8, {
    passed: Boolean(schemaName && containsExactText(body, schemaName)),
    evidence: { schemaName }
  });
  add(9, {
    passed: schemaPhoneDigits.length > 0 && schemaPhoneDigits.every((phone) => allPhoneDigits.includes(phone)),
    evidence: { schemaPhones: schemaPhoneValues, domPhones: allPhones }
  });
  add(10, {
    passed: pageDates.length > 0 && pageDates.every((date) => containsExactText(body, date)),
    evidence: { schemaDates: pageDates }
  });
  add(11, { skipped: true, evidence: { reason: "Form functionality cannot be verified with 100% accuracy without submitting the form." } });
  add(12, {
    passed: copyrightYears(allText).some((year) => year >= currentYear),
    evidence: { copyrightYears: copyrightYears(allText), currentYear }
  });
  add(13, {
    passed: base.protocol === "https:" && Boolean(headers["strict-transport-security"]) && Boolean(headers["x-content-type-options"]),
    evidence: {
      protocol: base.protocol,
      strictTransportSecurity: headers["strict-transport-security"] ?? "",
      contentSecurityPolicy: headers["content-security-policy"] ?? "",
      xContentTypeOptions: headers["x-content-type-options"] ?? "",
      referrerPolicy: headers["referrer-policy"] ?? ""
    }
  });
  add(14, {
    passed: legalRegistrationNumbers(allText).length > 0,
    evidence: { legalRegistrationNumbers: legalRegistrationNumbers(allText).slice(0, 5) }
  });
  const privacyUpdated = policyDate(privacyText);
  add(15, {
    passed: Boolean(privacyUpdated && addMonths(privacyUpdated, 24) >= new Date()),
    evidence: { privacyUrl: privacyLink?.href ?? "", status: privacyPage?.status ?? 0, lastUpdated: privacyUpdated?.toISOString() ?? "" }
  });

  const categories = summarize(checks);
  const scorable = checks.filter((check) => !check.skipped);
  const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
  return { score, checkedAt: new Date().toISOString(), categories, checks };
}
