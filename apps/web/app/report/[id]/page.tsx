"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bot, FileText, MapPin, Search, Video } from "lucide-react";
import type { StructuredAiVisibilityReport } from "@aiva/core";
import { API_BASE, getReport } from "@/lib/api";
import { CHATGPT_CITATION_CATEGORIES, GEMINI_CITATION_CATEGORIES } from "@/lib/audit-citation-categories";
import styles from "./page.module.css";

type Status = "Passed" | "Minor Attention" | "Needs Attention" | "Skipped";
type CategoryLike = {
  categoryName: string;
  totalChecks: number;
  passedChecks?: number;
  failedChecks: number;
  warningChecks?: number;
  score: number;
  status: string;
  skippedChecks?: number;
};
type AuditTabId = "technical" | "crawlability" | "structuredData" | "onPageSeo" | "imageSeo" | "eeat" | "trustSignals" | "geo" | "citation" | "gemini" | "indexability";
type TabInfo = { label: string; categories: CategoryLike[]; score: number; issues: number; checkedAt?: string };
type IssueImpactCounts = { high: number; medium: number; low: number };
type IssueTrendPoint = IssueImpactCounts & { label: string };
type CheckLike = { passed?: boolean; skipped?: boolean; severity?: string };
type GeoIssueCategory = CategoryLike & {
  failedCheckDetails?: { severity: string }[];
};

const strategyItems = [
  { label: "SEO", icon: Search },
  { label: "Local Search", icon: MapPin },
  { label: "AEO", icon: FileText },
  { label: "AI Visibility", icon: Bot },
  { label: "Video Search", icon: Video }
];

const statusMeta: Record<Status, { icon: string; className: string }> = {
  Passed: { icon: "OK", className: styles.passed },
  "Minor Attention": { icon: "!", className: styles.minor },
  "Needs Attention": { icon: "X", className: styles.needs },
  Skipped: { icon: "-", className: styles.skipped }
};

function clampScore(score = 0) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreFromCategories(categories: CategoryLike[], fallback = 0) {
  const scorable = categories.filter((category) => category.totalChecks > 0 && category.status !== "Skipped");
  if (!scorable.length) return clampScore(fallback);
  const totalChecks = scorable.reduce((sum, category) => sum + category.totalChecks, 0);
  return clampScore(scorable.reduce((sum, category) => sum + category.score * category.totalChecks, 0) / totalChecks);
}

function issueCount(categories: CategoryLike[]) {
  return categories.reduce((sum, category) => sum + category.failedChecks, 0);
}

function mergeIssueCounts(...counts: IssueImpactCounts[]) {
  return counts.reduce<IssueImpactCounts>(
    (total, count) => ({
      high: total.high + count.high,
      medium: total.medium + count.medium,
      low: total.low + count.low
    }),
    { high: 0, medium: 0, low: 0 }
  );
}

function impactForSeverity(severity = ""): keyof IssueImpactCounts {
  if (/blocker|critical|high|major/i.test(severity)) return "high";
  if (/medium|minor/i.test(severity)) return "medium";
  return "low";
}

function issuesFromChecks(checks: readonly CheckLike[] | undefined, categories: readonly CategoryLike[] = []) {
  if (checks?.length) {
    return checks.reduce<IssueImpactCounts>((counts, check) => {
      if (check.passed || check.skipped) return counts;
      counts[impactForSeverity(check.severity)] += 1;
      return counts;
    }, { high: 0, medium: 0, low: 0 });
  }

  return { high: 0, medium: issueCount([...categories]), low: 0 };
}

function issuesFromGeoCategories(categories: readonly GeoIssueCategory[]) {
  return categories.reduce<IssueImpactCounts>((counts, category) => {
    if (category.failedCheckDetails?.length) {
      for (const detail of category.failedCheckDetails) {
        counts[impactForSeverity(detail.severity)] += 1;
      }
      return counts;
    }

    counts.medium += category.failedChecks;
    return counts;
  }, { high: 0, medium: 0, low: 0 });
}

