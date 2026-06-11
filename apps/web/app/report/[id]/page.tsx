"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { StructuredAiVisibilityReport } from "@aiva/core";
import { API_BASE, getReport } from "@/lib/api";
import { CHATGPT_CITATION_CATEGORIES, GEMINI_CITATION_CATEGORIES } from "@/lib/audit-citation-categories";
import styles from "./page.module.css";

type Status = "Passed" | "Minor Attention" | "Needs Attention" | "Skipped";
type CategoryLike = {
  categoryName: string;
  totalChecks: number;
  failedChecks: number;
  score: number;
  status: string;
  skippedChecks?: number;
};
type AuditTabId = "technical" | "crawlability" | "structuredData" | "onPageSeo" | "imageSeo" | "eeat" | "trustSignals" | "geo" | "citation" | "gemini" | "indexability";

const statusMeta: Record<Status, { icon: string; className: string }> = {
  Passed: { icon: "✓", className: styles.passed },
  "Minor Attention": { icon: "△", className: styles.minor },
  "Needs Attention": { icon: "✕", className: styles.needs },
  Skipped: { icon: "–", className: styles.skipped }
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

function statusFor(score: number, skipped = false): Status {
  if (skipped) return "Skipped";
  if (score >= 90) return "Passed";
  if (score >= 60) return "Minor Attention";
  return "Needs Attention";
}

function points(series: number[], width: number, height: number, pad = 5) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const spread = max - min || 1;
  return series.map((value, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - pad - ((value - min) / spread) * (height - pad * 2);
    return [x, y] as const;
  });
}

