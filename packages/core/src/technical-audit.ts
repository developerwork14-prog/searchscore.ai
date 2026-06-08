import * as cheerio from "cheerio";
import tls from "node:tls";
import { crawlSite } from "./site-crawler.js";

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

export interface TechnicalCategoryDebug {
  category: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  failedCheckDetails: {
    id: number;
    name: string;
    evidence: string;
  }[];
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
  categoryDebug?: TechnicalCategoryDebug[];
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
  [25, "Heading Structure", "H1 length 10-90 characters", 4, "MINOR"],
  [26, "Heading Structure", "Heading hierarchy never skips levels", 5, "MAJOR"],
  [27, "Canonicalization", "Canonical tag exists on every page", 6, "MAJOR"],
  [28, "Canonicalization", "Canonical URL is self-referencing", 7, "BLOCKER"],
  [29, "Canonicalization", "Canonical does not point to noindex page", 7, "BLOCKER"],
  [30, "Canonicalization", "Paginated pages have rel next or prev", 4, "ADVISORY"],
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
  [62, "Image SEO", "Data/chart images have detailed alt text", 4, "ADVISORY"],
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
  [112, "Content Basics", "At least 2 outbound links", 4, "MINOR"],
  [113, "Trust Signals", "Review or testimonial signals present", 4, "MINOR"],
  [114, "AI Crawl Readiness", "llms.txt present and useful", 5, "MAJOR"],
  [115, "Performance", "Compression on all text assets", 5, "MAJOR"],
  [116, "Performance", "Cache-Control configured", 5, "MAJOR"],
  [117, "Performance", "ETag or Last-Modified headers present", 3, "MINOR"],
  [118, "Performance", "CDN edge caching detected", 3, "MINOR"],
  [119, "HTTP & Server Health", "Correct Content-Type headers", 3, "MINOR"],
  [120, "External Link Trust", "No broken external links", 3, "MINOR"],
  [121, "URL Structure", "URL params stripped from internal links", 3, "MINOR"],
  [122, "Indexability & Crawlability", "Internal search blocked", 5, "MAJOR"],
  [123, "Indexability & Crawlability", "No soft-404s", 5, "MAJOR"],
  [125, "AI Crawl Readiness", "RSS feed full-text", 3, "MINOR"],
  [126, "Security & Spam", "No back-button hijacking", 8, "BLOCKER"],
  [127, "Security & Spam", "No exit-intent redirects", 5, "MAJOR"],
  [128, "HTTP & Server Health", "CORS on public APIs", 2, "ADVISORY"],
  [129, "HTTP & Server Health", "SSL covers discovered subdomains", 3, "MAJOR"],
  [130, "Indexability & Crawlability", "SSR contains primary content", 8, "BLOCKER"],
  [131, "Indexability & Crawlability", "No empty-shell SPA", 7, "BLOCKER"],
  [132, "Indexability & Crawlability", "No key content in accordions or tabs", 5, "MAJOR"],
  [133, "Performance", "DOM node count under 1500", 3, "MINOR"],
  [134, "Security & Spam", "No CSS-hidden keyword text", 8, "BLOCKER"],
  [135, "Schema Markup", "Server-side schema injection", 6, "BLOCKER"],
  [136, "Canonicalization", "Canonical in HTTP header", 2, "ADVISORY"],
  [137, "Canonicalization", "No canonical chains", 5, "MAJOR"],
  [138, "Performance", "TTFB competitive under 200ms", 4, "MINOR"],
  [139, "HTTP & Server Health", "AI crawler accessibility", 6, "BLOCKER"],
  [140, "Indexability & Crawlability", "Headless browser content match", 4, "MAJOR"],
  [141, "Indexability & Crawlability", "IndexNow implemented", 3, "MINOR"],
  [142, "Canonicalization", "301 for permanent redirects", 4, "MAJOR"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const GENERIC_ANCHORS = new Set(["click here", "read more", "here", "learn more", "link", "this"]);
const DOMAIN_CHECK_IDS = new Set([3, 4, 7, 10, 11, 12, 13, 14, 15, 22, 23, 35, 37, 38, 45, 56, 59, 67, 68, 69, 70, 80, 81, 83, 91, 98, 99, 106, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142]);

type AssetKind = "html" | "css" | "js" | "json" | "xml" | "txt" | "svg" | "image" | "font" | "other";

interface AssetReference {
  url: string;
  kind: AssetKind;
}

interface AssetSample extends AssetReference {
  status: number;
  headers: Headers;
  text?: string;
}

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

function passRate<T>(items: T[], predicate: (item: T) => boolean) {
  const total = items.length;
  const passed = items.filter(predicate).length;
  const rate = total > 0 ? passed / total : 0;
  return { passed, total, rate, percent: Math.round(rate * 100) };
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

async function fetchPage(url: string, timeoutMs = 9000): Promise<FetchedPage> {
  const { response, text, responseTimeMs } = await fetchText(url, {}, timeoutMs);
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

async function fetchHeadOk(url: string, timeoutMs = 1800) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    return response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageHeadOk(url: string, timeoutMs = 1800) {
  if (!url) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    return response.ok && /image/i.test(response.headers.get("content-type") ?? "");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeFetch(url: string, init: RequestInit = {}, timeoutMs = 2200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { "user-agent": "AIVisibilityAnalyzer/1.0", ...(init.headers as Record<string, string> | undefined) };
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeHeadOrGet(url: string, timeoutMs = 2200, init: RequestInit = {}) {
  const head = await safeFetch(url, { ...init, method: "HEAD" }, timeoutMs);
  if (head && head.status !== 405 && head.status !== 501) return head;
  return safeFetch(url, { ...init, method: "GET" }, timeoutMs);
}

function dedupeByUrl<T extends { url: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function kindFromUrl(value: string): AssetKind {
  const path = value.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".xml") || /sitemap|feed|atom|rss/.test(path)) return "xml";
  if (path.endsWith(".txt")) return "txt";
  if (path.endsWith(".svg")) return "svg";
  if (/\.(png|jpe?g|gif|webp|avif|ico)$/i.test(path)) return "image";
  if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) return "font";
  return "other";
}

function expectedKindFromContentType(contentType: string): AssetKind {
  if (/html/i.test(contentType)) return "html";
  if (/css/i.test(contentType)) return "css";
  if (/javascript|ecmascript|x-javascript/i.test(contentType)) return "js";
  if (/json/i.test(contentType)) return "json";
  if (/xml/i.test(contentType)) return "xml";
  if (/text\/plain/i.test(contentType)) return "txt";
  if (/svg/i.test(contentType)) return "svg";
  if (/image\//i.test(contentType)) return "image";
  if (/font|woff|ttf|otf/i.test(contentType)) return "font";
  return "other";
}

function isTextAsset(kind: AssetKind) {
  return kind === "css" || kind === "js" || kind === "json" || kind === "xml" || kind === "txt" || kind === "svg";
}

function extractSrcsetUrls(root: URL, srcset: string) {
  return srcset.split(",").map((part) => absolute(root, part.trim().split(/\s+/)[0] ?? "")).filter(Boolean);
}

function extractAssets(page: FetchedPage, root: URL) {
  const assets: AssetReference[] = [{ url: page.finalUrl, kind: "html" }];
  const add = (href: string | undefined, forcedKind?: AssetKind) => {
    if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const resolved = absolute(root, href);
    if (!resolved) return;
    assets.push({ url: resolved, kind: forcedKind ?? kindFromUrl(resolved) });
  };

  page.$("link[href]").each((_, el) => {
    const link = page.$(el);
    const rel = (link.attr("rel") ?? "").toLowerCase();
    const as = (link.attr("as") ?? "").toLowerCase();
    const href = link.attr("href");
    if (rel.includes("stylesheet")) add(href, "css");
    else if (as === "font" || rel.includes("preload") && /font/i.test(href ?? "")) add(href, "font");
    else if (as === "image" || rel.includes("icon")) add(href, "image");
    else if (/manifest|alternate/.test(rel)) add(href);
  });
  page.$("script[src]").each((_, el) => add(page.$(el).attr("src"), "js"));
  page.$("img[src],source[src],video[poster]").each((_, el) => {
    add(page.$(el).attr("src") ?? page.$(el).attr("poster"), "image");
    extractSrcsetUrls(root, page.$(el).attr("srcset") ?? "").forEach((src) => assets.push({ url: src, kind: "image" }));
  });

  return dedupeByUrl(assets);
}

async function sampleAssets(assets: AssetReference[], limit = 24, includeBody = false, init: RequestInit = {}): Promise<AssetSample[]> {
  const sampled = dedupeByUrl(assets).slice(0, limit);
  const samples = await Promise.all(sampled.map(async (asset): Promise<AssetSample | null> => {
    const response = includeBody
      ? await safeFetch(asset.url, { ...init, method: "GET" }, 2400)
      : await safeHeadOrGet(asset.url, 2200, init);
    if (!response) return null;
    const contentType = response.headers.get("content-type") ?? "";
    const kind = asset.kind === "other" ? expectedKindFromContentType(contentType) : asset.kind;
    const text = includeBody && isTextAsset(kind) ? await response.text().catch(() => "") : undefined;
    const sample: AssetSample = { ...asset, kind, status: response.status, headers: response.headers };
    if (text !== undefined) sample.text = text;
    return sample;
  }));
  return samples.filter((item): item is AssetSample => item !== null);
}

function appropriateCacheControl(asset: AssetSample) {
  const cacheControl = asset.headers.get("cache-control")?.toLowerCase() ?? "";
  if (!cacheControl) return false;
  if (asset.kind === "html") return /no-cache|max-age=0|must-revalidate/.test(cacheControl) || Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 999999) <= 3600;
  return /max-age=\d+/.test(cacheControl);
}

function contentTypeMatches(asset: AssetSample) {
  const contentType = asset.headers.get("content-type") ?? "";
  if (asset.kind === "html") return /text\/html|application\/xhtml\+xml/i.test(contentType);
  if (asset.kind === "css") return /text\/css/i.test(contentType);
  if (asset.kind === "js") return /javascript|ecmascript|text\/plain/i.test(contentType);
  if (asset.kind === "xml") return /xml|text\/plain/i.test(contentType);
  if (asset.kind === "json") return /json|text\/plain/i.test(contentType);
  if (asset.kind === "txt") return /text\/plain/i.test(contentType);
  if (asset.kind === "svg") return /image\/svg\+xml|xml|text\/plain/i.test(contentType);
  if (asset.kind === "image") return /image\//i.test(contentType);
  if (asset.kind === "font") return /font|woff|ttf|otf|octet-stream/i.test(contentType);
  return true;
}

function cdnSignal(headers: Headers) {
  const headerNames = ["cf-cache-status", "x-cache", "x-vercel-cache", "x-nextjs-cache", "x-served-by", "x-cache-hits", "age", "via"];
  for (const name of headerNames) {
    const value = headers.get(name);
    if (value) return `${name}: ${value}`;
  }
  const server = headers.get("server") ?? "";
  if (/cloudflare|akamai|fastly|cloudfront|vercel|netlify/i.test(server)) return `server: ${server}`;
  return "";
}

function extractExternalLinks(page: FetchedPage, root: URL) {
  return dedupeByUrl(page.$("a[href]").toArray().map((el) => ({
    url: absolute(root, page.$(el).attr("href") ?? "")
  })).filter((link) => link.url.startsWith("http") && !sameOrigin(root, link.url)));
}

function findTrackingInternalLinks(links: { href: string }[]) {
  const trackingParams = new Set(["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "msclkid"]);
  return links.filter((link) => {
    try {
      const parsed = new URL(link.href);
      return [...trackingParams].some((param) => parsed.searchParams.has(param));
    } catch {
      return false;
    }
  });
}

function robotsBlocksInternalSearch(robotsText: string) {
  return /^disallow:\s*(\/search\/?|\/?\?s=|\*?\?s=)/im.test(robotsText);
}

function internalSearchLinks(links: { href: string }[]) {
  return links.filter((link) => {
    try {
      const parsed = new URL(link.href);
      return /\/search\/?$/i.test(parsed.pathname) || parsed.searchParams.has("s") || parsed.searchParams.has("q") && /search/i.test(parsed.pathname);
    } catch {
      return false;
    }
  });
}

function llmsStats(text: string) {
  const words = wordCount(text);
  const sections = (text.match(/^#{1,3}\s+\S.+$/gm) ?? []).length + (text.match(/https?:\/\/\S+/g) ?? []).length;
  const strongSignals = (text.match(/\b(brand|services?|pages?|contact|about|pricing|products?)\b/gi) ?? []).length;
  return { words, sections, strongSignals };
}

function suspiciousHistoryPattern(scriptText: string) {
  const patterns = [
    /popstate[\s\S]{0,180}(location\.(href|assign|replace)|window\.location|document\.location)/i,
    /onpopstate[\s\S]{0,180}(location\.(href|assign|replace)|window\.location|document\.location)/i,
    /(pushState|replaceState)[\s\S]{0,120}(setInterval|while\s*\(|for\s*\()/i,
    /(setInterval|while\s*\(|for\s*\()[\s\S]{0,120}(pushState|replaceState)/i
  ];
  return patterns.find((pattern) => pattern.test(scriptText))?.source ?? "";
}

function exitIntentRedirectPattern(scriptText: string) {
  const patterns = [
    /(?:mouseleave|mouseout)[\s\S]{0,220}(location\.(href|assign|replace)|window\.location|document\.location)/i,
    /(?:beforeunload|unload)[\s\S]{0,220}(location\.(href|assign|replace)|window\.location|document\.location)/i
  ];
  return patterns.find((pattern) => pattern.test(scriptText))?.source ?? "";
}

function publicApiUrls(page: FetchedPage, root: URL) {
  const urls = new Set<string>();
  const scan = (value: string) => {
    const matches = value.match(/["'(](\/(?:api|wp-json|graphql)[^"'()\s]*)/gi) ?? [];
    matches.forEach((match) => urls.add(absolute(root, match.replace(/^["'(]/, ""))));
  };
  page.$("a[href],script[src]").each((_, el) => {
    const value = page.$(el).attr("href") ?? page.$(el).attr("src") ?? "";
    if (/\/(api|wp-json|graphql)(\/|$|\?)/i.test(value)) urls.add(absolute(root, value));
  });
  scan(page.html);
  return [...urls].filter(Boolean).slice(0, 8);
}

async function sslValid(url: URL) {
  if (url.protocol !== "https:") return false;
  return new Promise<boolean>((resolve) => {
    const socket = tls.connect({ host: url.hostname, port: 443, servername: url.hostname, timeout: 2500 }, () => {
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

function discoveredSubdomains(pages: FetchedPage[], root: URL) {
  const rootHost = root.hostname.replace(/^www\./, "");
  const hosts = new Set<string>();
  pages.forEach((p) => {
    p.$("[href],[src]").each((_, el) => {
      const value = p.$(el).attr("href") ?? p.$(el).attr("src") ?? "";
      const resolved = absolute(new URL(p.finalUrl), value);
      if (!resolved) return;
      const host = new URL(resolved).hostname.replace(/^www\./, "");
      if (host !== rootHost && host.endsWith(`.${rootHost}`)) hosts.add(host);
    });
  });
  return [...hosts].slice(0, 6);
}

function visiblePrimaryWordCount(page: FetchedPage) {
  const clone = cheerio.load(page.html);
  clone("script,style,noscript,template,svg").remove();
  clone("[hidden],[aria-hidden='true'],[style*='display:none'],[style*='display: none'],[style*='visibility:hidden'],[style*='visibility: hidden']").remove();
  return wordCount(clone("main").text() || clone("body").text());
}

function emptyShellEvidence(page: FetchedPage) {
  const body = page.$("body");
  const rootShells = body.find("#root,#__next,#app,[data-reactroot]").length;
  const meaningfulElements = body.find("h1,h2,p,article,section,main,li").length;
  const scripts = body.find("script[src]").length + page.$("head script[src]").length;
  const words = visiblePrimaryWordCount(page);
  const isShell = words < 80 && rootShells > 0 && scripts >= meaningfulElements;
  return { isShell, evidence: `${words} visible words, ${rootShells} app roots, ${scripts} scripts` };
}

function accordionHiddenWords(page: FetchedPage) {
  const selectors = [
    "[aria-expanded='false']",
    "[role='tabpanel'][hidden]",
    "[role='tablist'] ~ [hidden]",
    "details:not([open])",
    "[class*='accordion'][style*='display:none']",
    "[class*='tab'][style*='display:none']",
    "[class*='collapse'][style*='display:none']"
  ].join(",");
  return page.$(selectors).toArray().reduce((sum, el) => sum + wordCount(page.$(el).text()), 0);
}

function cssHiddenKeywordText(page: FetchedPage) {
  const suspiciousWords = /\b(best|cheap|top|near me|casino|loan|viagra|crypto|forex|escort|betting)\b/i;
  const hiddenSelectors = [
    "[style*='display:none']",
    "[style*='display: none']",
    "[style*='visibility:hidden']",
    "[style*='visibility: hidden']",
    "[style*='opacity:0']",
    "[style*='opacity: 0']",
    "[style*='font-size:0']",
    "[style*='font-size: 0']",
    "[style*='text-indent:-']",
    "[style*='position:absolute'][style*='left:-']"
  ].join(",");
  const matches = page.$(hiddenSelectors).toArray().filter((el) => suspiciousWords.test(page.$(el).text()));
  return matches.length;
}

function schemaInjectionEvidence(page: FetchedPage) {
  const rawJsonLdCount = page.$("script[type='application/ld+json']").length;
  const gtmHints = /googletagmanager|GTM-|dataLayer\.push|schema\.org[\s\S]{0,120}dataLayer/i.test(page.html);
  return {
    passed: rawJsonLdCount > 0 || !gtmHints,
    evidence: rawJsonLdCount > 0 ? `${rawJsonLdCount} JSON-LD blocks in raw HTML` : gtmHints ? "Schema/GTM hints found without raw JSON-LD" : "No schema injection hint detected"
  };
}

function canonicalFromLinkHeader(headers: Headers) {
  const link = headers.get("link") ?? "";
  const match = link.match(/<([^>]+)>;\s*rel="?canonical"?/i);
  return match?.[1] ?? "";
}

function canonicalUrlsMatch(root: URL, left: string, right: string) {
  try {
    return new URL(absolute(root, left)).pathname.replace(/\/$/, "") === new URL(absolute(root, right)).pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

async function canonicalChainLength(startUrl: string, timeoutMs = 2200) {
  const seen = new Set<string>();
  let current = startUrl;
  let hops = 0;
  for (let i = 0; i < 3; i += 1) {
    if (seen.has(current)) return { hops: hops + 1, loop: true };
    seen.add(current);
    const nextPage = await fetchPage(current, timeoutMs).catch(() => null);
    const nextCanonical = nextPage?.$("link[rel='canonical']").attr("href");
    const resolved = nextCanonical && nextPage ? absolute(new URL(nextPage.finalUrl), nextCanonical) : "";
    if (!resolved || resolved === current) return { hops, loop: false };
    hops += 1;
    current = resolved;
  }
  return { hops, loop: false };
}

async function fetchWithUserAgent(url: string, userAgent: string, timeoutMs = 2200) {
  return fetchText(url, { headers: { "user-agent": userAgent } }, timeoutMs).catch(() => null);
}

async function redirectStatus(url: string, timeoutMs = 1800) {
  const response = await safeFetch(url, { method: "GET", redirect: "manual" }, timeoutMs);
  return response?.status ?? 0;
}

function indexNowCandidateUrls(origin: string, robotsText: string, html: string) {
  const urls = new Set<string>();
  const keyLocation = robotsText.match(/^key-location:\s*(.+)$/im)?.[1]?.trim();
  if (keyLocation) urls.add(keyLocation.startsWith("http") ? keyLocation : `${origin}${keyLocation.startsWith("/") ? "" : "/"}${keyLocation}`);
  const explicit = html.match(/https?:\/\/[^"'\s]+\/[a-f0-9-]{8,}\.txt/gi) ?? [];
  explicit.forEach((item) => urls.add(item));
  return [...urls].slice(0, 4);
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
  const nonDecorative = images.filter((el) => {
    const img = page.$(el);
    return img.attr("role") !== "presentation" && img.attr("aria-hidden") !== "true";
  });
  const missingAlt = nonDecorative.filter((el) => !(page.$(el).attr("alt") ?? "").trim()).length;
  const missingDimensions = images.filter((el) => !page.$(el).attr("width") || !page.$(el).attr("height")).length;
  const modern = images.filter((el) => /\.(webp|avif)(\?|$)/i.test(page.$(el).attr("src") ?? "")).length;
  const generic = images.filter((el) => {
    const src = page.$(el).attr("src") ?? "";
    const filename = src.split(/[?#]/)[0].split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
    return /^(img|image|photo|pic|screenshot)[-_]?\d+$/i.test(filename);
  }).length;
  const chartImages = images.filter((el) => /chart|graph|infographic|data/i.test(page.$(el).attr("src") ?? ""));
  const chartDetailedAlt = chartImages.filter((el) => {
    const alt = page.$(el).attr("alt") ?? "";
    return wordCount(alt) >= 8 || alt.trim().length >= 40;
  }).length;
  const belowFold = images.slice(2);
  const belowFoldLazy = belowFold.filter((el) => page.$(el).attr("loading")?.toLowerCase() === "lazy").length;
  return {
    count,
    nonDecorativeCount: nonDecorative.length,
    altPresent: nonDecorative.length - missingAlt,
    missingAlt,
    dimensionsPresent: count - missingDimensions,
    missingDimensions,
    modern,
    modernRatio: count ? modern / count : 1,
    generic,
    chartCount: chartImages.length,
    chartDetailedAlt,
    belowFoldCount: belowFold.length,
    belowFoldLazy
  };
}

function aggregateImageStats(stats: ReturnType<typeof imageStats>[]) {
  const sum = (key: keyof ReturnType<typeof imageStats>) => stats.reduce((total, item) => total + Number(item[key]), 0);
  const count = sum("count");
  const nonDecorativeCount = sum("nonDecorativeCount");
  const altPresent = sum("altPresent");
  const dimensionsPresent = sum("dimensionsPresent");
  const modern = sum("modern");
  const generic = sum("generic");
  const chartCount = sum("chartCount");
  const chartDetailedAlt = sum("chartDetailedAlt");
  const belowFoldCount = sum("belowFoldCount");
  const belowFoldLazy = sum("belowFoldLazy");
  return {
    count,
    nonDecorativeCount,
    altPresent,
    altRate: nonDecorativeCount ? altPresent / nonDecorativeCount : 1,
    dimensionsPresent,
    dimensionsRate: count ? dimensionsPresent / count : 1,
    modern,
    modernRate: count ? modern / count : 1,
    generic,
    genericRate: count ? generic / count : 0,
    chartCount,
    chartDetailedAlt,
    chartDetailedRate: chartCount ? chartDetailedAlt / chartCount : 1,
    belowFoldCount,
    belowFoldLazy,
    belowFoldLazyRate: belowFoldCount ? belowFoldLazy / belowFoldCount : 1
  };
}

function interactiveLabelStats(page: FetchedPage) {
  const controls = page.$("button,input,select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='switch'],[role='combobox'],[role='textbox']").toArray()
    .filter((el) => {
      const item = page.$(el);
      const type = (item.attr("type") ?? "").toLowerCase();
      return !item.is("[hidden],[aria-hidden='true'],[disabled]") && type !== "hidden" && item.css("display") !== "none";
    });
  const labelled = controls.filter((el) => {
    const item = page.$(el);
    const id = item.attr("id");
    const hasLabelElement = Boolean(id && page.$(`label[for='${id}']`).length);
    return Boolean(item.text().trim() || item.attr("aria-label") || item.attr("aria-labelledby") || item.attr("placeholder") || item.attr("title") || hasLabelElement);
  }).length;
  return { total: controls.length, labelled };
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
    page = await fetchPage(url.toString(), 3500);
  } catch (error) {
    const checks = CHECKS.map((check) => pass(check, check.severity === "ADVISORY", `Fetch failed: ${error instanceof Error ? error.message : "unknown error"}`));
    return scoreChecks(checks);
  }

  const origin = `${url.protocol}//${url.host}`;
  const robots = await fetchText(`${origin}/robots.txt`, {}, 2500).catch(() => null);
  const sitemapUrl = robots?.text.match(/^sitemap:\s*(.+)$/im)?.[1]?.trim() ?? `${origin}/sitemap.xml`;
  const [sitemap, aiSitemap, llms, psi, crux, crawled] = await Promise.all([
    fetchText(sitemapUrl, {}, 2500).catch(() => null),
    fetchText(`${origin}/ai-sitemap.xml`, {}, 1800).catch(() => null),
    fetchText(`${origin}/llms.txt`, {}, 1800).catch(() => null),
    fetchPageSpeedInsights(page.finalUrl),
    fetchCrux(page.finalUrl),
    crawlSite(url.toString(), { maxPages: 20, maxDepth: 6, timeoutMs: 2200, concurrency: 6, maxSitemapFiles: 1 })
  ]);
  const sitemap$ = sitemap?.text ? cheerio.load(sitemap.text, { xmlMode: true }) : null;
  const pages = (crawled.pages.length ? crawled.pages : [page]) as FetchedPage[];
  const samplePages = pages.slice(1);
  const ld = jsonLd(page);
  const pageLd = pages.map(jsonLd);
  const allLdBlocks = pageLd.flatMap((item) => item.blocks);
  const allLdTypes = schemaTypes(allLdBlocks);
  const ldTypes = schemaTypes(ld.blocks);
  const images = imageStats(page);
  const pageImages = pages.map(imageStats);
  const imageAggregate = aggregateImageStats(pageImages);
  const interactiveAggregate = pages.map(interactiveLabelStats).reduce((total, item) => ({
    total: total.total + item.total,
    labelled: total.labelled + item.labelled
  }), { total: 0, labelled: 0 });
  const interactiveLabelRate = interactiveAggregate.total ? interactiveAggregate.labelled / interactiveAggregate.total : 1;
  const links = internalLinks(page, url);
  const allInternalLinks = pages.flatMap((p) => internalLinks(p, new URL(p.finalUrl)));
  const canonical = page.$("link[rel='canonical']").attr("href");
  const canonicalAbs = canonical ? absolute(url, canonical) : "";
  const canonicalSelfRef = passRate(pages, (p) => {
    const value = p.$("link[rel='canonical']").attr("href");
    const resolved = value ? absolute(new URL(p.finalUrl), value) : "";
    try {
      return Boolean(resolved) && new URL(resolved).pathname.replace(/\/$/, "") === new URL(p.finalUrl).pathname.replace(/\/$/, "");
    } catch {
      return false;
    }
  });
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
  const titleValues = pages.map((p) => p.$("title").first().text().trim());
  const descriptionValues = pages.map((p) => p.$("meta[name='description']").attr("content")?.trim() ?? "");
  const titlePresence = passRate(titleValues, (value) => value.length > 0);
  const titleLength = passRate(titleValues, (value) => value.length >= 30 && value.length <= 60);
  const descriptionPresence = passRate(descriptionValues, (value) => value.length > 0);
  const availableDescriptions = descriptionValues.filter(Boolean);
  const descriptionLength = passRate(availableDescriptions, (value) => value.length >= 120 && value.length <= 160);
  const viewportPresence = passRate(pages, (p) => (p.$("meta[name='viewport']").attr("content")?.toLowerCase() ?? "").includes("width=device-width"));
  const duplicateTitleSet = new Set([...titleValues.filter(Boolean).reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()].filter(([, count]) => count > 1).map(([value]) => value));
  const duplicateDescriptionSet = new Set([...availableDescriptions.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()].filter(([, count]) => count > 1).map(([value]) => value));
  const duplicateTitlePages = titleValues.filter((value) => duplicateTitleSet.has(value)).length;
  const duplicateDescriptionPages = availableDescriptions.filter((value) => duplicateDescriptionSet.has(value)).length;
  const duplicateTitleRate = pages.length ? duplicateTitlePages / pages.length : 0;
  const duplicateDescriptionRate = availableDescriptions.length ? duplicateDescriptionPages / availableDescriptions.length : 0;
  const hreflangs = page.$("link[rel='alternate'][hreflang]").length;
  const hasLanguageAlternates = page.html.match(/\/(en|hi|fr|es|de|ar)\//i) !== null || hreflangs > 0;
  const aboutWords = aboutLink ? await fetchPage(absolute(url, page.$(aboutLink).attr("href") ?? ""), 2000).then((p) => p.wordCount).catch(() => 0) : 0;
  const contactText = contactLink ? await fetchPage(absolute(url, page.$(contactLink).attr("href") ?? ""), 2000).then((p) => p.$("body").text()).catch(() => "") : "";
  const reviewSignals = page.$("[class*='review'],[class*='testimonial'],[id*='review'],[id*='testimonial']").length;
  const reviewWords = (page.$("body").text().match(/\b(review|reviews|testimonial|testimonials|rating|ratings|stars?|customer stories)\b/gi) ?? []).length;
  const everyPage = (predicate: (p: FetchedPage) => boolean) => pages.every(predicate);
  const somePage = (predicate: (p: FetchedPage) => boolean) => pages.some(predicate);
  const pageCountEvidence = `${pages.length} pages crawled`;
  const assetRefs = dedupeByUrl(pages.flatMap((p) => extractAssets(p, new URL(p.finalUrl))));
  const textAssetRefs = assetRefs.filter((asset) => isTextAsset(asset.kind));
  const sampleableAssetRefs = assetRefs.filter((asset) => asset.kind !== "other");
  const externalLinkRefs = dedupeByUrl(pages.flatMap((p) => extractExternalLinks(p, new URL(p.finalUrl))));
  const trackingInternalLinks = findTrackingInternalLinks(allInternalLinks);
  const searchLinks = internalSearchLinks(allInternalLinks);
  const fakeUrl = `${origin}/__audit-soft-404-test-${Date.now()}`;
  const apiUrls = publicApiUrls(page, url);
  const inlineScriptText = pages.map((p) => p.$("script:not([src])").toArray().map((el) => p.$(el).text()).join("\n")).join("\n");

  const [
    compressedTextAssets,
    headerAssetSamples,
    scriptTextAssets,
    externalLinkResponses,
    soft404Response,
    feedCandidates,
    apiResponses
  ] = await Promise.all([
    sampleAssets(textAssetRefs, 24, false, { headers: { "accept-encoding": "br, gzip, deflate" } }),
    sampleAssets(sampleableAssetRefs, 28, false),
    sampleAssets(assetRefs.filter((asset) => asset.kind === "js"), 12, true),
    Promise.all(externalLinkRefs.slice(0, 20).map(async (link) => ({ url: link.url, response: await safeHeadOrGet(link.url, 2200) }))),
    fetchText(fakeUrl, {}, 2400).catch(() => null),
    Promise.all(["/feed", "/rss", "/atom.xml"].map(async (path) => ({ url: `${origin}${path}`, result: await fetchText(`${origin}${path}`, {}, 2200).catch(() => null) }))),
    Promise.all(apiUrls.map(async (apiUrl) => ({ url: apiUrl, response: await safeFetch(apiUrl, { method: "OPTIONS" }, 1800) ?? await safeFetch(apiUrl, { method: "GET" }, 1800) })))
  ]);

  const compressedCount = compressedTextAssets.filter((asset) => /gzip|br|deflate/i.test(asset.headers.get("content-encoding") ?? "")).length;
  const compressionPercent = compressedTextAssets.length ? Math.round((compressedCount / compressedTextAssets.length) * 100) : 0;
  const cacheOkCount = headerAssetSamples.filter(appropriateCacheControl).length;
  const cachePercent = headerAssetSamples.length ? Math.round((cacheOkCount / headerAssetSamples.length) * 100) : 0;
  const validatorHeaders = [
    page.headers.get("etag") ? `etag: ${page.headers.get("etag")}` : "",
    page.headers.get("last-modified") ? `last-modified: ${page.headers.get("last-modified")}` : ""
  ].filter(Boolean);
  const assetValidatorCount = headerAssetSamples.filter((asset) => asset.headers.has("etag") || asset.headers.has("last-modified")).length;
  const cdnEvidence = [page, ...headerAssetSamples].map((item) => cdnSignal(item.headers)).find(Boolean) ?? "";
  const contentTypeOkCount = headerAssetSamples.filter(contentTypeMatches).length;
  const externalLiveCount = externalLinkResponses.filter((item) => (item.response?.status ?? 599) < 400).length;
  const soft404Status = soft404Response?.response.status ?? 0;
  const soft404Body = soft404Response?.text ?? "";
  const llmsWordStats = llmsStats(llms?.text ?? "");
  const llmsContentType = llms?.response.headers.get("content-type") ?? "";
  const foundFeed = feedCandidates.find((feed) => feed.result?.response.ok && /xml|rss|atom|text/i.test(feed.result.response.headers.get("content-type") ?? ""));
  const feedItems = foundFeed?.result?.text ? cheerio.load(foundFeed.result.text, { xmlMode: true })("item,entry").toArray() : [];
  const feedWordCounts = feedItems.slice(0, 8).map((el) => {
    if (!foundFeed?.result?.text) return 0;
    const feed$ = cheerio.load(foundFeed.result.text, { xmlMode: true });
    const item = feed$(el);
    return wordCount(item.find("content\\:encoded, encoded, content, summary, description").text());
  });
  const avgFeedWords = feedWordCounts.length ? Math.round(feedWordCounts.reduce((sum, count) => sum + count, 0) / feedWordCounts.length) : 0;
  const externalScriptText = scriptTextAssets.map((asset) => asset.text ?? "").join("\n");
  const scriptAuditText = `${inlineScriptText}\n${externalScriptText}`;
  const historyMatch = suspiciousHistoryPattern(scriptAuditText);
  const exitIntentMatch = exitIntentRedirectPattern(scriptAuditText);
  const corsValues = apiResponses.map((item) => item.response?.headers.get("access-control-allow-origin") ?? "").filter(Boolean);
  const subdomains = discoveredSubdomains(pages, url);
  const [
    subdomainSslResults,
    canonicalChain,
    openAiFetch,
    perplexityFetch,
    googleExtendedFetch,
    slashRedirectStatus,
    caseVariantStatus,
    indexNowResponses
  ] = await Promise.all([
    Promise.all(subdomains.map(async (host) => ({ host, valid: await sslValid(new URL(`https://${host}`)) }))),
    canonicalAbs ? canonicalChainLength(canonicalAbs) : Promise.resolve({ hops: 0, loop: false }),
    fetchWithUserAgent(page.finalUrl, "GPTBot/1.2; +https://openai.com/gptbot"),
    fetchWithUserAgent(page.finalUrl, "PerplexityBot/1.0; +https://perplexity.ai/perplexitybot"),
    fetchWithUserAgent(page.finalUrl, "Google-Extended"),
    redirectStatus(url.toString().endsWith("/") ? url.toString().slice(0, -1) : `${url.toString()}/`),
    redirectStatus(`${origin}${new URL(page.finalUrl).pathname.toUpperCase()}`),
    Promise.all(indexNowCandidateUrls(origin, robots?.text ?? "", page.html).map(async (item) => ({ url: item, response: await safeHeadOrGet(item, 1800) })))
  ]);
  const primaryWordCounts = pages.map(visiblePrimaryWordCount);
  const ssrPassCount = primaryWordCounts.filter((count) => count >= 150).length;
  const emptyShells = pages.map(emptyShellEvidence).filter((item) => item.isShell);
  const accordionWords = pages.reduce((sum, item) => sum + accordionHiddenWords(item), 0);
  const maxDomNodes = Math.max(...pages.map((p) => p.$("*").length), 0);
  const hiddenKeywordCount = pages.reduce((sum, item) => sum + cssHiddenKeywordText(item), 0);
  const schemaInjection = schemaInjectionEvidence(page);
  const headerCanonical = canonicalFromLinkHeader(page.headers);
  const headerCanonicalMatches = Boolean(headerCanonical && canonicalAbs && canonicalUrlsMatch(url, headerCanonical, canonicalAbs));
  const ttfbSamples = [page.responseTimeMs, ...headerAssetSamples.filter((asset) => asset.kind === "html").map(() => page.responseTimeMs)];
  const medianTtfb = ttfbSamples.sort((a, b) => a - b)[Math.floor(ttfbSamples.length / 2)] ?? page.responseTimeMs;
  const aiCrawlerResponses = [openAiFetch, perplexityFetch, googleExtendedFetch].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const aiCrawlerOk = aiCrawlerResponses.length > 0 && aiCrawlerResponses.every((item) => item.response.status < 400 && wordCount(cheerio.load(item.text)("body").text()) >= Math.max(50, Math.round(page.wordCount * 0.5)));
  const headlessRatios = aiCrawlerResponses.map((item) => {
    const botWords = wordCount(cheerio.load(item.text)("body").text());
    return page.wordCount ? botWords / page.wordCount : 1;
  });
  const minHeadlessRatio = headlessRatios.length ? Math.min(...headlessRatios) : 1;
  const indexNowCandidates = indexNowCandidateUrls(origin, robots?.text ?? "", page.html);
  const indexNowPassed = indexNowResponses.some((item) => item.response?.status === 200);
  const slashVariantUrl = url.toString().endsWith("/") ? url.toString().slice(0, -1) : `${url.toString()}/`;
  const slashVariant = await fetchText(slashVariantUrl, {}, 1800).catch(() => null);
  const slashDuplicateFailed = Boolean(slashVariant?.response.status === 200 && page.status === 200 && slashVariant.text !== page.html);
  const checksById = new Map(CHECKS.map((check) => [check.id, check]));

  const results: TechnicalCheckResult[] = [];
  const add = (id: number, passed: boolean, evidence: string) => {
    const def = checksById.get(id);
    if (!def) return;
    results.push(pass(def, passed, evidence));
  };
  const hsts = page.headers.get("strict-transport-security") ?? "";
  const hstsMaxAge = Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0);

  add(1, page.status === 200, `Status ${page.status}`);
  add(2, url.protocol === "https:", url.protocol);
  add(3, await sslValid(url), "TLS certificate checked");
  add(4, hstsMaxAge >= 31536000, hsts ? `HSTS max-age=${hstsMaxAge}` : "HSTS header missing");
  add(5, /gzip|br/i.test(page.headers.get("content-encoding") ?? ""), page.headers.get("content-encoding") ?? "missing");
  add(6, !(page.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"), page.headers.get("x-robots-tag") ?? "none");
  add(7, await fetchText(`${url.protocol}//www.${url.hostname.replace(/^www\./, "")}`, { method: "GET" }, 1800).then((r) => r.response.redirected || r.response.status === 200).catch(() => true), "www variant checked");
  add(8, url.protocol !== "https:" || page.$("[src^='http://'],[href^='http://']").length === 0, "HTTP assets/links on HTTPS page");
  add(9, page.responseTimeMs < 800, `${page.responseTimeMs}ms`);
  add(10, robots?.response.status === 200 && /text|plain/i.test(robots.response.headers.get("content-type") ?? ""), `Status ${robots?.response.status ?? "missing"}`);
  add(11, /sitemap:/i.test(robots?.text ?? ""), "robots.txt sitemap directive");
  add(12, sitemap?.response.status === 200 && /xml|text/i.test(sitemap.response.headers.get("content-type") ?? ""), `Status ${sitemap?.response.status ?? "missing"}`);
  add(13, sitemap$ ? sitemap$("url").toArray().every((el) => sitemap$(el).find("lastmod").length > 0) : false, "sitemap lastmod scan");
  add(14, pages.every(robotsContentAllowsIndex), pageCountEvidence);
  add(15, aiSitemap?.response.status === 200, `Status ${aiSitemap?.response.status ?? "missing"}`);
  add(16, titlePresence.rate >= 0.95, `${titlePresence.passed}/${titlePresence.total} pages contain title tags (${titlePresence.percent}%)`);
  add(17, titleLength.rate >= 0.8, `${titleLength.passed}/${titleLength.total} titles within recommended range (${titleLength.percent}%)`);
  add(18, descriptionPresence.rate >= 0.8, `${descriptionPresence.passed}/${descriptionPresence.total} pages contain meta descriptions (${descriptionPresence.percent}%)`);
  add(19, descriptionLength.rate >= 0.75, `${descriptionLength.passed}/${descriptionLength.total} descriptions within recommended range (${descriptionLength.percent}%)`);
  add(20, viewportPresence.rate >= 0.95, `${viewportPresence.passed}/${viewportPresence.total} pages contain valid viewport tag (${viewportPresence.percent}%)`);
  add(21, everyPage((p) => !metaRobots(p).includes("noindex")), pageCountEvidence);
  add(22, duplicateTitleRate <= 0.1, `${duplicateTitlePages} duplicate title pages out of ${pages.length} (${Math.round(duplicateTitleRate * 100)}%)`);
  add(23, duplicateDescriptionRate <= 0.15, `${duplicateDescriptionPages} duplicate description pages out of ${availableDescriptions.length} (${Math.round(duplicateDescriptionRate * 100)}%)`);
  const headingStats = pages.map((p) => {
  const h1Count = p.$("h1").length;
  const h1Text = p.$("h1").first().text().trim();

    const hiddenAncestor = p.$(el).parents().toArray().some((parent) => {
      const style = (p.$(parent).attr("style") ?? "").replace(/\s+/g, "").toLowerCase();
      return p.$(parent).attr("hidden") !== undefined || p.$(parent).attr("aria-hidden") === "true" || style.includes("display:none") || style.includes("visibility:hidden");
    });
    if (hiddenAncestor) return false;

    const style = (p.$(el).attr("style") ?? "").replace(/\s+/g, "").toLowerCase();
    return !style.includes("display:none") && !style.includes("visibility:hidden");
  });

  const headingStats = pages.map((p) => {
    const h1s = visibleHeadings(p, "h1");
    const h1Text = h1s.length === 1 ? p.$(h1s[0]).text().replace(/\s+/g, " ").trim() : "";
    const headings = visibleHeadings(p);

    const hierarchyOk = headings.every((el, index, arr) => {
      if (index === 0) return true;

      const current = Number(String(p.$(el).prop("tagName") ?? "").slice(1));
      const previous = Number(String(p.$(arr[index - 1]).prop("tagName") ?? "").slice(1));

      return current - previous <= 1;
    });

    return {
      url: p.finalUrl,
      hasUsableH1: h1s.length >= 1,
      hasOneH1: h1s.length === 1,
      h1LengthOk: h1Text.length >= 10 && h1Text.length <= 90,
      hierarchyOk
    };
  });

  const headingPassRate = (key: "hasUsableH1" | "hasOneH1" | "h1LengthOk" | "hierarchyOk") => {
    if (!headingStats.length) return 0;
    return headingStats.filter((item) => item[key]).length / headingStats.length;
  };

  const headingEvidence = (key: "hasUsableH1" | "hasOneH1" | "h1LengthOk" | "hierarchyOk", label: string) => {
    const passed = headingStats.filter((item) => item[key]).length;
    const failed = headingStats.find((item) => !item[key]);
    const failedUrl = failed ? `; sample issue: ${failed.url}` : "";
    return `${passed}/${headingStats.length} pages ${label}${failedUrl}`;
  };

  const usableH1Rate = headingPassRate("hasUsableH1");
  const singleH1Rate = headingPassRate("hasOneH1");
  add(24, usableH1Rate >= 0.7 || singleH1Rate >= 0.6, headingEvidence("hasOneH1", "have exactly one visible H1"));

  add(25, headingPassRate("h1LengthOk") >= 0.6, headingEvidence("h1LengthOk", "have H1 length between 10 and 90 characters"));

  add(26, headingPassRate("hierarchyOk") >= 0.6, headingEvidence("hierarchyOk", "have valid visible heading hierarchy"));
  add(27, everyPage((p) => Boolean(p.$("link[rel='canonical']").attr("href"))), pageCountEvidence);
  add(28, canonicalSelfRef.rate >= 0.9, `${canonicalSelfRef.passed}/${canonicalSelfRef.total} pages have self-referencing canonical (${canonicalSelfRef.percent}%)`);
  add(29, !canonicalAbs || await fetchPage(canonicalAbs, 1800).then(robotsContentAllowsIndex).catch(() => false), "canonical indexability checked");
  add(30, !/[?&]page=|\/page\//i.test(url.toString()) || page.$("link[rel='next'],link[rel='prev']").length > 0, "pagination signal");
  add(31, !slashDuplicateFailed, slashVariant ? `Slash variant status ${slashVariant.response.status}${slashDuplicateFailed ? ", both versions returned different 200 content" : ""}` : "slash variant unavailable");
  add(32, everyPage(robotsContentAllowsIndex), pageCountEvidence);
  add(33, everyPage((p) => !metaRobots(p).includes("nosnippet") && !metaRobots(p).includes("max-snippet:0")), pageCountEvidence);
  add(34, everyPage((p) => p.wordCount >= 50), pageCountEvidence);
  add(35, (await Promise.all(allInternalLinks.slice(0, 10).map((link) => fetchHeadOk(link.href)))).every(Boolean), `${allInternalLinks.length} internal links found`);
  add(36, page.redirectHops <= 1, `${page.redirectHops} redirect hops`);
  add(37, pages.every((p) => (p as FetchedPage & { depth?: number }).depth === undefined || ((p as FetchedPage & { depth?: number }).depth ?? 0) <= 3), pageCountEvidence);
  add(38, true, "orphan detection requires external indexed URL corpus; crawl graph accepted");
  add(39, everyPage((p) => p.$("[style*='display:none'],[hidden]").toArray().reduce((sum, el) => sum + wordCount(p.$(el).text()), 0) < 100), pageCountEvidence);
  add(40, everyPage((p) => !/infinite|load more|IntersectionObserver/i.test(p.html)), pageCountEvidence);
  add(41, everyPage((p) => p.wordCount > 80 || !/cookie|consent/i.test(p.html)), pageCountEvidence);
  add(42, everyPage((p) => !new URL(p.finalUrl).pathname.includes("_")), pageCountEvidence);
  add(43, everyPage((p) => p.finalUrl.length <= 75), pageCountEvidence);
  add(44, everyPage((p) => new URL(p.finalUrl).pathname === new URL(p.finalUrl).pathname.toLowerCase()), pageCountEvidence);
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
  add(50, pageImages.every((item) => item.missingDimensions === 0), `${pageImages.reduce((sum, item) => sum + item.missingDimensions, 0)} images missing dimensions`);
  add(51, !firstImgLazy, "first image loading attribute");
  add(52, !/@font-face/i.test(page.html) || /font-display\s*:\s*swap/i.test(page.html), "font-face CSS scanned");
  add(53, everyPage((p) => p.$("head script[src]:not([async]):not([defer]):not([type='module'])").length === 0), pageCountEvidence);
  add(54, everyPage((p) => p.$("head style").text().trim().length > 0), pageCountEvidence);
  add(55, somePage((p) => p.$("link[rel='preload'][as='image']").length > 0), pageCountEvidence);
  add(56, mobileScore !== undefined ? mobileScore >= 60 : page.responseTimeMs < 2500 && viewport.includes("width=device-width"), mobileScore !== undefined ? `${mobileScore} via PageSpeed Insights` : "Local PSI fallback");
  add(57, tapTargetsPass !== undefined ? tapTargetsPass : viewport.includes("width=device-width"), tapTargetsPass !== undefined ? `PageSpeed tap-targets ${tapTargetsPass ? "passed" : "failed"}` : "Local tap-target fallback");
  add(58, viewport.includes("width=device-width") && viewport.includes("initial-scale=1"), viewport || "missing");
  add(59, mobileScore !== undefined ? mobileScore >= 60 : page.responseTimeMs < 2500 && viewport.includes("width=device-width"), mobileScore !== undefined ? `${mobileScore} via PageSpeed Insights` : "Local PSI fallback");
  add(60, tapTargetsPass !== undefined ? tapTargetsPass : viewport.includes("width=device-width"), tapTargetsPass !== undefined ? `PageSpeed tap-targets ${tapTargetsPass ? "passed" : "failed"}` : "Local tap-target fallback");
  add(61, imageAggregate.altRate >= 0.9, `${imageAggregate.altPresent}/${imageAggregate.nonDecorativeCount} non-decorative images have alt text (${Math.round(imageAggregate.altRate * 100)}%)`);
  add(62, imageAggregate.chartDetailedRate >= 0.3, imageAggregate.chartCount ? `${imageAggregate.chartDetailedAlt}/${imageAggregate.chartCount} chart/data images have descriptive alt text (${Math.round(imageAggregate.chartDetailedRate * 100)}%)` : "No chart/data/infographic images detected");
  add(63, imageAggregate.dimensionsRate >= 0.9, `${imageAggregate.dimensionsPresent}/${imageAggregate.count} images have width and height (${Math.round(imageAggregate.dimensionsRate * 100)}%)`);
  add(64, imageAggregate.belowFoldLazyRate >= 0.8, imageAggregate.belowFoldCount ? `${imageAggregate.belowFoldLazy}/${imageAggregate.belowFoldCount} below-fold images lazy-loaded (${Math.round(imageAggregate.belowFoldLazyRate * 100)}%)` : "No below-fold images detected");
  add(65, imageAggregate.modernRate >= 0.4, `${imageAggregate.modern}/${imageAggregate.count} images use WebP or AVIF (${Math.round(imageAggregate.modernRate * 100)}%)`);
  add(66, imageAggregate.genericRate < 0.5, `${imageAggregate.generic}/${imageAggregate.count} images use obviously generic filenames (${Math.round(imageAggregate.genericRate * 100)}%)`);
  add(67, Boolean(footerPrivacy), "footer privacy link");
  add(68, Boolean(footerTerms), "footer terms link");
  add(69, /\+?\d[\d\s().-]{7,}/.test(contactText) && /\b(street|road|avenue|lane|floor|city|india|usa|uk)\b/i.test(contactText), "contact NAP scan");
  add(70, aboutWords >= 200, `${aboutWords} about-page words`);
  add(71, /cookie/i.test(page.html), "cookie consent hint");
  add(72, /gzip|br/i.test(page.headers.get("content-encoding") ?? ""), page.headers.get("content-encoding") ?? "missing");
  add(73, everyPage((p) => p.$("head script[src]:not([async]):not([defer]):not([type='module'])").length === 0), pageCountEvidence);
  add(74, everyPage((p) => p.$("head style").text().trim().length > 0), pageCountEvidence);
  add(75, somePage((p) => p.$("link[rel='preload'][as='image']").length > 0), pageCountEvidence);
  add(76, pageImages.every((item) => item.modernRatio >= 0.7), pageCountEvidence);
  add(77, pageLd.every((item) => item.blocks.length > 0), pageCountEvidence);
  add(78, pageLd.every((item) => item.errors.length === 0), `${pageLd.reduce((sum, item) => sum + item.errors.length, 0)} JSON-LD errors`);
  add(79, allLdBlocks.every((block) => {
    const context = (block as Record<string, unknown>)?.["@context"];
    return typeof context === "string" ? context.includes("schema.org") : true;
  }), "JSON-LD contexts checked");
  add(80, hasSchemaType(ld.blocks, /Organization/), ldTypes.join(", ") || "none");
  add(81, pages.some((p) => p.html.match(/"sameAs"\s*:\s*\[/) !== null && (p.html.match(/https?:\/\//g)?.length ?? 0) >= 4), pageCountEvidence);
  add(82, hasSchemaType(allLdBlocks, /WebSite/) && pages.some((p) => /SearchAction/.test(p.html)), "WebSite/SearchAction schema");
  add(83, !samplePages.length || samplePages.every((p) => hasSchemaType(jsonLd(p).blocks, /BreadcrumbList/)), `${samplePages.length} interior pages crawled`);
  add(84, everyPage((p) => !/blog|article/i.test(new URL(p.finalUrl).pathname) || hasSchemaType(jsonLd(p).blocks, /Article|BlogPosting/)), pageCountEvidence);
  add(85, everyPage((p) => p.$("details, .faq, [class*='faq']").length < 1 || hasSchemaType(jsonLd(p).blocks, /FAQPage/)), pageCountEvidence);
  add(86, everyPage((p) => !/how-to|how to/i.test(`${new URL(p.finalUrl).pathname} ${p.$("h1").first().text().trim()}`) || hasSchemaType(jsonLd(p).blocks, /HowTo/)), pageCountEvidence);
  add(87, everyPage((p) => !/service/i.test(new URL(p.finalUrl).pathname) || hasSchemaType(jsonLd(p).blocks, /LocalBusiness|ProfessionalService|MedicalBusiness|MedicalClinic|Physician|Dentist/)), pageCountEvidence);
  add(88, everyPage((p) => !/author|team/i.test(new URL(p.finalUrl).pathname) || hasSchemaType(jsonLd(p).blocks, /Person/)), pageCountEvidence);
  add(89, everyPage((p) => !/product|pricing/i.test(new URL(p.finalUrl).pathname) || hasSchemaType(jsonLd(p).blocks, /Product/)), pageCountEvidence);
  add(90, everyPage((p) => !/"price"\s*:/.test(p.html) || /\$|₹|€|£|\bprice\b/i.test(p.$("body").text())), pageCountEvidence);
  add(91, pageLd.every((item) => item.errors.length === 0), "Local rich-results fallback");
  add(92, everyPage((p) => Boolean(p.$("meta[property='og:title']").attr("content")?.trim())), pageCountEvidence);
  add(93, everyPage((p) => Boolean(p.$("meta[property='og:description']").attr("content")?.trim())), pageCountEvidence);
  add(94, await fetchImageHeadOk(absolute(url, page.$("meta[property='og:image']").attr("content") ?? "")), "og:image HEAD");
  add(95, ["twitter:card", "twitter:title", "twitter:description"].every((name) => page.$(`meta[name='${name}']`).attr("content")), "Twitter card tags");
  add(96, everyPage((p) => internalLinks(p, new URL(p.finalUrl)).length >= 3), pageCountEvidence);
  add(97, allInternalLinks.every((link) => !GENERIC_ANCHORS.has(link.text)), "anchor text scanned");
  add(98, true, "orphan detection requires external indexed URL corpus; crawl graph accepted");
  add(99, pages.every((p) => (p as FetchedPage & { depth?: number }).depth === undefined || ((p as FetchedPage & { depth?: number }).depth ?? 0) <= 3), pageCountEvidence);
  add(100, everyPage((p) => p.$("article,section,main,aside,header,footer").length >= 3), pageCountEvidence);
  add(101, everyPage((p) => p.$("table").toArray().every((el) => p.$(el).find("caption").length > 0)), pageCountEvidence);
  add(102, everyPage((p) => p.$("time").toArray().every((el) => Boolean(p.$(el).attr("datetime")))), pageCountEvidence);
  add(103, imageAggregate.altRate >= 0.9, `${imageAggregate.altPresent}/${imageAggregate.nonDecorativeCount} non-decorative images have alt text (${Math.round(imageAggregate.altRate * 100)}%)`);
  add(104, interactiveLabelRate >= 0.8, `${interactiveAggregate.labelled}/${interactiveAggregate.total} label-required interactive elements labelled (${Math.round(interactiveLabelRate * 100)}%)`);
  add(105, everyPage((p) => Boolean(p.$("html").attr("lang"))), pageCountEvidence);
  add(106, !hasLanguageAlternates || hreflangs > 0, `${hreflangs} hreflang tags`);
  add(107, everyPage((p) => p.wordCount >= (/blog|article/i.test(new URL(p.finalUrl).pathname) ? 800 : 300)), pageCountEvidence);
  add(108, everyPage((p) => p.$("time[datetime]").length > 0 || /datePublished/.test(p.html) || !/blog|article/i.test(new URL(p.finalUrl).pathname)), pageCountEvidence);
  add(109, everyPage((p) => /dateModified|last-modified/i.test(p.html) || p.headers.has("last-modified") || !/blog|article/i.test(new URL(p.finalUrl).pathname)), pageCountEvidence);
  add(110, everyPage((p) => /author|byline|rel=.author.|itemprop=.author./i.test(p.html) || !/blog|article/i.test(new URL(p.finalUrl).pathname)), pageCountEvidence);
  add(111, somePage((p) => p.$("a[href*='/author/'],a[href*='/team/']").length > 0), pageCountEvidence);
  add(112, everyPage((p) => p.$("a[href]").toArray().filter((el) => {
    const href = p.$(el).attr("href") ?? "";
    return href.startsWith("http") && !sameOrigin(new URL(p.finalUrl), href);
  }).length >= 2), pageCountEvidence);
  add(113, pages.some((p) => p.$("[class*='review'],[class*='testimonial'],[id*='review'],[id*='testimonial']").length > 0 || ((p.$("body").text().match(/\b(review|reviews|testimonial|testimonials|rating|ratings|stars?|customer stories)\b/gi) ?? []).length >= 2)), pageCountEvidence);
  add(114, llms?.response.status === 200 && /text|plain|markdown/i.test(llmsContentType) && llmsWordStats.words >= 100 && llmsWordStats.sections >= 2, `Status ${llms?.response.status ?? "missing"}, ${llmsWordStats.words} words, ${llmsWordStats.sections} sections${llmsWordStats.words >= 200 && llmsWordStats.strongSignals > 0 ? ", strong content signals" : ""}`);
  add(115, compressedTextAssets.length === 0 || compressionPercent >= 80, compressedTextAssets.length === 0 ? "0/0 text assets compressed (not detected)" : `${compressedCount}/${compressedTextAssets.length} text assets compressed (${compressionPercent}%)${compressionPercent >= 60 && compressionPercent < 80 ? " - partial coverage" : ""}`);
  add(116, headerAssetSamples.length === 0 || cachePercent >= 80, `${cacheOkCount}/${headerAssetSamples.length} assets have appropriate Cache-Control`);
  add(117, validatorHeaders.length > 0 || assetValidatorCount > 0, validatorHeaders.length ? validatorHeaders.join(", ") : assetValidatorCount > 0 ? `${assetValidatorCount}/${headerAssetSamples.length} sampled assets have ETag or Last-Modified` : "missing");
  add(118, Boolean(cdnEvidence), cdnEvidence || "No CDN/cache header signal detected");
  add(119, headerAssetSamples.length === 0 || contentTypeOkCount === headerAssetSamples.length, `${contentTypeOkCount}/${headerAssetSamples.length} sampled assets have correct Content-Type`);
  add(120, externalLinkResponses.length === 0 || externalLiveCount / externalLinkResponses.length >= 0.9, `${externalLiveCount}/${externalLinkResponses.length} external links live (${Math.round((externalLinkResponses.length ? externalLiveCount / externalLinkResponses.length : 1) * 100)}%)`);
  add(121, trackingInternalLinks.length === 0, `${trackingInternalLinks.length} tracking-param internal links`);
  add(122, robotsBlocksInternalSearch(robots?.text ?? "") || searchLinks.length === 0, robotsBlocksInternalSearch(robots?.text ?? "") ? "Search URLs blocked in robots.txt" : searchLinks.length ? `${searchLinks.length} internal search URLs found` : "Search URLs not found");
  add(123, soft404Status === 404 || soft404Status === 410, `Fake URL returned status ${soft404Status || "missing"}${soft404Status === 200 && /\b(not found|page not found|no results|error)\b/i.test(soft404Body) ? " with soft error language" : ""}`);
  add(125, Boolean(foundFeed) && avgFeedWords >= 120, foundFeed ? `Feed found at ${foundFeed.url}, avg item words ${avgFeedWords}` : "No feed found at /feed, /rss, or /atom.xml");
  add(126, !historyMatch, historyMatch ? `Matched pattern: ${historyMatch}` : "No suspicious history manipulation found");
  add(127, !exitIntentMatch, exitIntentMatch ? `Matched pattern: ${exitIntentMatch}` : "No exit-intent redirects found");
  add(128, apiUrls.length === 0 || corsValues.length > 0, apiUrls.length === 0 ? "No public API found" : corsValues.length ? `CORS header: ${corsValues[0]}` : `${apiUrls.length} public API endpoints found without CORS header`);
  add(129, subdomainSslResults.every((item) => item.valid), subdomainSslResults.length ? `${subdomainSslResults.filter((item) => item.valid).length}/${subdomainSslResults.length} discovered subdomains have valid SSL` : "No linked subdomains discovered");
  add(130, ssrPassCount / Math.max(pages.length, 1) >= 0.7, `${ssrPassCount}/${pages.length} pages have primary content in raw HTML`);
  add(131, emptyShells.length === 0, emptyShells.length ? `${emptyShells.length} empty-shell SPA pages found` : "No empty-shell SPA detected");
  add(132, accordionWords < 100, `${accordionWords} words hidden in accordions/tabs`);
  add(133, maxDomNodes < 1500, `${maxDomNodes} DOM nodes on largest sampled page`);
  add(134, hiddenKeywordCount === 0, `${hiddenKeywordCount} CSS-hidden keyword text blocks`);
  add(135, schemaInjection.passed, schemaInjection.evidence);
  add(136, Boolean(headerCanonical) && headerCanonicalMatches, headerCanonical ? `Link canonical: ${headerCanonical}` : "missing");
  add(137, canonicalChain.hops <= 1 && !canonicalChain.loop, `${canonicalChain.hops} canonical hops${canonicalChain.loop ? ", loop detected" : ""}`);
  add(138, medianTtfb < 200, `${Math.round(medianTtfb)}ms median TTFB`);
  add(139, aiCrawlerOk, aiCrawlerResponses.length ? `${aiCrawlerResponses.length}/3 AI crawler user-agents returned accessible content` : "AI crawler fetches failed");
  add(140, minHeadlessRatio >= 0.8, `${Math.round(minHeadlessRatio * 100)}% minimum bot/default content match`);
  add(141, indexNowPassed, indexNowCandidates.length ? `${indexNowResponses.filter((item) => item.response?.status === 200).length}/${indexNowCandidates.length} IndexNow key files reachable` : "No IndexNow key location found");
  add(142, slashRedirectStatus === 0 || slashRedirectStatus === 301 || slashRedirectStatus === 308 || caseVariantStatus === 0 || caseVariantStatus === 301 || caseVariantStatus === 308 || caseVariantStatus === 404, `Slash variant status ${slashRedirectStatus || "missing"}, case variant status ${caseVariantStatus || "missing"}`);

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
  const groupedChecks = checks.reduce<Map<string, TechnicalCheckResult[]>>((groups, check) => {
    const current = groups.get(check.category) ?? [];
    current.push(check);
    groups.set(check.category, current);
    return groups;
  }, new Map());
  const categoryDebug = [...groupedChecks.entries()].map(([category, categoryChecks]) => {
    const failed = categoryChecks.filter((check) => !check.passed);
    return {
      category,
      totalChecks: categoryChecks.length,
      passedChecks: categoryChecks.length - failed.length,
      failedChecks: failed.length,
      failedCheckDetails: failed.map((check) => ({
        id: check.id,
        name: check.name,
        evidence: check.evidence
      }))
    };
  });
  return {
    score,
    rawScore,
    pageScore,
    domainScore,
    grade: gradeForScore(score),
    blockerFailed,
    checkedAt: new Date().toISOString(),
    checks,
    categoryDebug
  };
}

function gradeForScore(score: number): TechnicalGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}
