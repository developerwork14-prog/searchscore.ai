import * as cheerio from "cheerio";

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
  pages: CrawledPage[];
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

async function sitemapUrls(origin: string, timeoutMs: number, maxSitemapFiles: number) {
  const robots = await fetchText(`${origin}/robots.txt`, timeoutMs).catch(() => null);
  const declared = [...(robots?.text.matchAll(/^sitemap:\s*(.+)$/gim) ?? [])].map((match) => match[1].trim());
  const sitemapCandidates = declared.length ? declared : [`${origin}/sitemap.xml`];
  const urls = new Set<string>();

  for (const sitemap of sitemapCandidates.slice(0, maxSitemapFiles)) {
    const fetched = await fetchText(sitemap, timeoutMs).catch(() => null);
    if (!fetched?.response.ok || !fetched.text.trim()) continue;
    const $ = cheerio.load(fetched.text, { xmlMode: true });
    $("url loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.add(canonicalize(loc));
    });
    $("sitemap loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.add(canonicalize(loc));
    });
  }

  return [...urls].filter(Boolean);
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
  const sitemap = (await sitemapUrls(origin, timeoutMs, maxSitemapFiles)).filter((href) => sameOrigin(root, href));
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

  return { origin, sitemapUrls: sitemap, pages };
}