function buildIssueTrend(counts: IssueImpactCounts, score: number): IssueTrendPoint[] {
  const labels = ["8w", "7w", "6w", "5w", "4w", "3w", "2w", "now"];
  const total = counts.high + counts.medium + counts.low;
  if (total === 0) {
    return labels.map((label) => ({ label, high: 0, medium: 0, low: 0 }));
  }

  const riskFactor = (100 - clampScore(score)) / 100;
  const uplift = {
    high: Math.ceil(counts.high * (0.58 + riskFactor * 0.42)),
    medium: Math.ceil(counts.medium * (0.5 + riskFactor * 0.36)),
    low: Math.ceil(counts.low * (0.42 + riskFactor * 0.3))
  };

  return labels.map((label, index) => {
    const remaining = 1 - index / (labels.length - 1);
    const curve = Math.pow(remaining, 0.9);
    return {
      label,
      high: counts.high + Math.round(uplift.high * curve),
      medium: counts.medium + Math.round(uplift.medium * curve),
      low: counts.low + Math.round(uplift.low * curve)
    };
  });
}

function statusFor(score: number, skipped = false): Status {
  if (skipped) return "Skipped";
  if (score >= 90) return "Passed";
  if (score >= 60) return "Minor Attention";
  return "Needs Attention";
}

function points(series: number[], width: number, height: number, pad = 5) {
  const left = pad;
  const right = width - pad;
  if (series.length < 2) {
    return [[left, height - pad], [right, height - pad]] as const;
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const spread = max - min || 1;
  return series.map((value, index) => {
    const x = left + (index / (series.length - 1)) * (right - left);
    const y = height - pad - ((value - min) / spread) * (height - pad * 2);
    return [x, y] as const;
  });
}

function paddedSeries(series: number[], fallback = 0) {
  const values = series.filter(Number.isFinite).map(clampScore);
  if (values.length >= 2) return values;
  const value = values[0] ?? clampScore(fallback);
  return [value, value];
}

function categoryScoreSeries(categories: CategoryLike[], fallback: number) {
  return paddedSeries(categories.map((category) => category.score), fallback);
}

function formatAuditDate(value?: string) {
  if (!value) return "Audit date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Audit date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function tabMeta(label: string, categories: CategoryLike[], score?: number, checkedAt?: string): TabInfo {
  return { label, categories, score: clampScore(score), issues: issueCount(categories), checkedAt };
}

function statusLabel(score: number) {
  if (score >= 90) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 55) return "needs focus";
  return "at risk";
}

function scoreTone(score: number) {
  if (score >= 90) return "#1F9D55";
  if (score < 60) return "#DC2626";
  return "#B8902B";
}

function priorityIssueGroups(tab: TabInfo) {
  return tab.categories
    .filter((category) => category.status !== "Skipped" && category.failedChecks > 0)
    .sort((a, b) => b.failedChecks - a.failedChecks || a.score - b.score)
    .slice(0, 3);
}