function trendTo(value: number, lift = 14) {
  return [value - lift, value - lift + 2, value - lift + 1, value - 9, value - 7, value - 5, value - 4, value - 2, value - 3, value - 1, value, value].map(clampScore);
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

function StackedArea({ high, medium, low }: { high: number; medium: number; low: number }) {
  const highSeries = trendTo(high, 26);
  const mediumSeries = trendTo(medium, 26);
  const lowSeries = trendTo(low, 22);
  const width = 720;
  const height = 280;
  const pad = 28;
  const max = Math.max(1, ...highSeries.map((v, i) => v + mediumSeries[i] + lowSeries[i])) * 1.05;
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const x = (i: number) => pad + (i / (highSeries.length - 1)) * (width - pad * 2);
  const band = (top: number[], bottom: number[]) => `${top.map((v, i) => `${x(i)},${y(v)}`).join(" ")} ${bottom.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" ")}`;
  const hTop = highSeries;
  const mTop = highSeries.map((v, i) => v + mediumSeries[i]);
  const lTop = mTop.map((v, i) => v + lowSeries[i]);
  const zero = highSeries.map(() => 0);
  return (
    <svg className={styles.areaChart} viewBox={`0 0 ${width} ${height}`} aria-label="Open issues over time">
      <polygon points={band(lTop, mTop)} fill="#C9A330" opacity="0.68" />
      <polygon points={band(mTop, hTop)} fill="#D97706" opacity="0.72" />
      <polygon points={band(hTop, zero)} fill="#DC2626" opacity="0.78" />
      {["8w", "7w", "6w", "5w", "4w", "3w", "2w", "now"].map((label, i) => <text key={label} x={x(i)} y={height - 6} textAnchor="middle" className={styles.axisText}>{label}</text>)}
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
    const tabs: Record<AuditTabId, { label: string; categories: CategoryLike[]; score: number }> = {
      technical: { label: "Technical Audit", categories: technical, score: clampScore(report.technical_audit?.score) },
      crawlability: { label: "Crawlability", categories: crawlability, score: scoreFromCategories(crawlability) },
      structuredData: { label: "Structured data", categories: report.structured_data_audit?.categories ?? [], score: clampScore(report.structured_data_audit?.score) },
      onPageSeo: { label: "On-Page SEO", categories: report.on_page_seo_audit?.categories ?? [], score: clampScore(report.on_page_seo_audit?.score) },
      imageSeo: { label: "Image SEO", categories: report.image_seo_audit?.categories ?? [], score: clampScore(report.image_seo_audit?.score) },
      eeat: { label: "EEAT Audit", categories: report.eeat_audit?.categories ?? [], score: clampScore(report.eeat_audit?.score) },
      trustSignals: { label: "Trust Signal", categories: report.trust_signals_audit?.categories ?? [], score: clampScore(report.trust_signals_audit?.score) },
      geo: { label: "GEO / AEO Audit", categories: geo, score: scoreFromCategories(geo, report.geo_aeo_audit?.score) },
      citation: { label: "ChatGPT Citation", categories: citation, score: scoreFromCategories(citation) },
      gemini: { label: "Gemini Citation", categories: gemini, score: scoreFromCategories(gemini) },
      indexability: { label: "Indexability", categories: report.indexability_audit?.categories ?? [], score: clampScore(report.indexability_audit?.score) }
    };
    const scores = [
      tabs.onPageSeo.score, tabs.imageSeo.score, tabs.eeat.score, tabs.trustSignals.score, tabs.geo.score,
      tabs.citation.score, tabs.gemini.score, tabs.indexability.score, tabs.structuredData.score, tabs.technical.score
    ];
    const aiVisibilityScore = clampScore(report.overall_score || scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const issueCounts = report.opportunity_counts ?? report.geo_aeo_audit?.opportunity_counts ?? { high: 0, medium: 0, low: 0 };
    const openIssues = issueCounts.high + issueCounts.medium + issueCounts.low || Object.values(tabs).reduce((sum, tab) => sum + issueCount(tab.categories), 0);
    return { tabs, aiVisibilityScore, issueCounts, openIssues };
  }, [report]);

  if (error) {
    return <main className={styles.page}><div className={styles.container}><article className={styles.card} style={{ padding: 24, color: "#DC2626" }}>{error}</article></div></main>;
  }

  if (!report || !derived) {
    return <main className={styles.page}><div className={styles.container}><article className={styles.card} style={{ padding: 24 }}>Loading report...</article></div></main>;
  }

  const { tabs, aiVisibilityScore, issueCounts, openIssues } = derived;
  const activeTab = tabs[active];
  const pdfExportUrl = `${API_BASE}/api/reports/${params.id}/export/pdf`;
  const kpis = [
    { label: "AI Visibility Score", value: `${aiVisibilityScore}%`, delta: "▲ live", icon: "◉", chip: "#FBF1E3", color: "#B8902B", series: trendTo(aiVisibilityScore) },
    { label: "Open Issues", value: String(openIssues), delta: "▼ prioritized", icon: "⚑", chip: "#FBEAEA", color: "#DC2626", series: trendTo(openIssues, 24) },
    { label: "Pages Crawlable", value: `${tabs.crawlability.score}%`, delta: "▲ audit", icon: "◰", chip: "#EAF6EF", color: "#1F9D55", series: trendTo(tabs.crawlability.score) },
    { label: "AI Citations Won", value: `${tabs.citation.score}%`, delta: "▲ readiness", icon: "✦", chip: "#FBF1E3", color: "#B8902B", series: trendTo(tabs.citation.score) }
  ];
  const scoreTiles = [
    ["On-Page SEO", tabs.onPageSeo.score, 3], ["Image SEO", tabs.imageSeo.score, 0], ["EEAT Audit", tabs.eeat.score, 0],
    ["Trust Signal", tabs.trustSignals.score, 2], ["GEO / AEO", tabs.geo.score, 5], ["ChatGPT Citation", tabs.citation.score, 4],
    ["Gemini Citation", tabs.gemini.score, -2], ["Indexability", tabs.indexability.score, 1], ["Structured Data", tabs.structuredData.score, 6], ["Technical Audit", tabs.technical.score, 3]
  ] as const;
  const radarAxes = [
    { label: "On-Page", value: tabs.onPageSeo.score }, { label: "Image", value: tabs.imageSeo.score }, { label: "E-E-A-T", value: tabs.eeat.score },
    { label: "Trust", value: tabs.trustSignals.score }, { label: "GEO", value: tabs.geo.score }, { label: "ChatGPT", value: tabs.citation.score },
    { label: "Gemini", value: tabs.gemini.score }, { label: "Index", value: tabs.indexability.score }, { label: "Schema", value: tabs.structuredData.score }, { label: "Tech", value: tabs.technical.score }
  ];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topInner}>
          <div className={styles.brand}><span>V</span><strong>VISIBILITY AUDIT</strong></div>
          <div className={styles.actions}><button className={styles.secondary} onClick={() => navigator.clipboard.writeText(window.location.href)}>↗ Share URL</button><button className={styles.primary} onClick={() => router.push("/")}>Generate New Report</button></div>
        </div>
      </header>

      <div className={styles.container}>
        <section className={styles.reportHeader}>
          <p>AI VISIBILITY REPORT</p>
          <h1>{report.brand}</h1>
          <div><a href={report.url} target="_blank">{report.url}</a><span>•</span><span className={styles.liveDot} />Last audited: just now</div>
        </section>

        <section className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <article className={`${styles.card} ${styles.kpi}`} key={kpi.label}>
              <span className={styles.kpiIcon} style={{ background: kpi.chip }}>{kpi.icon}</span>
              <p>{kpi.label}</p><strong>{kpi.value}</strong>
              <div><span>{kpi.delta}</span> vs last audit</div>
              <Sparkline series={kpi.series} color={kpi.color} />
            </article>
          ))}
        </section>

        <section className={styles.heroGrid}>
          <article className={`${styles.card} ${styles.scoreCard}`}>
            <GaugeRing score={aiVisibilityScore} />
            <h2>AI Visibility Score</h2>
            <span className={`${styles.badge} ${styles.minor}`}>△ {report.rating_label}</span>
            <p>{report.score_explanation || "Weighted average across all audit categories below."}</p>
          </article>
          <article className={styles.insight}>
            <div className={styles.insightTop}><span>P1</span><b>PRIORITY ACTION</b><em>Est. +14 pts</em></div>
            <h2>Fix your E-E-A-T and Trust foundations first</h2>
            <p>{report.rating_description || "Improve trust, expertise, structured data, and crawl readiness to lift AI visibility across answer engines."}</p>
            <footer><button className={styles.primary} onClick={() => setActive("eeat")}>Review E-E-A-T issues →</button><span>P2: Structured Data is next at {tabs.structuredData.score}%.</span></footer>
          </article>
        </section>

        <section className={styles.chartGrid}>
          <article className={styles.card}><div className={styles.cardTitle}><h2>Visibility profile</h2></div><RadarChart axes={radarAxes} /></article>
          <article className={styles.card}>
            <div className={styles.cardTitle}><h2>Open issues over time</h2><div className={styles.legend}><span><i className={styles.high} />High</span><span><i className={styles.medium} />Medium</span><span><i className={styles.low} />Low</span></div></div>
            <StackedArea high={issueCounts.high} medium={issueCounts.medium} low={issueCounts.low} />
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}><h2>AI engine readiness</h2><p>Per-engine ability to crawl, understand, and cite the site.</p></div>
          <div className={styles.engineGrid}>
            <MiniGauge name="ChatGPT" sub="GPT-4o · Search" score={tabs.citation.score} />
            <MiniGauge name="Gemini" sub="Google AI Overviews" score={tabs.gemini.score} />
            <MiniGauge name="Perplexity" sub="GEO / AEO" score={tabs.geo.score} />
            <MiniGauge name="Overall AI" sub="Weighted readiness" score={aiVisibilityScore} />
          </div>
        </section>

        <section className={`${styles.card} ${styles.opportunities}`}>
          <div><h2>Visibility Opportunities</h2><p>{openIssues} prioritized findings across this audit.</p></div>
          <div><span className={styles.issuePill}><i className={styles.high} />High impact {issueCounts.high}</span><span className={styles.issuePill}><i className={styles.medium} />Medium {issueCounts.medium}</span><span className={styles.issuePill}><i />Low {issueCounts.low}</span></div>
        </section>

        <section>
          <div className={styles.sectionHead}><h2>Scores by category</h2><p>90-day trend per category · ▲ improving</p></div>
          <div className={styles.tileGrid}>
            {scoreTiles.map(([name, score, delta]) => (
              <article className={`${styles.card} ${styles.tile}`} key={name}>
                <div><b>{name}</b><span className={delta > 0 ? styles.deltaGood : delta < 0 ? styles.deltaBad : styles.deltaFlat}>{delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "—"}</span></div>
                <strong>{score}%</strong>
                <Sparkline series={trendTo(score, 18)} color="#B8902B" muted={score === 0} />
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className={styles.sectionHead}><h2>Audit Categories</h2><p>{activeTab.categories.length} check groups in {activeTab.label}</p></div>
          <div className={styles.tabs}>
            {(Object.keys(tabs) as AuditTabId[]).map((tab) => <button key={tab} type="button" className={tab === active ? styles.activeTab : ""} onClick={() => setActive(tab)}>{tabs[tab].label}</button>)}
          </div>
          <div className={styles.auditGrid}>
            {activeTab.categories.length ? activeTab.categories.map((category) => <AuditCard key={category.categoryName} category={category} />) : <article className={`${styles.card} ${styles.auditCard}`}><h3>No categories available</h3><p>This audit section did not return category data.</p></article>}
          </div>
        </section>

        <section className={styles.cta}>
          <div><h2>Unlock your complete AI visibility report</h2><p>We identified {issueCounts.high} high-impact issues that can materially improve your AI visibility and citation readiness.</p>
            <ul>{["Complete issue breakdown", "Priority roadmap", "AI visibility strategy", "Page-level findings", "Implementation recommendations"].map((item) => <li key={item}>✓ {item}</li>)}</ul></div>
          <div><a className={styles.blackButton} href={pdfExportUrl} download>Get my full report</a><button className={styles.outlineGold}>Schedule strategy call</button></div>
        </section>

        <footer className={styles.footer}><p>Run another audit — generate a fresh visibility report.</p><button className={styles.secondary} onClick={() => router.push("/")}>Generate New Report</button></footer>
      </div>
    </main>
  );
}
