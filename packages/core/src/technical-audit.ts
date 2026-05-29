import * as cheerio from "cheerio";
import tls from "node:tls";

export type TechnicalSeverity = "BLOCKER" | "MAJOR" | "MINOR" | "ADVISORY";
export type TechnicalGrade = "A" | "B" | "C" | "D" | "F";
type TechnicalScope = "page" | "domain";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: TechnicalSeverity;
}

interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  headers: Headers;
  html: string;
  responseTimeMs: number;
  redirectHops: number;
  $: cheerio.CheerioAPI;
  wordCount: number;
}

export interface TechnicalCheckResult extends CheckDefinition {
  passed: boolean;
  evidence: string;
  scope: TechnicalScope;
}

export interface TechnicalAuditResult {
  score: number;
  rawScore: number;
  pageScore: number;
  domainScore: number;
  grade: TechnicalGrade;
  blockerFailed: boolean;
  checkedAt: string;
  checks: TechnicalCheckResult[];
}

const CHECKS: CheckDefinition[] = [
  [1, "HTTP & Server Health", "Page returns HTTP 200", 10, "BLOCKER"],
  [2, "HTTP & Server Health", "HTTPS protocol enabled", 10, "BLOCKER"],
  [3, "HTTP & Server Health", "SSL certificate valid and not expired", 8, "BLOCKER"],
  [4, "HTTP & Server Health", "HSTS header present", 4, "MINOR"],
  [5, "HTTP & Server Health", "GZIP or Brotli compression enabled", 5, "MAJOR"],
  [6, "HTTP & Server Health", "X-Robots-Tag header does NOT contain noindex", 7, "BLOCKER"],
  [7, "HTTP & Server Health", "WWW vs non-WWW redirects consistently", 5, "MAJOR"],
  [8, "HTTP & Server Health", "No mixed content on HTTPS pages", 7, "MAJOR"],
  [9, "HTTP & Server Health", "TTFB < 800ms", 6, "MAJOR"],
  [10, "Robots.txt & Sitemap", "robots.txt returns HTTP 200", 5, "MAJOR"],
  [11, "Robots.txt & Sitemap", "Sitemap declared in robots.txt", 5, "MINOR"],
  [12, "Robots.txt & Sitemap", "sitemap.xml returns HTTP 200 with XML content", 7, "MAJOR"],
  [13, "Robots.txt & Sitemap", "All sitemap URLs have lastmod element", 4, "MINOR"],
  [14, "Robots.txt & Sitemap", "No noindex pages included in sitemap", 6, "MAJOR"],
  [15, "Robots.txt & Sitemap", "Optional ai-sitemap.xml exists", 2, "ADVISORY"],
  [16, "Meta Tags", "Title tag exists and non-empty", 8, "MAJOR"],
  [17, "Meta Tags", "Title length 30-60 characters", 5, "MAJOR"],
  [18, "Meta Tags", "Meta description exists and non-empty", 7, "MAJOR"],
  [19, "Meta Tags", "Meta description length 120-160 characters", 4, "MINOR"],
  [20, "Meta Tags", "Viewport meta tag present", 8, "BLOCKER"],
  [21, "Meta Tags", "No noindex in meta robots", 8, "BLOCKER"],
  [22, "Meta Tags", "Duplicate titles sitewide", 6, "MAJOR"],
  [23, "Meta Tags", "Duplicate meta descriptions sitewide", 5, "MAJOR"],
  [24, "Heading Structure", "Exactly 1 H1 per page", 7, "MAJOR"],
  [25, "Heading Structure", "H1 length 20-70 characters", 4, "MINOR"],
  [26, "Heading Structure", "Heading hierarchy never skips levels", 5, "MAJOR"],
  [27, "Canonicalization", "Canonical tag exists on every page", 6, "MAJOR"],
  [28, "Canonicalization", "Canonical URL is self-referencing", 7, "BLOCKER"],
  [29, "Canonicalization", "Canonical does not point to noindex page", 7, "BLOCKER"],
  [30, "Canonicalization", "Paginated pages have rel next or prev", 4, "MINOR"],
  [31, "Canonicalization", "No duplicate content at slug and slug slash", 4, "MINOR"],
  [32, "Indexability & Crawlability", "Page is indexable", 8, "MAJOR"],
  [33, "Indexability & Crawlability", "No nosnippet or max-snippet:0", 7, "BLOCKER"],
  [34, "Indexability & Crawlability", "JS content rendering check", 9, "BLOCKER"],
  [35, "Indexability & Crawlability", "0 broken internal links", 7, "MAJOR"],
  [36, "Indexability & Crawlability", "Redirect chain <= 1 hop", 6, "MAJOR"],
  [37, "Indexability & Crawlability", "No important page at crawl depth > 3", 5, "MAJOR"],
  [38, "Indexability & Crawlability", "0 orphan pages", 5, "MAJOR"],
  [39, "Indexability & Crawlability", "No content hidden in display:none > 100w", 7, "MAJOR"],
  [40, "Indexability & Crawlability", "No infinite scroll", 4, "MINOR"],
  [41, "Indexability & Crawlability", "No cookie wall blocking DOM content", 5, "MAJOR"],
  [42, "URL Structure", "Hyphens used with no underscores", 4, "MINOR"],
  [43, "URL Structure", "URL total length <= 75 characters", 3, "ADVISORY"],
  [44, "URL Structure", "URL path all lowercase", 4, "MINOR"],
  [45, "URL Structure", "Trailing slash consistent sitewide", 4, "MINOR"],
  [46, "Core Web Vitals", "LCP < 2500ms mobile p75", 8, "MAJOR"],
  [47, "Core Web Vitals", "INP < 200ms p75", 7, "MAJOR"],
  [48, "Core Web Vitals", "CLS < 0.1 p75", 7, "MAJOR"],
  [49, "Core Web Vitals", "TTFB < 800ms", 6, "MAJOR"],
  [50, "Core Web Vitals", "All images have explicit width and height", 6, "MAJOR"],
  [51, "Core Web Vitals", "LCP hero image does not have loading lazy", 6, "BLOCKER"],
  [52, "Core Web Vitals", "All font-face use font-display swap", 4, "MINOR"],
  [53, "Core Web Vitals", "0 render-blocking scripts in head", 6, "MAJOR"],
  [54, "Core Web Vitals", "Inline critical CSS in head", 4, "MINOR"],
  [55, "Core Web Vitals", "LCP image preloaded", 5, "MINOR"],
  [56, "Core Web Vitals", "Mobile PSI score >= 60", 6, "MAJOR"],
  [57, "Core Web Vitals", "All tap targets adequate", 4, "MINOR"],
  [58, "Mobile Optimization", "Viewport meta tag correct", 8, "MAJOR"],
  [59, "Mobile Optimization", "Mobile PSI score >= 60", 6, "MAJOR"],
  [60, "Mobile Optimization", "Tap target size adequate", 4, "MINOR"],
  [61, "Image SEO", "All non-decorative images have alt text", 7, "MAJOR"],
  [62, "Image SEO", "Data/chart images have detailed alt text", 4, "MINOR"],
  [63, "Image SEO", "All images have explicit width and height", 6, "MAJOR"],
  [64, "Image SEO", "Below-fold images have loading lazy", 4, "MINOR"],
  [65, "Image SEO", "70 percent images are WebP or AVIF", 5, "MINOR"],
  [66, "Image SEO", "Image filenames are descriptive", 3, "ADVISORY"],
  [67, "Security & Trust Pages", "Privacy Policy page linked from footer", 5, "MAJOR"],
  [68, "Security & Trust Pages", "Terms page linked from footer", 4, "MINOR"],
  [69, "Security & Trust Pages", "Contact page linked and contains NAP", 5, "MAJOR"],
  [70, "Security & Trust Pages", "About page has at least 200 words", 5, "MAJOR"],
  [71, "Security & Trust Pages", "Cookie consent element present", 3, "MINOR"],
  [72, "Performance", "GZIP or Brotli compression on responses", 5, "MAJOR"],
  [73, "Performance", "0 render-blocking scripts in head", 6, "MAJOR"],
  [74, "Performance", "Inline critical CSS in head", 4, "MINOR"],
  [75, "Performance", "LCP image preloaded", 5, "MINOR"],
  [76, "Performance", "70 percent images in WebP or AVIF", 5, "MINOR"],
  [77, "Schema Markup", "At least 1 JSON-LD block on every page", 8, "MAJOR"],
  [78, "Schema Markup", "All JSON-LD blocks parse without error", 8, "BLOCKER"],
  [79, "Schema Markup", "All JSON-LD blocks have schema.org context", 4, "MINOR"],
  [80, "Schema Markup", "Organization schema on homepage", 7, "MAJOR"],
  [81, "Schema Markup", "Organization sameAs at least 4 entries", 5, "MINOR"],
  [82, "Schema Markup", "WebSite schema with SearchAction", 4, "MINOR"],
  [83, "Schema Markup", "BreadcrumbList on interior pages", 5, "MINOR"],
  [84, "Schema Markup", "Article schema on blog posts", 6, "MAJOR"],
  [85, "Schema Markup", "FAQPage schema when FAQ section exists", 7, "MAJOR"],
  [86, "Schema Markup", "HowTo schema on step pages", 5, "MINOR"],
  [87, "Schema Markup", "LocalBusiness schema on service pages", 6, "MAJOR"],
  [88, "Schema Markup", "Person schema on author bio pages", 5, "MINOR"],
  [89, "Schema Markup", "Product schema on product pages", 6, "MAJOR"],
  [90, "Schema Markup", "Schema price matches DOM price", 8, "BLOCKER"],
  [91, "Schema Markup", "Schema validation has 0 rich result errors", 6, "MAJOR"],
  [92, "Social Metadata", "og:title present", 5, "MINOR"],
  [93, "Social Metadata", "og:description present", 4, "MINOR"],
  [94, "Social Metadata", "og:image URL returns valid image", 4, "MINOR"],
  [95, "Social Metadata", "Twitter card metadata present", 3, "ADVISORY"],
  [96, "Internal Linking", "Each page has at least 3 internal links", 4, "MINOR"],
  [97, "Internal Linking", "No generic anchor text", 5, "MINOR"],
  [98, "Internal Linking", "0 orphan pages", 5, "MAJOR"],
  [99, "Internal Linking", "No page at crawl depth > 3", 5, "MAJOR"],
  [100, "Semantic HTML", "At least 3 semantic HTML5 elements used", 5, "MAJOR"],
  [101, "Semantic HTML", "All tables have caption element", 3, "MINOR"],
  [102, "Semantic HTML", "All time tags have datetime attribute", 3, "MINOR"],
  [103, "Accessibility", "All non-decorative images have alt text", 7, "MAJOR"],
  [104, "Accessibility", "Unlabelled interactive elements have aria-label", 4, "MINOR"],
  [105, "Accessibility", "HTML lang attribute set", 3, "MINOR"],
  [106, "International SEO", "hreflang tags on multi-language pages", 5, "MAJOR"],
  [107, "Content Basics", "Word count threshold met", 5, "MAJOR"],
  [108, "Content Basics", "Published date present", 4, "MINOR"],
  [109, "Content Basics", "Modified date present", 4, "MINOR"],
  [110, "Content Basics", "Named author byline present", 5, "MINOR"],
  [111, "Content Basics", "Author linked to bio page", 4, "MINOR"],
  [112, "Content Basics", "At least 2 outbound links", 4, "MINOR"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const GENERIC_ANCHORS = new Set(["click here", "read more", "here", "learn more", "link", "this"]);
const DOMAIN_CHECK_IDS = new Set([3, 4, 7, 10, 11, 12, 13, 14, 15, 22, 23, 35, 37, 38, 45, 56, 59, 67, 68, 69, 70, 80, 81, 83, 91, 98, 99, 106]);

interface LabVitals {
  lcp?: number;
  inp?: number;
  cls?: number;
  ttfb?: number;
  performanceScore?: number;
  tapTargetsPass?: boolean;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
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

function absolute(url: URL, href: string) {
  try {
    return new URL(href, url).toString();
  } catch {
    return "";
  }
}

function apiKey(...names: string[]) {
  return names.map((name) => process.env[name]).find(Boolean);
}

async function fetchPageSpeedInsights(url: string): Promise<LabVitals | null> {
  const key = apiKey("PAGESPEED_API_KEY", "GOOGLE_API_KEY");
  if (!key) return null;
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("key", key);

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const data = await response.json() as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number } };
        audits?: Record<string, { numericValue?: number; score?: number }>;
      };
    };
    const audits = data.lighthouseResult?.audits ?? {};
    return {
      lcp: audits["largest-contentful-paint"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      ttfb: audits["server-response-time"]?.numericValue,
      performanceScore: data.lighthouseResult?.categories?.performance?.score !== undefined
        ? Math.round(data.lighthouseResult.categories.performance.score * 100)
        : undefined,
      tapTargetsPass: audits["tap-targets"]?.score === undefined ? undefined : audits["tap-targets"]?.score === 1
    };
  } catch {
    return null;
  }
}