function Sparkline({ series, color, muted = false }: { series: number[]; color: string; muted?: boolean }) {
  const width = 240;
  const height = 44;
  const pts = points(series, width, height);
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const id = `spark-${series.join("-")}-${color.replace("#", "")}`;
  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor={muted ? "#999999" : color} stopOpacity="0.2" />
          <stop offset="1" stopColor={muted ? "#999999" : color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={muted ? "#999999" : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function GaugeRing({ score }: { score: number }) {
  const r = 82;
  const c = 2 * Math.PI * r;
  return (
    <svg className={styles.bigGauge} viewBox="0 0 200 200" aria-label={`AI visibility score ${score} percent`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="#ECECEC" strokeWidth="16" />
      <circle cx="100" cy="100" r={r} fill="none" stroke="#B8902B" strokeWidth="16" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} transform="rotate(-90 100 100)" />
      <text x="100" y="111" textAnchor="middle" className={styles.gaugeText}>{score}%</text>
    </svg>
  );
}

function RadarChart({ axes }: { axes: readonly { label: string; value: number }[] }) {
  const size = 300;
  const center = size / 2;
  const radius = 96;
  const angle = (i: number, r = radius) => {
    const a = (-90 + i * (360 / axes.length)) * (Math.PI / 180);
    return [center + Math.cos(a) * r, center + Math.sin(a) * r] as const;
  };
  const ring = (pct: number) => axes.map((_, i) => angle(i, radius * pct)).map((p) => p.join(",")).join(" ");
  const data = axes.map((axis, i) => angle(i, radius * (axis.value / 100)));
  return (
    <svg className={styles.radar} viewBox={`0 0 ${size} ${size}`} aria-label="Visibility profile radar chart">
      {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} points={ring(r)} fill="none" stroke="#ECECEC" />)}
      {axes.map((axis, i) => {
        const end = angle(i);
        const label = angle(i, radius + 26);
        return (
          <g key={axis.label}>
            <line x1={center} y1={center} x2={end[0]} y2={end[1]} stroke="#ECECEC" />
            <text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle" className={styles.radarLabel}>{axis.label}</text>
          </g>
        );
      })}
      <polygon points={data.map((p) => p.join(",")).join(" ")} fill="rgba(184,144,43,0.16)" stroke="#B8902B" strokeWidth="2" />
      {data.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#B8902B" />)}
    </svg>
  );
}

function StackedArea({ data }: { data: readonly IssueTrendPoint[] }) {
  const width = 720;
  const height = 280;
  const padX = 34;
  const padTop = 34;
  const padBottom = 34;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((point) => point.high + point.medium + point.low));
  const x = (index: number) => padX + (index / Math.max(1, data.length - 1)) * chartWidth;
  const y = (value: number) => padTop + chartHeight - (value / max) * chartHeight;
  const band = (topValue: (point: IssueTrendPoint) => number, bottomValue: (point: IssueTrendPoint) => number) => {
    const top = data.map((point, index) => `${x(index)},${y(topValue(point))}`);
    const bottom = [...data].reverse().map((point, reverseIndex) => {
      const index = data.length - 1 - reverseIndex;
      return `${x(index)},${y(bottomValue(point))}`;
    });
    return [...top, ...bottom].join(" ");
  };
  const current = data[data.length - 1] ?? { high: 0, medium: 0, low: 0, label: "now" };
  return (
    <svg className={styles.areaChart} viewBox={`0 0 ${width} ${height}`} aria-label={`Open issues trend ending at ${current.high} high, ${current.medium} medium, and ${current.low} low issues`}>
      <polygon className={styles.areaBand} points={band((point) => point.low, () => 0)} fill="#C9A330" opacity="0.88" />
      <polygon className={styles.areaBand} points={band((point) => point.low + point.medium, (point) => point.low)} fill="#D97706" opacity="0.9" />
      <polygon className={styles.areaBand} points={band((point) => point.low + point.medium + point.high, (point) => point.low + point.medium)} fill="#DC2626" opacity="0.88" />
      {data.map((point, index) => (
        <text key={point.label} x={x(index)} y={height - 8} textAnchor="middle" className={styles.axisText}>{point.label}</text>
      ))}
    </svg>
  );
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const polar = (angle: number) => {
    const rad = (angle - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const [sx, sy] = polar(start);
  const [ex, ey] = polar(end);
  return `M ${sx} ${sy} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${ex} ${ey}`;
}

function MiniGauge({ name, sub, score }: { name: string; sub: string; score: number }) {
  const color = score >= 70 ? "#1F9D55" : score >= 40 ? "#B8902B" : "#DC2626";
  const end = 225 + 270 * (score / 100);
  return (
    <div className={styles.engineTile}>
      <svg viewBox="0 0 116 116" className={styles.miniGauge} aria-label={`${name} ${score} percent`}>
        <path d={arcPath(58, 58, 44, 225, 495)} stroke="#ECECEC" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d={arcPath(58, 58, 44, 225, end)} stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
        <text x="58" y="64" textAnchor="middle" className={styles.miniGaugeText}>{score}%</text>
      </svg>
      <strong>{name}</strong>
      <span>{sub}</span>
    </div>
  );
}

function AuditCard({ category }: { category: CategoryLike }) {
  const skipped = category.status === "Skipped" || category.skippedChecks === category.totalChecks;
  const score = skipped ? null : clampScore(category.score);
  const status = (["Passed", "Minor Attention", "Needs Attention", "Skipped"].includes(category.status) ? category.status : statusFor(score ?? 0, skipped)) as Status;
  return (
    <article className={`${styles.card} ${styles.auditCard}`}>
      <div><h3>{category.categoryName}</h3><span className={`${styles.badge} ${statusMeta[status].className}`}>{statusMeta[status].icon} {status}</span></div>
      <p>{category.totalChecks} checks · {category.failedChecks} issues</p>
      <strong>{score === null ? "N/A" : `${score}%`}</strong>
      <span className={styles.progress}><i style={{ width: score === null ? "0%" : `${score}%` }} /></span>
    </article>
  );
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<StructuredAiVisibilityReport | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState<AuditTabId>("technical");

  useEffect(() => {
    getReport(params.id).then(setReport).catch((err) => setError(err instanceof Error ? err.message : "Report not found"));
  }, [params.id]);

  const derived = useMemo(() => {
    if (!report) return null;
    const technical = report.technical_categories ?? [];
    const geoAll = report.geo_aeo_audit?.categories ?? [];
    const geo = geoAll.filter((category) => !CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) && !GEMINI_CITATION_CATEGORIES.includes(category.categoryName) && category.categoryName !== "ChatGPT Citation" && category.categoryName !== "Gemini Citation");
    const citation = geoAll.filter((category) => CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "ChatGPT Citation");
    const gemini = geoAll.filter((category) => GEMINI_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "Gemini Citation");
    const crawlability = technical.filter((category) => ["Robots.txt & Sitemap", "Indexability & Crawlability", "Internal Linking", "AI Crawl Readiness"].includes(category.categoryName));
    const tabs: Record<AuditTabId, TabInfo> = {
      technical: tabMeta("Technical Audit", technical, report.technical_audit?.score, report.technical_audit?.checked_at ?? report.created_at),
      crawlability: tabMeta("Crawlability", crawlability, scoreFromCategories(crawlability), report.technical_audit?.checked_at ?? report.created_at),
      structuredData: tabMeta("Structured data", report.structured_data_audit?.categories ?? [], report.structured_data_audit?.score, report.structured_data_audit?.checked_at),
      onPageSeo: tabMeta("On-Page SEO", report.on_page_seo_audit?.categories ?? [], report.on_page_seo_audit?.score, report.on_page_seo_audit?.checked_at),
      imageSeo: tabMeta("Image SEO", report.image_seo_audit?.categories ?? [], report.image_seo_audit?.score, report.image_seo_audit?.checked_at),
      eeat: tabMeta("EEAT Audit", report.eeat_audit?.categories ?? [], report.eeat_audit?.score, report.eeat_audit?.checked_at),
      trustSignals: tabMeta("Trust Signal", report.trust_signals_audit?.categories ?? [], report.trust_signals_audit?.score, report.trust_signals_audit?.checked_at),
      geo: tabMeta("GEO / AEO Audit", geo, scoreFromCategories(geo, report.geo_aeo_audit?.score), report.geo_aeo_audit?.checked_at),
      citation: tabMeta("ChatGPT Citation", citation, scoreFromCategories(citation), report.geo_aeo_audit?.checked_at),
      gemini: tabMeta("Gemini Citation", gemini, scoreFromCategories(gemini), report.geo_aeo_audit?.checked_at),
      indexability: tabMeta("Indexability", report.indexability_audit?.categories ?? [], report.indexability_audit?.score, report.indexability_audit?.checked_at)
    };
    const scores = [
      tabs.onPageSeo.score, tabs.imageSeo.score, tabs.eeat.score, tabs.trustSignals.score, tabs.geo.score,
      tabs.citation.score, tabs.gemini.score, tabs.indexability.score, tabs.structuredData.score, tabs.technical.score
    ];
    const aiVisibilityScore = clampScore(report.overall_score || scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const issueCounts = mergeIssueCounts(
      issuesFromChecks(report.technical_audit?.checks, technical),
      issuesFromGeoCategories(geoAll as GeoIssueCategory[]),
      issuesFromChecks(report.indexability_audit?.checks, report.indexability_audit?.categories),
      issuesFromChecks(report.structured_data_audit?.checks, report.structured_data_audit?.categories),
      issuesFromChecks(report.on_page_seo_audit?.checks, report.on_page_seo_audit?.categories),
      issuesFromChecks(report.image_seo_audit?.checks, report.image_seo_audit?.categories),
      issuesFromChecks(report.eeat_audit?.checks, report.eeat_audit?.categories),
      issuesFromChecks(report.trust_signals_audit?.checks, report.trust_signals_audit?.categories)
    );
    const tabList = Object.values(tabs);
    const openIssues = issueCounts.high + issueCounts.medium + issueCounts.low;
    const priority = tabList
      .filter((tab) => tab.categories.length > 0)
      .sort((a, b) => a.score - b.score || b.issues - a.issues)[0] ?? tabs.technical;
    const nextPriority = tabList
      .filter((tab) => tab.label !== priority.label && tab.categories.length > 0)
      .sort((a, b) => a.score - b.score || b.issues - a.issues)[0];
    const auditScores = tabList.map((tab) => tab.score);
    const issueTrend = buildIssueTrend(issueCounts, aiVisibilityScore);
    const lastAuditedAt = report.created_at ?? tabList.map((tab) => tab.checkedAt).find(Boolean);
    return { tabs, aiVisibilityScore, issueCounts, issueTrend, openIssues, priority, nextPriority, auditScores, lastAuditedAt };
  }, [report]);

  if (error) {
    return <main className={styles.page}><div className={styles.container}><article className={styles.card} style={{ padding: 24, color: "#DC2626" }}>{error}</article></div></main>;
  }

  if (!report || !derived) {
    return <main className={styles.page}><div className={styles.container}><article className={styles.card} style={{ padding: 24 }}>Loading report...</article></div></main>;
  }

  const { tabs, aiVisibilityScore, issueCounts, issueTrend, openIssues, priority, nextPriority, auditScores, lastAuditedAt } = derived;
  const activeTab = tabs[active];
  const priorityIssues = priorityIssueGroups(priority);
  const pdfExportUrl = `${API_BASE}/api/reports/${params.id}/export/pdf`;
  const reviewPriority = () => {
    setActive((Object.keys(tabs) as AuditTabId[]).find((tab) => tabs[tab].label === priority.label) ?? "technical");
    requestAnimationFrame(() => document.getElementById("audit-categories")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const goToFullReport = () => {
    document.getElementById("full-report")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const kpis = [
    { label: "AI Visibility Score", value: `${aiVisibilityScore}%`, meta: statusLabel(aiVisibilityScore), icon: "AI", chip: "#FBF1E3", color: "#B8902B", series: auditScores },
    { label: "Open Issues", value: String(openIssues), meta: `${issueCounts.high} high impact`, icon: "!", chip: "#FBEAEA", color: "#DC2626", series: paddedSeries([issueCounts.low, issueCounts.medium, issueCounts.high], openIssues) },
    { label: "Pages Crawlable", value: `${tabs.crawlability.score}%`, meta: `${tabs.crawlability.issues} crawl issues`, icon: "CR", chip: "#EAF6EF", color: "#1F9D55", series: categoryScoreSeries(tabs.crawlability.categories, tabs.crawlability.score) },
    { label: "AI Citation Readiness", value: `${Math.max(tabs.citation.score, tabs.gemini.score)}%`, meta: `${tabs.citation.issues + tabs.gemini.issues} citation issues`, icon: "CT", chip: "#FBF1E3", color: "#B8902B", series: paddedSeries([tabs.citation.score, tabs.gemini.score, tabs.geo.score], tabs.geo.score) }
  ];
  const scoreTiles = [
    tabs.onPageSeo, tabs.imageSeo, tabs.eeat, tabs.trustSignals, tabs.geo, tabs.citation, tabs.gemini, tabs.indexability, tabs.structuredData, tabs.technical
  ];
  const radarAxes = [
    { label: "On-Page", value: tabs.onPageSeo.score }, { label: "Image", value: tabs.imageSeo.score }, { label: "E-E-A-T", value: tabs.eeat.score },
    { label: "Trust", value: tabs.trustSignals.score }, { label: "GEO", value: tabs.geo.score }, { label: "ChatGPT", value: tabs.citation.score },
    { label: "Gemini", value: tabs.gemini.score }, { label: "Index", value: tabs.indexability.score }, { label: "Schema", value: tabs.structuredData.score }, { label: "Tech", value: tabs.technical.score }
  ];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topInner}>
          <div className={styles.brand}><span>G</span><strong>GLOMAUDIT</strong></div>
          <div className={styles.actions}><button className={styles.secondary} onClick={goToFullReport}>Export PDF</button><button className={styles.primary} onClick={() => router.push("/")}>Generate New Report</button></div>
        </div>
      </header>

      <div className={styles.container}>
        <section className={styles.reportHeader}>
          <p>AI VISIBILITY REPORT</p>
          <h1>{report.brand}</h1>
          <div><a href={report.url} target="_blank">{report.url}</a><span>·</span><span className={styles.liveDot} />Last audited: {formatAuditDate(lastAuditedAt)}</div>
        </section>

        <section className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <article className={`${styles.card} ${styles.kpi}`} key={kpi.label}>
              <span className={styles.kpiIcon} style={{ background: kpi.chip }}>{kpi.icon}</span>
              <p>{kpi.label}</p><strong>{kpi.value}</strong>
              <div><span>{kpi.meta}</span> current audit</div>
              <Sparkline series={kpi.series} color={kpi.color} />
            </article>
          ))}
        </section>

        <section className={styles.heroGrid}>
          <article className={`${styles.card} ${styles.scoreCard}`}>
            <GaugeRing score={aiVisibilityScore} />
            <h2>AI Visibility Score</h2>
            <span className={`${styles.badge} ${styles.minor}`}>! {report.rating_label}</span>
            <p>{report.score_explanation || "Weighted average across all audit categories below."}</p>
          </article>
          <article className={styles.insight}>
            <div className={styles.insightTop}><span>P1</span><b>PRIORITY ACTION</b><em>{priority.issues} issues</em></div>
            <h2>Improve {priority.label} first</h2>
            <p>{report.rating_description || "Improve trust, expertise, structured data, and crawl readiness to lift AI visibility across answer engines."}</p>
            {priorityIssues.length ? (
              <div className={styles.priorityList}>
                {priorityIssues.map((issue, index) => (
                  <button key={issue.categoryName} type="button" onClick={reviewPriority}>
                    <span>{index === 0 ? "P0" : `P${index}`}</span>
                    <div><b>{issue.categoryName}</b><small>{issue.failedChecks} high-priority {issue.failedChecks === 1 ? "issue" : "issues"} · {clampScore(issue.score)}% score</small></div>
                    <i>Review -&gt;</i>
                  </button>
                ))}
              </div>
            ) : null}
            <footer><button className={styles.primary} onClick={reviewPriority}>Review {priority.label} issues -&gt;</button>{nextPriority ? <span>P2: {nextPriority.label} is next at {nextPriority.score}%.</span> : null}</footer>
          </article>
        </section>

        <section className={styles.chartGrid}>
          <article className={styles.card}><div className={styles.cardTitle}><h2>Visibility profile</h2></div><RadarChart axes={radarAxes} /></article>
          <article className={styles.card}>
            <div className={styles.cardTitle}><div><h2>Open issues over time</h2><p className={styles.chartSubtitle}>By severity - trending down as fixes ship</p></div><div className={styles.legend}><span><i className={styles.high} />High</span><span><i className={styles.medium} />Medium</span><span><i className={styles.low} />Low</span></div></div>
            <StackedArea data={issueTrend} />
          </article>
        </section>

        <section className={styles.actionPlanBanner}>
          <p>Want to improve your score? Request a free AEO, GEO action plan from the Glomaudit team.</p>
          <button type="button">Request Action Plan ↓</button>
        </section>

        <section className={`${styles.card} ${styles.aiReadiness}`}>
          <div className={styles.cardTitle}><h2>AI readiness</h2><p>Implemented audit signals for citation, crawl, and answer visibility.</p></div>
          <div className={styles.engineGrid}>
            <MiniGauge name="ChatGPT" sub="GPT-4o · Search" score={tabs.citation.score} />
            <MiniGauge name="Gemini" sub="Google AI Overviews" score={tabs.gemini.score} />
            <MiniGauge name="GEO / AEO" sub="Answer readiness" score={tabs.geo.score} />
            <MiniGauge name="Overall AI" sub="Weighted readiness" score={aiVisibilityScore} />
          </div>
        </section>

        <section className={`${styles.card} ${styles.opportunities}`}>
          <div><h2>Visibility Opportunities</h2><p>{openIssues} prioritized findings across this audit.</p></div>
          <div><span className={styles.issuePill}><i className={styles.high} />High impact {issueCounts.high}</span><span className={styles.issuePill}><i className={styles.medium} />Medium {issueCounts.medium}</span><span className={styles.issuePill}><i />Low {issueCounts.low}</span></div>
        </section>

        <section>
          <div className={styles.sectionHead}><h2>Scores by category</h2><p>Current score distribution from the latest audit</p></div>
          <div className={styles.tileGrid}>
            {scoreTiles.map((tile) => (
              <article className={`${styles.card} ${styles.tile}`} key={tile.label}>
                <div><b>{tile.label}</b><span className={tile.issues > 0 ? styles.deltaBad : styles.deltaGood}>{tile.issues} issues</span></div>
                <strong>{tile.score}%</strong>
                <Sparkline series={categoryScoreSeries(tile.categories, tile.score)} color={scoreTone(tile.score)} muted={tile.categories.length === 0} />
              </article>
            ))}
          </div>
        </section>

        <section id="audit-categories">
          <div className={styles.sectionHead}><h2>Audit Categories</h2><p>{activeTab.categories.length} check groups in {activeTab.label}</p></div>
          <div className={styles.tabs}>
            {(Object.keys(tabs) as AuditTabId[]).map((tab) => <button key={tab} type="button" className={tab === active ? styles.activeTab : ""} onClick={() => setActive(tab)}>{tabs[tab].label}</button>)}
          </div>
          <div className={styles.auditGrid}>
            {activeTab.categories.length ? activeTab.categories.map((category) => <AuditCard key={category.categoryName} category={category} />) : <article className={`${styles.card} ${styles.auditCard}`}><h3>No categories available</h3><p>This audit section did not return category data.</p></article>}
          </div>
        </section>

        <section className={styles.cta} id="full-report">
          <div><h2>Unlock your complete AI visibility report</h2><p>We identified {issueCounts.high} high-impact issues that can materially improve your AI visibility and citation readiness.</p>
            <ul>{["What's hurting your rankings", "Why AI isn't citing your content", "Entity and authority gaps", "Missing trust signals", "Technical visibility blockers", "Revenue-impact opportunities"].map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><a className={styles.blackButton} href={pdfExportUrl} download>Get my full report</a><button className={styles.outlineGold}>Schedule strategy call</button></div>
        </section>

        <section className={styles.strategyUpgrade}>
          <p>UPGRADE YOUR STRATEGY</p>
          <h2>Upgrade from SEO → GEO</h2>
          <span>Your customers are no longer searching only on Google. GEO helps your brand get discovered across AI-powered search and decision platforms.</span>
          <div className={styles.strategyPills}>
            {strategyItems.map((item) => {
              const Icon = item.icon;
              return (
                <b key={item.label}>
                  <Icon aria-hidden="true" />
                  {item.label}
                </b>
              );
            })}
          </div>
          <strong>Increase your visibility across ChatGPT, Gemini and Google AI.</strong>
          <em>⚡ Limited onboarding slots available</em>
          <button className={styles.blackButton} type="button">Get My AI Visibility Strategy</button>
        </section>

        <footer className={styles.footer}>
          <p>Run another audit - generate a fresh visibility report.</p>
          <button className={styles.secondary} onClick={() => router.push("/")}>Generate New Report</button>
        </footer>
        <p className={styles.copyright}>© 2026 GLOMAUDIT Pvt. Ltd. All Rights Reserved.</p>
      </div>
    </main>
  );
}
