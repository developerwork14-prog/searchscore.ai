import * as cheerio from "cheerio";
import { gunzipSync } from "node:zlib";

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  headers: Headers;
  html: string;
  responseTimeMs: number;
  redirectHops: number;
  depth: number;
  source: "homepage" | "sitemap" | "internal";
  $: cheerio.CheerioAPI;
  wordCount: number;
}

export interface SiteCrawlResult {
  origin: string;
  sitemapUrls: string[];
  sitemapSummary?: SitemapFetchSummary;
  pages: CrawledPage[];
}

export interface SitemapFetchSummary {
  totalUrls: number;
  sitemapsFound: number;
  sitemapsFailed: number;
  discoveryMethod: string;
}

export interface SitemapFetchResult {
  urls: string[];
  summary: SitemapFetchSummary;
}

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  timeoutMs?: number;
  concurrency?: number;
  maxSitemapFiles?: number;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeUrl(value: string) {
  return value.startsWith("http") ? value : `https://${value}`;
}

function canonicalize(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return "";
  }
}

function sameOrigin(root: URL, href: string) {
  try {
    return new URL(href, root).hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function absolute(root: URL, href: string) {
  try {
    return new URL(href, root).toString();
  } catch {
    return "";
  }
}

async function fetchText(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AIVisibilityAnalyzer/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7"
      }
    });
    const text = await response.text().catch(() => "");
    return { response, text, responseTimeMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string, depth: number, source: CrawledPage["source"], timeoutMs: number): Promise<CrawledPage | null> {
  try {
    const { response, text, responseTimeMs } = await fetchText(url, timeoutMs);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/html|xhtml/i.test(contentType) && !text.trim().startsWith("<!doctype") && !text.trim().startsWith("<html")) return null;
    const $ = cheerio.load(text);
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      headers: response.headers,
      html: text,
      responseTimeMs,
      redirectHops: response.redirected && response.url !== url ? 1 : 0,
      depth,
      source,
      $,
      wordCount: wordCount($("body").text())
    };
  } catch {
    return null;
  }
}

function internalLinks(page: CrawledPage, root: URL) {
  return page.$("a[href]").toArray()
    .map((el) => absolute(root, page.$(el).attr("href") ?? ""))
    .filter((href) => href && sameOrigin(root, href))
    .map(canonicalize)
    .filter(Boolean)
    .filter((href) => !/\.(pdf|jpg|jpeg|png|gif|webp|avif|svg|zip|docx?|xlsx?|pptx?|mp4|mov)(\?|$)/i.test(href));
}

const SITEMAP_FETCH_LIMIT_BYTES = 50 * 1024 * 1024;

function stripXmlNoise(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function isLikelyHtml(value: string) {
  const trimmed = value.trim().slice(0, 500).toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || /<body[\s>]/i.test(trimmed);
}

function extractLocValues(xml: string) {
  return [...xml.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>\s*([\s\S]*?)\s*<\/(?:[\w.-]+:)?loc>/gi)]
    .map((match) => stripXmlNoise(match[1]))
    .filter(Boolean);
}

function resolveLoc(baseUrl: string, loc: string) {
  try {
    return new URL(loc, baseUrl).toString();
  } catch {
    return "";
  }
}

function isMediaUrl(value: string) {
  return /\.(?:jpe?g|png|gif|webp|avif|svg|pdf|mp4|mov|avi|webm|mp3|wav|zip|rar|7z|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(value);
}

async function responseText(response: Response, url: string) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > SITEMAP_FETCH_LIMIT_BYTES) return "";
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > SITEMAP_FETCH_LIMIT_BYTES) return "";
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  const isGzip = /\.gz(?:[?#]|$)/i.test(url) || response.headers.get("content-encoding")?.includes("gzip") || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  const decoded = isGzip ? gunzipSync(bytes) : bytes;
  return new TextDecoder("utf-8").decode(decoded);
}

async function fetchSitemapText(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(timeoutMs, 10000));
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AIVisibilityAnalyzer/1.0",
        accept: "application/xml,text/xml,application/rss+xml,text/plain,*/*"
      }
    });
    if (!response.ok) return { ok: false, status: response.status, text: "", finalUrl: response.url };
    return { ok: true, status: response.status, text: stripXmlNoise(await responseText(response, response.url || url)), finalUrl: response.url };
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  } finally {
    clearTimeout(timeout);
  }
}