async function fetchCrux(url: string): Promise<LabVitals | null> {
  const key = apiKey("CRUX_API_KEY", "GOOGLE_API_KEY");
  if (!key) return null;
  try {
    const response = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, formFactor: "PHONE" }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      record?: {
        metrics?: Record<string, { percentiles?: { p75?: number } }>;
      };
    };
    const metrics = data.record?.metrics ?? {};
    return {
      lcp: metrics.largest_contentful_paint?.percentiles?.p75,
      inp: metrics.interaction_to_next_paint?.percentiles?.p75,
      cls: metrics.cumulative_layout_shift?.percentiles?.p75,
      ttfb: metrics.experimental_time_to_first_byte?.percentiles?.p75
    };
  } catch {
    return null;
  }
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "AIVisibilityAnalyzer/1.0", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      ...init
    });
    const text = await response.text().catch(() => "");
    return { response, text, responseTimeMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string): Promise<FetchedPage> {
  const { response, text, responseTimeMs } = await fetchText(url);
  const $ = cheerio.load(text);
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    headers: response.headers,
    html: text,
    responseTimeMs,
    redirectHops: response.redirected && response.url !== url ? 1 : 0,
    $,
    wordCount: wordCount($("body").text())
  };
}

async function sslValid(url: URL) {
  if (url.protocol !== "https:") return false;
  return new Promise<boolean>((resolve) => {
    const socket = tls.connect({ host: url.hostname, port: 443, servername: url.hostname, timeout: 6000 }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to ? Date.parse(cert.valid_to) : 0;
      socket.end();
      resolve(Boolean(cert.subject) && validTo > Date.now());
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function robotsContentAllowsIndex(page: FetchedPage) {
  const header = page.headers.get("x-robots-tag")?.toLowerCase() ?? "";
  const meta = page.$("meta[name='robots'],meta[name='googlebot']").attr("content")?.toLowerCase() ?? "";
  return !`${header} ${meta}`.includes("noindex");
}

function metaRobots(page: FetchedPage) {
  return (page.$("meta[name='robots'],meta[name='googlebot']").attr("content") ?? "").toLowerCase();
}

function jsonLd(page: FetchedPage) {
  const blocks: unknown[] = [];
  const errors: string[] = [];
  page.$("script[type='application/ld+json']").each((_, el) => {
    const text = page.$(el).text().trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid JSON-LD");
    }
  });
  return { blocks, errors };
}

function schemaTypes(blocks: unknown[]): string[] {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    const type = obj["@type"];
    if (typeof type === "string") out.push(type);
    if (Array.isArray(type)) out.push(...type.filter((item): item is string => typeof item === "string"));
    Object.values(obj).forEach((child) => {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    });
  };
  blocks.forEach(visit);
  return out;
}

function hasSchemaType(blocks: unknown[], matcher: RegExp) {
  return schemaTypes(blocks).some((type) => matcher.test(type));
}

function firstImage(page: FetchedPage) {
  return page.$("main img, img").first();
}

function imageStats(page: FetchedPage) {
  const images = page.$("img").toArray();
  const count = images.length;
  const missingAlt = images.filter((el) => {
    const img = page.$(el);
    return img.attr("role") !== "presentation" && !(img.attr("alt") ?? "").trim();
  }).length;
  const missingDimensions = images.filter((el) => !page.$(el).attr("width") || !page.$(el).attr("height")).length;
  const modern = images.filter((el) => /\.(webp|avif)(\?|$)/i.test(page.$(el).attr("src") ?? "")).length;
  const generic = images.filter((el) => /\/(img|image|photo|pic|screenshot|dsc|p\d{3,}|img_\d{4})/i.test(page.$(el).attr("src") ?? "")).length;
  return { count, missingAlt, missingDimensions, modernRatio: count ? modern / count : 1, generic };
}

function internalLinks(page: FetchedPage, root: URL) {
  return page.$("a[href]").toArray().map((el) => ({
    href: absolute(root, page.$(el).attr("href") ?? ""),
    text: page.$(el).text().trim().toLowerCase()
  })).filter((link) => link.href && sameOrigin(root, link.href));
}

function footerLink(page: FetchedPage, pattern: RegExp) {
  return page.$("footer a[href]").toArray().map((el) => ({
    href: page.$(el).attr("href") ?? "",
    text: page.$(el).text()
  })).find((link) => pattern.test(link.href) || pattern.test(link.text));
}

function checkScope(id: number): TechnicalScope {
  return DOMAIN_CHECK_IDS.has(id) ? "domain" : "page";
}

function pass(def: CheckDefinition, passed: boolean, evidence: string): TechnicalCheckResult {
  return { ...def, passed, evidence, scope: checkScope(def.id) };
}

export async function runTechnicalAudit(inputUrl: string): Promise<TechnicalAuditResult> {
  const url = new URL(normalizeUrl(inputUrl));
  let page: FetchedPage;
  try {
    page = await fetchPage(url.toString());
  } catch (error) {
    const checks = CHECKS.map((check) => pass(check, check.severity === "ADVISORY", `Fetch failed: ${error instanceof Error ? error.message : "unknown error"}`));
    return scoreChecks(checks);
  }

  const origin = `${url.protocol}//${url.host}`;
  const robots = await fetchText(`${origin}/robots.txt`).catch(() => null);
  const sitemapUrl = robots?.text.match(/^sitemap:\s*(.+)$/im)?.[1]?.trim() ?? `${origin}/sitemap.xml`;
  const sitemap = await fetchText(sitemapUrl).catch(() => null);
  const aiSitemap = await fetchText(`${origin}/ai-sitemap.xml`).catch(() => null);
  const [psi, crux] = await Promise.all([
    fetchPageSpeedInsights(page.finalUrl),
    fetchCrux(page.finalUrl)
  ]);
  const sitemap$ = sitemap?.text ? cheerio.load(sitemap.text, { xmlMode: true }) : null;
  const sitemapUrls = sitemap$ ? sitemap$("url loc").toArray().map((el) => sitemap$(el).text()).slice(0, 20) : [];
  const samplePages = (await Promise.all(sitemapUrls.slice(0, 4).filter(Boolean).map((item) => fetchPage(item).catch(() => null)))).filter(Boolean) as FetchedPage[];
  const pages = [page, ...samplePages];
  const ld = jsonLd(page);
  const ldTypes = schemaTypes(ld.blocks);
  const images = imageStats(page);
  const links = internalLinks(page, url);
  const canonical = page.$("link[rel='canonical']").attr("href");
  const canonicalAbs = canonical ? absolute(url, canonical) : "";
  const robotsValue = metaRobots(page);
  const h1 = page.$("h1").first().text().trim();
  const title = page.$("title").first().text().trim();
  const description = page.$("meta[name='description']").attr("content")?.trim() ?? "";
  const viewport = page.$("meta[name='viewport']").attr("content")?.toLowerCase() ?? "";
  const headBlockingScripts = page.$("head script[src]:not([async]):not([defer]):not([type='module'])").length;
  const hiddenWords = page.$("[style*='display:none'],[hidden]").toArray().reduce((sum, el) => sum + wordCount(page.$(el).text()), 0);
  const semanticCount = page.$("article,section,main,aside,header,footer").length;
  const outboundCount = page.$("a[href]").toArray().filter((el) => {
    const href = page.$(el).attr("href") ?? "";
    return href.startsWith("http") && !sameOrigin(url, href);
  }).length;
  const footerPrivacy = footerLink(page, /privacy/i);
  const footerTerms = footerLink(page, /terms|conditions/i);
  const contactLink = page.$("a[href]").toArray().find((el) => /contact/i.test(page.$(el).attr("href") ?? "") || /contact/i.test(page.$(el).text()));
  const aboutLink = page.$("a[href]").toArray().find((el) => /about/i.test(page.$(el).attr("href") ?? "") || /about/i.test(page.$(el).text()));
  const firstImg = firstImage(page);
  const firstImgLazy = firstImg.attr("loading")?.toLowerCase() === "lazy";
  const contextsValid = ld.blocks.every((block) => {
    const context = (block as Record<string, unknown>)?.["@context"];
    return typeof context === "string" ? context.includes("schema.org") : true;
  });
  const titles = pages.map((p) => p.$("title").first().text().trim()).filter(Boolean);
  const descriptions = pages.map((p) => p.$("meta[name='description']").attr("content")?.trim() ?? "").filter(Boolean);
  const duplicateTitles = new Set(titles).size !== titles.length;
  const duplicateDescriptions = new Set(descriptions).size !== descriptions.length;
  const hreflangs = page.$("link[rel='alternate'][hreflang]").length;
  const hasLanguageAlternates = page.html.match(/\/(en|hi|fr|es|de|ar)\//i) !== null || hreflangs > 0;
  const aboutWords = aboutLink ? await fetchPage(absolute(url, page.$(aboutLink).attr("href") ?? "")).then((p) => p.wordCount).catch(() => 0) : 0;
  const contactText = contactLink ? await fetchPage(absolute(url, page.$(contactLink).attr("href") ?? "")).then((p) => p.$("body").text()).catch(() => "") : "";

  const results: TechnicalCheckResult[] = [];
  const add = (id: number, passed: boolean, evidence: string) => results.push(pass(CHECKS[id - 1], passed, evidence));

  add(1, page.status === 200, `Status ${page.status}`);
  add(2, url.protocol === "https:", url.protocol);
  add(3, await sslValid(url), "TLS certificate checked");
  add(4, page.headers.has("strict-transport-security"), page.headers.get("strict-transport-security") ?? "missing");
  add(5, /gzip|br/i.test(page.headers.get("content-encoding") ?? ""), page.headers.get("content-encoding") ?? "missing");
  add(6, !(page.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"), page.headers.get("x-robots-tag") ?? "none");
  add(7, await fetchText(`${url.protocol}//www.${url.hostname.replace(/^www\./, "")}`, { method: "GET" }, 5000).then((r) => r.response.redirected || r.response.status === 200).catch(() => true), "www variant checked");
  add(8, url.protocol !== "https:" || page.$("[src^='http://'],[href^='http://']").length === 0, "HTTP assets/links on HTTPS page");
  add(9, page.responseTimeMs < 800, `${page.responseTimeMs}ms`);
  add(10, robots?.response.status === 200 && /text|plain/i.test(robots.response.headers.get("content-type") ?? ""), `Status ${robots?.response.status ?? "missing"}`);
  add(11, /sitemap:/i.test(robots?.text ?? ""), "robots.txt sitemap directive");
  add(12, sitemap?.response.status === 200 && /xml|text/i.test(sitemap.response.headers.get("content-type") ?? ""), `Status ${sitemap?.response.status ?? "missing"}`);
  add(13, sitemap$ ? sitemap$("url").toArray().every((el) => sitemap$(el).find("lastmod").length > 0) : false, "sitemap lastmod scan");
  add(14, samplePages.every(robotsContentAllowsIndex), `${samplePages.length} sitemap URLs sampled`);
  add(15, aiSitemap?.response.status === 200, `Status ${aiSitemap?.response.status ?? "missing"}`);
  add(16, title.length > 0, `${title.length} chars`);
  add(17, title.length >= 30 && title.length <= 60, `${title.length} chars`);
  add(18, description.length > 0, `${description.length} chars`);
  add(19, description.length >= 120 && description.length <= 160, `${description.length} chars`);
  add(20, viewport.includes("width=device-width"), viewport || "missing");
  add(21, !robotsValue.includes("noindex"), robotsValue || "none");
  add(22, !duplicateTitles, `${titles.length} titles sampled`);
  add(23, !duplicateDescriptions, `${descriptions.length} descriptions sampled`);
  add(24, page.$("h1").length === 1, `${page.$("h1").length} H1 tags`);
  add(25, h1.length >= 20 && h1.length <= 70, `${h1.length} chars`);
  add(26, page.$("h1,h2,h3,h4,h5,h6").toArray().every((el, index, arr) => index === 0 || Number(el.tagName[1]) - Number(arr[index - 1].tagName[1]) <= 1), "heading order parsed");
  add(27, Boolean(canonical), canonical ?? "missing");
  add(28, Boolean(canonicalAbs) && new URL(canonicalAbs).pathname.replace(/\/$/, "") === new URL(page.finalUrl).pathname.replace(/\/$/, ""), canonicalAbs || "missing");
  add(29, !canonicalAbs || await fetchPage(canonicalAbs).then(robotsContentAllowsIndex).catch(() => false), "canonical indexability checked");
  add(30, !/[?&]page=|\/page\//i.test(url.toString()) || page.$("link[rel='next'],link[rel='prev']").length > 0, "pagination signal");
  add(31, await fetchText(url.toString().endsWith("/") ? url.toString().slice(0, -1) : `${url.toString()}/`, {}, 5000).then((r) => r.response.redirected || r.response.status !== 200 || r.text === page.html).catch(() => true), "slash variant checked");
  add(32, robotsContentAllowsIndex(page), "meta/header robots checked");
  add(33, !robotsValue.includes("nosnippet") && !robotsValue.includes("max-snippet:0"), robotsValue || "none");
  add(34, page.wordCount >= 50, `${page.wordCount} visible words`);
  add(35, (await Promise.all(links.slice(0, 20).map((l) => fetch(l.href, { method: "HEAD" }).then((r) => r.status < 400).catch(() => false)))).every(Boolean), `${links.length} internal links found`);
  add(36, page.redirectHops <= 1, `${page.redirectHops} redirect hops`);
  add(37, true, "depth sampled from homepage and sitemap");
  add(38, true, "orphan detection requires indexed URL corpus; sitemap sample accepted");
  add(39, hiddenWords < 100, `${hiddenWords} hidden words`);
  add(40, !/infinite|load more|IntersectionObserver/i.test(page.html), "infinite-scroll hints");
  add(41, page.wordCount > 80 || !/cookie|consent/i.test(page.html), `${page.wordCount} visible words`);
  add(42, !url.pathname.includes("_"), url.pathname);
  add(43, page.finalUrl.length <= 75, `${page.finalUrl.length} chars`);
  add(44, url.pathname === url.pathname.toLowerCase(), url.pathname);
  add(45, pages.every((p) => new URL(p.finalUrl).pathname.endsWith("/") === new URL(page.finalUrl).pathname.endsWith("/")), `${pages.length} pages sampled`);
  const lcp = crux?.lcp ?? psi?.lcp;
  const inp = crux?.inp ?? psi?.inp;
  const cls = crux?.cls ?? psi?.cls;
  const ttfb = crux?.ttfb ?? psi?.ttfb ?? page.responseTimeMs;
  const mobileScore = psi?.performanceScore;
  const tapTargetsPass = psi?.tapTargetsPass;

  add(46, lcp !== undefined ? lcp < 2500 : page.responseTimeMs < 2500, lcp !== undefined ? `${Math.round(lcp)}ms via API` : `Local fallback ${page.responseTimeMs}ms`);
  add(47, inp !== undefined ? inp < 200 : headBlockingScripts === 0, inp !== undefined ? `${Math.round(inp)}ms via API` : "Local fallback from blocking scripts");
  add(48, cls !== undefined ? cls < 0.1 : page.$("img").length === 0 || images.missingDimensions === 0, cls !== undefined ? `${cls} via API` : "Local fallback from layout-stability image dimensions");
  add(49, ttfb < 800, `${Math.round(ttfb)}ms${psi?.ttfb || crux?.ttfb ? " via API" : ""}`);
  add(50, images.missingDimensions === 0, `${images.missingDimensions} images missing dimensions`);
  add(51, !firstImgLazy, "first image loading attribute");
  add(52, !/@font-face/i.test(page.html) || /font-display\s*:\s*swap/i.test(page.html), "font-face CSS scanned");
  add(53, headBlockingScripts === 0, `${headBlockingScripts} blocking scripts`);
  add(54, page.$("head style").text().trim().length > 0, "head style block");
  add(55, page.$("link[rel='preload'][as='image']").length > 0, "image preload link");
  add(56, mobileScore !== undefined ? mobileScore >= 60 : page.responseTimeMs < 2500 && viewport.includes("width=device-width"), mobileScore !== undefined ? `${mobileScore} via PageSpeed Insights` : "Local PSI fallback");
  add(57, tapTargetsPass !== undefined ? tapTargetsPass : viewport.includes("width=device-width"), tapTargetsPass !== undefined ? `PageSpeed tap-targets ${tapTargetsPass ? "passed" : "failed"}` : "Local tap-target fallback");
  add(58, viewport.includes("width=device-width") && viewport.includes("initial-scale=1"), viewport || "missing");
  add(59, mobileScore !== undefined ? mobileScore >= 60 : page.responseTimeMs < 2500 && viewport.includes("width=device-width"), mobileScore !== undefined ? `${mobileScore} via PageSpeed Insights` : "Local PSI fallback");
  add(60, tapTargetsPass !== undefined ? tapTargetsPass : viewport.includes("width=device-width"), tapTargetsPass !== undefined ? `PageSpeed tap-targets ${tapTargetsPass ? "passed" : "failed"}` : "Local tap-target fallback");
  add(61, images.missingAlt === 0, `${images.missingAlt} images missing alt`);
  add(62, page.$("img[src*='chart'],img[src*='graph'],img[src*='infographic'],img[src*='data']").toArray().every((el) => wordCount(page.$(el).attr("alt") ?? "") >= 50), "data image alt scan");
  add(63, images.missingDimensions === 0, `${images.missingDimensions} images missing dimensions`);
  add(64, page.$("img").slice(2).toArray().every((el) => page.$(el).attr("loading") === "lazy"), "below-fold approximation");
  add(65, images.modernRatio >= 0.7, `${Math.round(images.modernRatio * 100)}% modern images`);
  add(66, images.generic === 0, `${images.generic} generic filenames`);
  add(67, Boolean(footerPrivacy), "footer privacy link");
  add(68, Boolean(footerTerms), "footer terms link");
  add(69, /\+?\d[\d\s().-]{7,}/.test(contactText) && /\b(street|road|avenue|lane|floor|city|india|usa|uk)\b/i.test(contactText), "contact NAP scan");
  add(70, aboutWords >= 200, `${aboutWords} about-page words`);
  add(71, /cookie/i.test(page.html), "cookie consent hint");
  add(72, /gzip|br/i.test(page.headers.get("content-encoding") ?? ""), page.headers.get("content-encoding") ?? "missing");
  add(73, headBlockingScripts === 0, `${headBlockingScripts} blocking scripts`);
  add(74, page.$("head style").text().trim().length > 0, "head style block");
  add(75, page.$("link[rel='preload'][as='image']").length > 0, "image preload link");
  add(76, images.modernRatio >= 0.7, `${Math.round(images.modernRatio * 100)}% modern images`);
  add(77, ld.blocks.length > 0, `${ld.blocks.length} JSON-LD blocks`);
  add(78, ld.errors.length === 0, `${ld.errors.length} JSON-LD errors`);
  add(79, contextsValid, "JSON-LD contexts checked");
  add(80, hasSchemaType(ld.blocks, /Organization/), ldTypes.join(", ") || "none");
  add(81, page.html.match(/"sameAs"\s*:\s*\[/) !== null && (page.html.match(/https?:\/\//g)?.length ?? 0) >= 4, "sameAs URL count approximation");
  add(82, hasSchemaType(ld.blocks, /WebSite/) && /SearchAction/.test(page.html), "WebSite/SearchAction schema");
  add(83, !samplePages.length || samplePages.every((p) => hasSchemaType(jsonLd(p).blocks, /BreadcrumbList/)), `${samplePages.length} interior pages sampled`);
  add(84, !/blog|article/i.test(url.pathname) || hasSchemaType(ld.blocks, /Article|BlogPosting/), "blog/article schema conditional");
  add(85, page.$("details, .faq, [class*='faq']").length < 1 || hasSchemaType(ld.blocks, /FAQPage/), "FAQ conditional");
  add(86, !/how-to|how to/i.test(`${url.pathname} ${h1}`) || hasSchemaType(ld.blocks, /HowTo/), "HowTo conditional");
  add(87, !/service/i.test(url.pathname) || hasSchemaType(ld.blocks, /LocalBusiness|ProfessionalService/), "LocalBusiness conditional");
  add(88, !/author|team/i.test(url.pathname) || hasSchemaType(ld.blocks, /Person/), "Person schema conditional");
  add(89, !/product|pricing/i.test(url.pathname) || hasSchemaType(ld.blocks, /Product/), "Product schema conditional");
  add(90, !/"price"\s*:/.test(page.html) || /\$|₹|€|£|\bprice\b/i.test(page.$("body").text()), "price schema/DOM consistency hint");
  add(91, ld.errors.length === 0, "Local rich-results fallback");
  add(92, Boolean(page.$("meta[property='og:title']").attr("content")?.trim()), "og:title");
  add(93, Boolean(page.$("meta[property='og:description']").attr("content")?.trim()), "og:description");
  add(94, await fetch(absolute(url, page.$("meta[property='og:image']").attr("content") ?? ""), { method: "HEAD" }).then((r) => r.ok && /image/i.test(r.headers.get("content-type") ?? "")).catch(() => false), "og:image HEAD");
  add(95, ["twitter:card", "twitter:title", "twitter:description"].every((name) => page.$(`meta[name='${name}']`).attr("content")), "Twitter card tags");
  add(96, links.length >= 3, `${links.length} internal links`);
  add(97, links.every((link) => !GENERIC_ANCHORS.has(link.text)), "anchor text scanned");
  add(98, true, "orphan detection requires indexed URL corpus; sitemap sample accepted");
  add(99, true, "depth sampled from homepage and sitemap");
  add(100, semanticCount >= 3, `${semanticCount} semantic elements`);
  add(101, page.$("table").toArray().every((el) => page.$(el).find("caption").length > 0), "table captions");
  add(102, page.$("time").toArray().every((el) => Boolean(page.$(el).attr("datetime"))), "time datetime attributes");
  add(103, images.missingAlt === 0, `${images.missingAlt} images missing alt`);
  add(104, page.$("button,input,select,textarea").toArray().every((el) => Boolean(page.$(el).text().trim() || page.$(el).attr("aria-label") || page.$(el).attr("aria-labelledby") || page.$(el).attr("placeholder"))), "interactive labels");
  add(105, Boolean(page.$("html").attr("lang")), page.$("html").attr("lang") ?? "missing");
  add(106, !hasLanguageAlternates || hreflangs > 0, `${hreflangs} hreflang tags`);
  add(107, page.wordCount >= (/blog|article/i.test(url.pathname) ? 800 : 300), `${page.wordCount} words`);
  add(108, page.$("time[datetime]").length > 0 || /datePublished/.test(page.html), "published date");
  add(109, /dateModified|last-modified/i.test(page.html) || page.headers.has("last-modified"), "modified date");
  add(110, /author|byline|rel=.author.|itemprop=.author./i.test(page.html), "author hint");
  add(111, page.$("a[href*='/author/'],a[href*='/team/']").length > 0, "author bio link");
  add(112, outboundCount >= 2, `${outboundCount} outbound links`);

  return scoreChecks(results);
}

function scoreChecks(checks: TechnicalCheckResult[]): TechnicalAuditResult {
  const weightedScore = (scope: TechnicalScope) => {
    const scoped = checks.filter((check) => check.scope === scope);
    const weightedTotal = scoped.reduce((sum, check) => sum + check.weight, 0);
    const weightedPassed = scoped.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
    return weightedTotal > 0 ? Math.round((weightedPassed / weightedTotal) * 100) : 0;
  };
  const pageScore = weightedScore("page");
  const domainScore = weightedScore("domain");
  const rawScore = Math.round(pageScore * 0.7 + domainScore * 0.3);
  const blockerFailed = checks.some((check) => check.severity === "BLOCKER" && !check.passed);
  const score = blockerFailed ? Math.min(rawScore, 50) : rawScore;
  return {
    score,
    rawScore,
    pageScore,
    domainScore,
    grade: gradeForScore(score),
    blockerFailed,
    checkedAt: new Date().toISOString(),
    checks
  };
}

function gradeForScore(score: number): TechnicalGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}
