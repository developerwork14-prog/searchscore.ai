import * as cheerio from "cheerio";
import {
  ImageSeoAuditResult,
  ImageSeoCategorySummary,
  ImageSeoCheckResult,
  ImageSeoSeverity,
  TechnicalCategoryStatus
} from "./types.js";

interface CheckDefinition {
  id: number;
  category: string;
  name: string;
  weight: number;
  severity: ImageSeoSeverity;
}

const CHECKS: CheckDefinition[] = [
  [1, "Alt Text", "Alt Text Non-Empty on All Images", 4.38, "Critical"],
  [2, "Image Format & Performance", "WebP/AVIF >=70%", 3.26, "Medium"],
  [3, "Image Format & Performance", "LCP Image Preloaded", 3.8, "Critical"],
  [4, "Image Format & Performance", "<picture> with WebP+Fallback", 2.17, "Medium"],
  [5, "Image Format & Performance", "Stable Image URLs", 2.17, "Medium"],
  [6, "Image Format & Performance", "Native Lazy Loading (Not JS)", 3.26, "High"],
  [7, "Image Format & Performance", "Responsive srcset+sizes", 2.17, "Medium"],
  [8, "Image Format & Performance", "Descriptive File Names", 2.17, "Medium"],
  [9, "Content & Accessibility", "OCR-HTML Data Parity", 3.8, "Critical"],
  [10, "Content & Accessibility", "No Key Data as Image-Only", 3.8, "Critical"],
  [11, "Content & Accessibility", "No Images Blocking Text", 2.72, "High"],
  [12, "Schema & Markup", "SVG <title>+<desc>", 2.17, "Medium"],
  [13, "Schema & Markup", "ImageObject Schema", 2.17, "Medium"]
].map(([id, category, name, weight, severity]) => ({ id, category, name, weight, severity })) as CheckDefinition[];