async function urlsFromSitemapFile(
  sitemapUrl: string,
  timeoutMs: number,
  state: { remaining: number; found: number; failed: number },
  depth = 0
): Promise<string[]> {
  if (state.remaining <= 0 || depth > 3) return [];
  state.remaining -= 1;
  const fetched = await fetchSitemapText(sitemapUrl, timeoutMs);
  if (!fetched.ok || !fetched.text || isLikelyHtml(fetched.text)) {
    state.failed += 1;
    return [];
  }

  const xml = fetched.text;
  const isIndex = /<(?:[\w.-]+:)?sitemapindex\b/i.test(xml);
  const isUrlset = /<(?:[\w.-]+:)?urlset\b/i.test(xml);
  if (!isIndex && !isUrlset) {
    state.failed += 1;
    return [];
  }
  state.found += 1;

  const locs = extractLocValues(xml).map((loc) => resolveLoc(fetched.finalUrl || sitemapUrl, loc)).filter(Boolean);
  if (isUrlset) return locs.map(canonicalize).filter(Boolean);

  const urls: string[] = [];
  for (const child of locs) {
    const nested = await urlsFromSitemapFile(child, timeoutMs, state, depth + 1);
    urls.push(...nested);
    if (state.remaining <= 0) break;
  }
  return urls;
}

export async function fetchSitemapUrls(origin: string, timeoutMs: number, maxSitemapFiles: number): Promise<SitemapFetchResult> {
  const root = new URL(origin);
  const robots = await fetchText(`${origin}/robots.txt`, Math.max(timeoutMs, 10000)).catch(() => null);
  const robotsSitemaps = [...(robots?.text.matchAll(/^sitemap:\s*(.+)$/gim) ?? [])]
    .map((match) => resolveLoc(origin, match[1].trim()))
    .filter(Boolean);
  const candidates = [
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap_index.xml.gz`,
    ...robotsSitemaps
  ];
  const state = { remaining: maxSitemapFiles, found: 0, failed: 0 };
  let discoveryMethod = "none";
  let urls: string[] = [];

  for (const candidate of [...new Set(candidates)]) {
    urls = await urlsFromSitemapFile(candidate, timeoutMs, state);
    if (urls.length) {
      discoveryMethod = candidate.includes("/sitemap_index.xml") ? "sitemap_index.xml" :
        candidate.includes("/sitemap.xml") ? "sitemap.xml" :
        candidate.includes("/sitemap-index.xml") ? "sitemap-index.xml" :
        candidate.includes(".gz") ? "sitemap_index.xml.gz" :
        robotsSitemaps.includes(candidate) ? "robots.txt" : candidate;
      break;
    }
    if (state.remaining <= 0) break;
  }

  const deduped = [...new Set(urls)].filter(Boolean).filter((href) => !isMediaUrl(href));
  const noQuery = deduped.filter((href) => {
    try {
      return !new URL(href).search;
    } catch {
      return false;
    }
  });
  const filtered = noQuery.length ? noQuery : deduped;
  return {
    urls: filtered.filter((href) => sameOrigin(root, href)),
    summary: {
      totalUrls: filtered.length,
      sitemapsFound: state.found,
      sitemapsFailed: state.failed,
      discoveryMethod
    }
  };
}

export async function crawlSite(inputUrl: string, options: CrawlOptions = {}): Promise<SiteCrawlResult> {
  const maxPages = options.maxPages ?? 100;
  const maxDepth = options.maxDepth ?? 5;
  const timeoutMs = options.timeoutMs ?? 7000;
  const concurrency = options.concurrency ?? 6;
  const maxSitemapFiles = options.maxSitemapFiles ?? 2;
  const root = new URL(normalizeUrl(inputUrl));
  const origin = `${root.protocol}//${root.host}`;
  const seen = new Set<string>();
  const pages: CrawledPage[] = [];
  const sitemapResult = await fetchSitemapUrls(origin, timeoutMs, maxSitemapFiles);
  const sitemap = sitemapResult.urls.filter((href) => sameOrigin(root, href));
  const queue: Array<{ url: string; depth: number; source: CrawledPage["source"] }> = [
    { url: canonicalize(root.toString()), depth: 0, source: "homepage" },
    ...sitemap.map((url) => ({ url, depth: 1, source: "sitemap" as const }))
  ];

  while (queue.length && pages.length < maxPages) {
    const batch: Array<{ url: string; depth: number; source: CrawledPage["source"] }> = [];

    while (queue.length && batch.length < concurrency && pages.length + batch.length < maxPages) {
      const next = queue.shift();
      if (!next) break;
      const normalized = canonicalize(next.url);
      if (!normalized || seen.has(normalized) || !sameOrigin(root, normalized)) continue;
      seen.add(normalized);
      batch.push({ ...next, url: normalized });
    }

    if (!batch.length) continue;

    const fetchedPages = await Promise.all(
      batch.map((next) => fetchPage(next.url, next.depth, next.source, timeoutMs))
    );

    for (const page of fetchedPages) {
      if (!page || pages.length >= maxPages) continue;
      pages.push(page);

      if (page.depth >= maxDepth) continue;
      for (const href of internalLinks(page, root)) {
        if (seen.has(href) || queue.some((item) => canonicalize(item.url) === href)) continue;
        queue.push({ url: href, depth: page.depth + 1, source: "internal" });
        if (queue.length + pages.length >= maxPages * 2) break;
      }
    }
  }

  return { origin, sitemapUrls: sitemap, sitemapSummary: sitemapResult.summary, pages };
}