const CATEGORY_ORDER = [...new Set(CHECKS.map((check) => check.category))];
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|gif|webp|avif|svg)(?:[?#]|$)/i;

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

function result(def: CheckDefinition, state: { passed?: boolean; skipped?: boolean; warning?: boolean; evidence?: Record<string, unknown> }): ImageSeoCheckResult {
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

function summarize(checks: ImageSeoCheckResult[]): ImageSeoCategorySummary[] {
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

function imageUrlFrom($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]) {
  return $(el).attr("src") || $(el).attr("data-src") || "";
}

function fileName(url: string) {
  try {
    const parsed = new URL(url, "https://example.com");
    return parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return url.split("/").filter(Boolean).at(-1) ?? "";
  }
}

function isDescriptiveFileName(value: string) {
  const name = fileName(value).replace(/\.[a-z0-9]+$/i, "");
  if (!name || name.length < 8) return false;
  if (/^(image|img|photo|pic|screenshot|untitled|dsc|px|spacer|blank)[-_]?\d*$/i.test(name)) return false;
  return /[a-z]{3,}[-_][a-z0-9]{2,}/i.test(name);
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const flatten = (value: unknown): Record<string, unknown>[] => {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(flatten);
    const record = value as Record<string, unknown>;
    return [...(record["@type"] ? [record] : []), ...flatten(record["@graph"])];
  };

  return $("script[type='application/ld+json']").toArray().flatMap((el) => {
    try {
      return flatten(JSON.parse($(el).text()));
    } catch {
      return [];
    }
  });
}

function typesOf(record: Record<string, unknown>) {
  const value = record["@type"];
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
}

export async function runImageSeoAudit(inputUrl: string, html?: string): Promise<ImageSeoAuditResult> {
  const pageHtml = html ?? await fetchHtml(normalizeUrl(inputUrl));
  const $ = cheerio.load(pageHtml);
  const imgElements = $("img").toArray().filter((el) => {
    const role = ($(el).attr("role") ?? "").toLowerCase();
    return role !== "presentation" && $(el).attr("aria-hidden") !== "true";
  });
  const imageUrls = imgElements.map((el) => imageUrlFrom($, el)).filter(Boolean);
  const imageCount = imgElements.length;
  const pictureElements = $("picture").toArray();
  const preloadedImages = $("link[rel='preload' i][as='image' i]").toArray().map((el) => $(el).attr("href") ?? "").filter(Boolean);
  const lazyImages = imgElements.filter((el) => ($(el).attr("loading") ?? "").toLowerCase() === "lazy");
  const jsLazySignals = imgElements.filter((el) => $(el).attr("data-src") || $(el).attr("data-lazy-src") || /lazyload|lazy-load/i.test($(el).attr("class") ?? ""));
  const responsiveImages = imgElements.filter((el) => Boolean($(el).attr("srcset") && $(el).attr("sizes")));
  const svgElements = $("svg").toArray();
  const jsonLd = parseJsonLd($);
  const imageObjects = jsonLd.filter((record) => typesOf(record).includes("ImageObject"));
  const hasAnyImageOnlyTextRisk = $("img[alt*='$'],img[alt*='%'],img[alt*='price' i],img[alt*='chart' i],img[alt*='table' i],img[alt*='data' i]").length > 0;
  const results: ImageSeoCheckResult[] = [];
  const add = (id: number, state: Parameters<typeof result>[1]) => {
    const def = CHECKS.find((check) => check.id === id);
    if (def) results.push(result(def, state));
  };

  const missingAlt = imgElements
    .filter((el) => !($(el).attr("alt") ?? "").trim())
    .map((el) => imageUrlFrom($, el) || $(el).attr("src") || "inline image")
    .slice(0, 10);
  add(1, {
    passed: imageCount === 0 || missingAlt.length === 0,
    evidence: { imageCount, missingAlt }
  });

  const modernImages = imageUrls.filter((src) => /\.(?:webp|avif)(?:[?#]|$)/i.test(src)).length;
  add(2, {
    passed: imageUrls.length === 0 || modernImages / imageUrls.length >= 0.7,
    evidence: { imageCount: imageUrls.length, modernImages, ratio: imageUrls.length ? Number((modernImages / imageUrls.length).toFixed(2)) : 1 }
  });

  add(3, {
    skipped: true,
    evidence: { reason: "The true LCP image cannot be identified with 100% accuracy from static HTML alone.", preloadedImages }
  });

  const pictureWithWebpFallback = pictureElements.filter((picture) => {
    const sources = $(picture).find("source").toArray();
    return sources.some((source) => /image\/(?:webp|avif)/i.test($(source).attr("type") ?? "") || /\.(?:webp|avif)(?:[?#]|$)/i.test($(source).attr("srcset") ?? "")) && $(picture).find("img").length > 0;
  }).length;
  add(4, {
    passed: pictureElements.length === 0 || pictureWithWebpFallback === pictureElements.length,
    skipped: pictureElements.length === 0,
    evidence: { pictureCount: pictureElements.length, pictureWithWebpFallback }
  });

  const unstableUrls = imageUrls.filter((src) => {
    try {
      const parsed = new URL(src, "https://example.com");
      return [...parsed.searchParams.keys()].some((key) => /^(v|ver|version|cache|cachebuster|cb|t|time|timestamp|rand|random)$/i.test(key));
    } catch {
      return /[?&](v|ver|version|cache|cachebuster|cb|t|time|timestamp|rand|random)=/i.test(src);
    }
  });
  add(5, {
    passed: unstableUrls.length === 0,
    evidence: { imageCount: imageUrls.length, unstableUrls: unstableUrls.slice(0, 10) }
  });

  add(6, {
    passed: jsLazySignals.length === 0 && (imageCount === 0 || lazyImages.length > 0 || imageCount <= 1),
    warning: jsLazySignals.length === 0 && imageCount > 1 && lazyImages.length === 0,
    evidence: { imageCount, nativeLazyImages: lazyImages.length, jsLazySignals: jsLazySignals.length }
  });

  add(7, {
    passed: imageCount === 0 || responsiveImages.length / imageCount >= 0.7,
    evidence: { imageCount, responsiveImages: responsiveImages.length, ratio: imageCount ? Number((responsiveImages.length / imageCount).toFixed(2)) : 1 }
  });

  const nonDescriptive = imageUrls.filter((src) => !isDescriptiveFileName(src)).slice(0, 10);
  add(8, {
    passed: imageUrls.length === 0 || nonDescriptive.length === 0,
    evidence: { imageCount: imageUrls.length, nonDescriptive }
  });

  add(9, {
    skipped: true,
    evidence: { reason: "OCR text extraction is not available in this runtime; parity cannot be verified without guessing." }
  });
  add(10, {
    skipped: !hasAnyImageOnlyTextRisk,
    warning: hasAnyImageOnlyTextRisk,
    evidence: { reason: hasAnyImageOnlyTextRisk ? "Image alt text indicates possible data/chart/table content; OCR is required for exact verification." : "No image-only data signals found in static HTML." }
  });
  add(11, {
    skipped: true,
    evidence: { reason: "Visual overlap/blocking requires layout rendering and pixel inspection; static HTML cannot verify it exactly." }
  });

  const svgMissingTitleDesc = svgElements.filter((el) => $(el).find("title").length === 0 || $(el).find("desc").length === 0).length;
  add(12, {
    passed: svgElements.length === 0 || svgMissingTitleDesc === 0,
    skipped: svgElements.length === 0,
    evidence: { svgCount: svgElements.length, svgMissingTitleDesc }
  });

  add(13, {
    passed: imageObjects.length > 0,
    skipped: imageCount === 0,
    evidence: { imageObjectCount: imageObjects.length }
  });

  const categories = summarize(results);
  const scorable = results.filter((check) => !check.skipped);
  const score = scorable.length ? clamp((scorable.reduce((sum, check) => sum + check.score, 0) / scorable.reduce((sum, check) => sum + check.weight, 0)) * 100) : 100;
  return { score, checkedAt: new Date().toISOString(), categories, checks: results };
}
