"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { StructuredAiVisibilityReport } from "@aiva/core";
import { CalendarCheck, Download, ExternalLink, Link2, Sparkles } from "lucide-react";
import { API_BASE, getReport, submitStrategyCall } from "@/lib/api";
import { CHATGPT_CITATION_CATEGORIES, GEMINI_CITATION_CATEGORIES } from "@/lib/audit-citation-categories";
import { Button, Card } from "@/components/ui";

function scoreColor(score: number) {
  if (score < 50) return "text-[#e85d4f]";
  if (score < 80) return "text-[#f4b942]";
  return "text-[#0f766e]";
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const classes = {
    neutral: "bg-ink/10 text-ink",
    good: "bg-[#0f766e]/10 text-[#0f766e] ring-1 ring-[#0f766e]/20",
    warn: "bg-[#f4b942]/15 text-ink ring-1 ring-[#f4b942]/25",
    bad: "bg-[#e85d4f]/10 text-[#e85d4f] ring-1 ring-[#e85d4f]/20"
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

type AuditCategoryCardData = {
  categoryName: string;
  totalChecks: number;
  failedChecks: number;
  warningChecks?: number;
  skippedChecks?: number;
  score: number;
  status: string;
};

type IssueParameterData = {
  id: number;
  name: string;
  severity: string;
  warning?: boolean;
};

type TabStatus = "passed" | "issues" | "attention";

function categoryAccent(category: AuditCategoryCardData, isSkipped = false) {
  if (isSkipped) return "border-l-[#f4b942]";
  if (category.status === "Needs Attention") return "border-l-[#f4b942]";
  if ((category.warningChecks ?? 0) > 0 || category.status === "Minor Attention") return "border-l-[#f4b942]";
  if (category.failedChecks > 0) return "border-l-[#e85d4f]";
  return "border-l-[#0f766e]";
}

function statusTextColor(status: string) {
  if (status === "Passed") return "text-[#0f766e]";
  if (status === "Needs Attention") return "text-[#f4b942]";
  if (status === "Minor Attention") return "text-[#f4b942]";
  if (status === "Skipped") return "text-ink/60";
  return "text-[#e85d4f]";
}

function tabStatus(categories: AuditCategoryCardData[], unavailable = false): TabStatus {
  if (unavailable || !categories.length || categories.some((category) => category.status === "Skipped")) return "attention";
  if (categories.some((category) => category.failedChecks > 0 || category.status === "Needs Attention")) return "issues";
  if (categories.some((category) => (category.warningChecks ?? 0) > 0 || category.status === "Minor Attention")) return "attention";
  return "passed";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreFromCategories(categories: AuditCategoryCardData[], fallback = 0) {
  const scorable = categories.filter((category) => category.totalChecks > 0 && category.status !== "Skipped");
  if (!scorable.length) return clampScore(fallback);
  const totalChecks = scorable.reduce((sum, category) => sum + category.totalChecks, 0);
  if (!totalChecks) return clampScore(fallback);
  return clampScore(scorable.reduce((sum, category) => sum + category.score * category.totalChecks, 0) / totalChecks);
}

function averageScore(scores: number[]) {
  if (!scores.length) return 0;
  return clampScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function scoreBadgeTone(score: number): "good" | "warn" | "bad" {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function visibilityRatingLabel(score: number) {
  if (score <= 40) return "Poor";
  if (score <= 55) return "Below Average";
  if (score <= 70) return "Average";
  if (score <= 85) return "Good";
  return "Excellent";
}

type IssueImpactCounts = { high: number; medium: number; low: number };
type CountableAuditCheck = { id?: number; category?: string; name?: string; passed?: boolean; skipped?: boolean; warning?: boolean; severity?: string };

function impactFromSeverity(severity = ""): keyof IssueImpactCounts {
  if (["BLOCKER", "Critical", "High"].includes(severity)) return "high";
  if (["MAJOR", "Medium"].includes(severity)) return "medium";
  return "low";
}

function addIssueCounts(left: IssueImpactCounts, right: IssueImpactCounts): IssueImpactCounts {
  return {
    high: left.high + right.high,
    medium: left.medium + right.medium,
    low: left.low + right.low
  };
}

function issueCountsFromChecks(checks: CountableAuditCheck[] = []): IssueImpactCounts {
  return checks.reduce<IssueImpactCounts>((counts, check) => {
    if (check.skipped) return counts;
    const hasIssue = check.passed === false || check.warning === true;
    if (!hasIssue) return counts;
    const impact = impactFromSeverity(check.severity);
    return { ...counts, [impact]: counts[impact] + 1 };
  }, { high: 0, medium: 0, low: 0 });
}

function issueParametersForCategory(checks: CountableAuditCheck[] = [], categoryName: string): IssueParameterData[] {
  return checks
    .filter((check) => check.category === categoryName && !check.skipped && (check.passed === false || check.warning === true))
    .map((check, index) => ({
      id: Number(check.id ?? index),
      name: check.name ?? "Unnamed parameter",
      severity: check.severity ?? "Issue",
      warning: check.warning === true && check.passed !== false
    }));
}

function statusDot(status: TabStatus) {
  return status === "passed" ? "bg-[#0f766e]" : status === "issues" ? "bg-[#e85d4f]" : "bg-[#f4b942]";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "Passed") {
    return (
      <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3.5 8.2 6.6 11 12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "Needs Attention" || status === "Minor Attention") {
    return (
      <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2 14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8 6v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ScoreDonut({ score, dark = false, size = 96 }: { score: number; dark?: boolean; size?: number }) {
  const strokeWidth = size >= 112 ? 12 : 9;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" stroke={dark ? "#263238" : "#e5e7eb"} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#f4b942"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={`absolute text-2xl font-black ${dark ? "text-white" : "text-ink"}`}>{score}%</span>
    </div>
  );
}

function SummaryScoreCard({
  title,
  score,
  badges,
  description,
  dark = false,
  footer
}: {
  title: string;
  score: number;
  badges: React.ReactNode;
  description?: string;
  dark?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={`flex min-h-[176px] flex-col justify-between overflow-hidden p-5 ${dark ? "border-[#263238] bg-ink text-white" : "bg-white text-ink"}`}>
      <div className="flex flex-1 items-center gap-5">
        <ScoreDonut score={score} dark={dark} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-black ${dark ? "text-white/70" : "text-ink/60"}`}>{title}</p>
          <div className="mt-4 flex flex-wrap gap-2">{badges}</div>
          {description ? <p className={`mt-4 line-clamp-3 text-sm leading-6 ${dark ? "text-white/66" : "text-ink/60"}`}>{description}</p> : null}
        </div>
      </div>
      <div className={`mt-5 h-1 overflow-hidden rounded-full ${dark ? "bg-[#263238]" : "bg-black/10"}`}>
        <div className="h-full rounded-full bg-[#f4b942]" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      {footer ? <div className={`mt-4 border-t pt-4 ${dark ? "border-white/10" : "border-black/10"}`}>{footer}</div> : null}
    </Card>
  );
}

function AuditTabButton({ active, status, onClick, children }: { active: boolean; status: TabStatus; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-sm font-black transition ${
        active
          ? "border-ink bg-ink text-white"
          : "border-black/10 bg-white text-ink/60 hover:bg-mist"
      }`}
    >
      <span>{children}</span>
      <span className={`size-2 rounded-full ${active ? "bg-white" : statusDot(status)}`} />
    </button>
  );
}

function ScorePill({ label, score, onClick }: { label: string; score: number; onClick: () => void }) {
  const tone = scoreBadgeTone(score);
  const classes = {
    good: "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]",
    warn: "border-[#f97316] bg-[#f97316]/10 text-[#f97316]",
    bad: "border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]"
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black transition hover:bg-white/10 ${classes[tone]}`}
    >
      <span>{label}</span>
      <span>{score}%</span>
    </button>
  );
}

function AuditCategoryCard({
  category,
  badgeTone,
  badgeLabel,
  isSkipped = false,
  statusLabel,
  issueParameters = []
}: {
  category: AuditCategoryCardData;
  badgeTone: "neutral" | "good" | "warn" | "bad";
  badgeLabel: string;
  isSkipped?: boolean;
  statusLabel: string;
  issueParameters?: IssueParameterData[];
}) {
  const hasIssues = category.failedChecks >= 1;
  const visibleParameters = issueParameters.slice(0, 4);
  const hiddenParameters = issueParameters.slice(4);

  return (
    <Card className={`border-l-4 ${categoryAccent(category, isSkipped)} p-4 shadow-soft transition hover:border-black/20`}>
      <div className="flex min-h-10 items-start justify-between gap-3">
        <h3 className="text-[15px] font-black leading-5 text-ink">{category.categoryName}</h3>
        <Badge tone={badgeTone}>{badgeLabel}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-black/10 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink/60">Checks</p>
          <p className="mt-1 text-xl font-black text-ink">{category.totalChecks}</p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink/60">Issues</p>
          <p className={`mt-1 text-xl font-black ${hasIssues ? "text-[#e85d4f]" : "text-[#0f766e]"}`}>{category.failedChecks}</p>
        </div>
        <div className="rounded-md border border-black/10 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink/60">Score</p>
          <p className={`mt-1 text-xl font-black ${isSkipped ? "text-ink/60" : scoreColor(category.score)}`}>{isSkipped ? "N/A" : `${category.score}%`}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-md bg-white px-3 py-2">
        <p className="text-[11px] font-black uppercase tracking-wide text-ink/60">Status</p>
        <p className={`inline-flex items-center gap-1.5 text-sm font-black ${statusTextColor(statusLabel)}`}>
          <StatusIcon status={statusLabel} />
          {statusLabel}
        </p>
      </div>
      {issueParameters.length ? (
        <div className="mt-4 border-t border-black/10 pt-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink/60">Issue parameters</p>
          <div className="mt-2 grid gap-1.5">
            {visibleParameters.map((parameter) => (
              <div key={`${parameter.id}-${parameter.name}`} className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                <span className={`size-2 shrink-0 rounded-full ${parameter.warning ? "bg-[#f4b942]" : "bg-[#e85d4f]"}`} />
                <span className="min-w-0 flex-1 truncate">{parameter.name}</span>
                <span className="text-[10px] font-black uppercase text-ink/40">{parameter.severity}</span>
              </div>
            ))}
            {hiddenParameters.length ? (
              <details className="group">
                <summary className="cursor-pointer list-none text-xs font-black text-ink/55 transition hover:text-ink">
                  Show {hiddenParameters.length} more issue parameters
                </summary>
                <div className="mt-1.5 grid gap-1.5">
                  {hiddenParameters.map((parameter) => (
                    <div key={`${parameter.id}-${parameter.name}`} className="flex items-center gap-2 text-xs font-semibold text-ink/70">
                      <span className={`size-2 shrink-0 rounded-full ${parameter.warning ? "bg-[#f4b942]" : "bg-[#e85d4f]"}`} />
                      <span className="min-w-0 flex-1 truncate">{parameter.name}</span>
                      <span className="text-[10px] font-black uppercase text-ink/40">{parameter.severity}</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function EmptyAuditState({ title, message }: { title: string; message: string }) {
  return (
    <Card className="border-black/10 bg-white p-6">
      <p className="text-sm font-black text-ink">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">{message}</p>
    </Card>
  );
}

function categoriesUnavailable(categories: { totalChecks: number; status: string }[]) {
  return categories.length > 0 && categories.every((category) => category.totalChecks === 0 && category.status === "Skipped");
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auditSectionRef = useRef<HTMLElement | null>(null);
  const [report, setReport] = useState<StructuredAiVisibilityReport | null>(null);
  const [error, setError] = useState("");
  const [activeAuditTab, setActiveAuditTab] = useState<"technical" | "crawlability" | "structuredData" | "onPageSeo" | "imageSeo" | "eeat" | "trustSignals" | "geo" | "citation" | "gemini" | "indexability">("technical");
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [isSubmittingStrategy, setIsSubmittingStrategy] = useState(false);
  const [strategyStatus, setStrategyStatus] = useState("");
  const [strategyForm, setStrategyForm] = useState({ name: "", email: "", phone: "" });

  useEffect(() => {
    getReport(params.id).then(setReport).catch((err) => setError(err instanceof Error ? err.message : "Report not found"));
  }, [params.id]);

  async function onStrategySubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmittingStrategy(true);
    setStrategyStatus("");
    try {
      const result = await submitStrategyCall({ reportId: params.id, ...strategyForm });
      setStrategyStatus(result.message);
      if (result.whatsappUrl) window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      if (result.mailtoUrl) window.setTimeout(() => { window.location.href = result.mailtoUrl; }, 250);
    } catch (err) {
      setStrategyStatus(err instanceof Error ? err.message : "Could not submit strategy call request");
    } finally {
      setIsSubmittingStrategy(false);
    }
  }

  if (error) {
    return <main className="mx-auto min-h-screen max-w-3xl bg-mist px-5 py-10"><Card className="p-6 font-semibold text-[#e85d4f]">{error}</Card></main>;
  }

  if (!report) {
    return <main className="mx-auto min-h-screen max-w-3xl bg-mist px-5 py-10"><Card className="p-6 font-semibold text-ink/60">Loading report...</Card></main>;
  }

  const technicalCategories = report.technical_categories ?? [];
  const technicalAudit = report.technical_audit ?? {
    score: 0,
    grade: "F",
    issues_found: technicalCategories.reduce((sum, category) => sum + category.failedChecks, 0),
    checks: []
  };
  const geoAeoAudit = report.geo_aeo_audit ?? {
    score: 0,
    grade: "F",
    grade_description: "Critical GEO issues",
    page_score: 0,
    domain_score: 0,
    blocker_cap_applied: false,
    opportunity_counts: { high: 0, medium: 0, low: 0 },
    categories: []
  };
  const indexabilityAudit = report.indexability_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const structuredDataAudit = report.structured_data_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const onPageSeoAudit = report.on_page_seo_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const imageSeoAudit = report.image_seo_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const eeatAudit = report.eeat_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const trustSignalsAudit = report.trust_signals_audit ?? {
    score: 0,
    issues_found: 0,
    categories: [],
    checks: []
  };
  const geoCategories = geoAeoAudit.categories.filter((category) => !CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) && !GEMINI_CITATION_CATEGORIES.includes(category.categoryName) && category.categoryName !== "ChatGPT Citation" && category.categoryName !== "Gemini Citation");
  const citationCategories = geoAeoAudit.categories.filter((category) => CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "ChatGPT Citation");
  const geminiCategories = geoAeoAudit.categories.filter((category) => GEMINI_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "Gemini Citation");
  const crawlabilityCategories = technicalCategories.filter((category) =>
    [
      "Robots.txt & Sitemap",
      "Indexability & Crawlability",
      "Internal Linking",
      "AI Crawl Readiness"
    ].includes(category.categoryName)
  );
  const structuredDataCategories = structuredDataAudit.categories;
  const onPageSeoCategories = onPageSeoAudit.categories;
  const imageSeoCategories = imageSeoAudit.categories;
  const eeatCategories = eeatAudit.categories;
  const trustSignalsCategories = trustSignalsAudit.categories;
  const indexabilityCategories = indexabilityAudit.categories;
  const structuredDataUnavailable = categoriesUnavailable(structuredDataCategories);
  const onPageSeoUnavailable = categoriesUnavailable(onPageSeoCategories);
  const imageSeoUnavailable = categoriesUnavailable(imageSeoCategories);
  const eeatUnavailable = categoriesUnavailable(eeatCategories);
  const trustSignalsUnavailable = categoriesUnavailable(trustSignalsCategories);
  const geoUnavailable = categoriesUnavailable(geoCategories);
  const indexabilityUnavailable = categoriesUnavailable(indexabilityCategories);
  const citationLikeCategories = activeAuditTab === "gemini" ? geminiCategories : citationCategories;
  const citationLikeUnavailable = categoriesUnavailable(citationLikeCategories);
  const geoStatusTone = (status: string): "neutral" | "good" | "warn" | "bad" => status === "Skipped" ? "neutral" : status === "Passed" ? "good" : status === "Minor Attention" ? "warn" : "bad";
  const pdfExportUrl = `${API_BASE}/api/reports/${params.id}/export/pdf`;
  const scorePills = [
    { id: "onPageSeo" as const, label: "On-Page SEO", score: clampScore(onPageSeoAudit.score) },
    { id: "imageSeo" as const, label: "Image SEO", score: clampScore(imageSeoAudit.score) },
    { id: "eeat" as const, label: "EEAT Audit", score: clampScore(eeatAudit.score) },
    { id: "trustSignals" as const, label: "Trust Signal", score: clampScore(trustSignalsAudit.score) },
    { id: "geo" as const, label: "GEO/AEO", score: scoreFromCategories(geoCategories, geoAeoAudit.score) },
    { id: "citation" as const, label: "ChatGPT Citation", score: scoreFromCategories(citationCategories) },
    { id: "gemini" as const, label: "Gemini Citation", score: scoreFromCategories(geminiCategories) },
    { id: "indexability" as const, label: "Indexability", score: clampScore(indexabilityAudit.score) },
    { id: "structuredData" as const, label: "Structured Data", score: clampScore(structuredDataAudit.score) },
    { id: "technical" as const, label: "Technical Audit", score: clampScore(technicalAudit.score) }
  ];
  const aiVisibilityScore = averageScore(scorePills.map((pill) => pill.score));
  const handleScorePillClick = (tabId: typeof scorePills[number]["id"]) => {
    setActiveAuditTab(tabId);
    window.setTimeout(() => {
      auditSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const issueImpactCounts = [
    issueCountsFromChecks(technicalAudit.checks),
    issueCountsFromChecks(indexabilityAudit.checks),
    issueCountsFromChecks(structuredDataAudit.checks),
    issueCountsFromChecks(onPageSeoAudit.checks),
    issueCountsFromChecks(imageSeoAudit.checks),
    issueCountsFromChecks(eeatAudit.checks),
    issueCountsFromChecks(trustSignalsAudit.checks),
    geoAeoAudit.opportunity_counts
  ].reduce(addIssueCounts, { high: 0, medium: 0, low: 0 });
  const auditTabs = [
    { id: "technical" as const, label: "Technical Audit", status: tabStatus(technicalCategories) },
    { id: "crawlability" as const, label: "Crawlability", status: tabStatus(crawlabilityCategories) },
    { id: "structuredData" as const, label: "Structured data", status: tabStatus(structuredDataCategories, structuredDataUnavailable) },
    { id: "onPageSeo" as const, label: "On-Page SEO", status: tabStatus(onPageSeoCategories, onPageSeoUnavailable) },
    { id: "imageSeo" as const, label: "Image SEO", status: tabStatus(imageSeoCategories, imageSeoUnavailable) },
    { id: "eeat" as const, label: "EEAT Audit", status: tabStatus(eeatCategories, eeatUnavailable) },
    { id: "trustSignals" as const, label: "Trust Signal", status: tabStatus(trustSignalsCategories, trustSignalsUnavailable) },
    { id: "geo" as const, label: "GEO / AEO Audit", status: tabStatus(geoCategories, geoUnavailable) },
    { id: "citation" as const, label: "ChatGPT Citation", status: tabStatus(citationCategories, categoriesUnavailable(citationCategories)) },
    { id: "gemini" as const, label: "Gemini Citation", status: tabStatus(geminiCategories, categoriesUnavailable(geminiCategories)) },
    { id: "indexability" as const, label: "Indexability", status: tabStatus(indexabilityCategories, indexabilityUnavailable) }
  ];

  return (
    <main className="min-h-screen bg-mist px-4 py-4 text-ink md:px-5">
      <div className="mx-auto max-w-7xl">
      <header className="relative mb-5 overflow-hidden rounded-lg border border-black/10 border-l-4 border-l-[#f4b942] bg-white p-4 shadow-soft md:p-5">
        <div className="absolute left-0 top-0 h-1 w-full bg-[#f4b942]" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-xs font-black text-ink">
            <Sparkles className="size-4" />
            AI Visibility Report
          </p>
          <h1 className="mt-3 text-2xl font-black leading-tight text-ink md:text-[28px]">{report.brand}</h1>
          <a className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink/60" href={report.url} target="_blank">
            {report.url}
            <ExternalLink className="size-3" />
          </a>
          <p className="mt-2 text-xs font-semibold text-ink/60">Last audited: just now</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-10 rounded-full bg-ink px-5 text-white hover:bg-[#263238]" onClick={() => navigator.clipboard.writeText(window.location.href)}><Link2 className="size-4" />Share URL</Button>
        </div>
        </div>
      </header>

      <section className="mb-5">
        <SummaryScoreCard
          dark
          title="AI Visibility Score"
          score={aiVisibilityScore}
          badges={<Badge tone={scoreBadgeTone(aiVisibilityScore)}>{visibilityRatingLabel(aiVisibilityScore)}</Badge>}
          description="Average score across all audit tabs below."
          footer={(
            <div className="no-scrollbar -mx-1 flex max-w-full snap-x flex-nowrap gap-2 overflow-x-auto whitespace-nowrap px-1 pb-1">
              {scorePills.map((pill) => (
                <ScorePill
                  key={pill.id}
                  label={pill.label}
                  score={pill.score}
                  onClick={() => handleScorePillClick(pill.id)}
                />
              ))}
            </div>
          )}
        />
      </section>

      <section ref={auditSectionRef} className="mb-5 scroll-mt-4">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-black/10 bg-white/70 p-3 shadow-soft backdrop-blur">
          <h2 className="text-[13px] font-black uppercase tracking-wider text-ink/60">Audit Categories</h2>
          <div className="no-scrollbar flex w-full snap-x gap-2 overflow-x-auto whitespace-nowrap">
            {auditTabs.map((tab) => (
              <AuditTabButton
                key={tab.id}
                active={activeAuditTab === tab.id}
                status={tab.status}
                onClick={() => setActiveAuditTab(tab.id)}
              >
                {tab.label}
              </AuditTabButton>
            ))}
          </div>
        </div>

        {activeAuditTab === "technical" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {technicalCategories.map((category) => {
              const hasIssues = category.failedChecks >= 1;

              return (
                <AuditCategoryCard
                  key={category.categoryName}
                  category={category}
                  badgeTone={hasIssues ? "bad" : "good"}
                  badgeLabel={hasIssues ? "Issues Found" : "Passed"}
                  statusLabel={category.status}
                  issueParameters={issueParametersForCategory(technicalAudit.checks, category.categoryName)}
                />
              );
            })}
          </div>
        ) : activeAuditTab === "crawlability" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {crawlabilityCategories.map((category) => {
              const hasIssues = category.failedChecks >= 1;

              return (
                <AuditCategoryCard
                  key={category.categoryName}
                  category={category}
                  badgeTone={hasIssues ? "bad" : "good"}
                  badgeLabel={hasIssues ? "Issues Found" : "Passed"}
                  statusLabel={category.status}
                  issueParameters={issueParametersForCategory(technicalAudit.checks, category.categoryName)}
                />
              );
            })}
          </div>
        ) : activeAuditTab === "structuredData" ? (
          structuredDataCategories.length && !structuredDataUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {structuredDataCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(structuredDataAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No structured data categories available"
              message={structuredDataUnavailable ? "Structured data audit timed out. Regenerate the report after restarting the audit server." : "This report does not include structured data category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : activeAuditTab === "onPageSeo" ? (
          onPageSeoCategories.length && !onPageSeoUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {onPageSeoCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(onPageSeoAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No On-Page SEO categories available"
              message={onPageSeoUnavailable ? "On-Page SEO audit timed out. Regenerate the report after restarting the audit server." : "This report does not include On-Page SEO category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : activeAuditTab === "imageSeo" ? (
          imageSeoCategories.length && !imageSeoUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {imageSeoCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(imageSeoAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No Image SEO categories available"
              message={imageSeoUnavailable ? "Image SEO audit timed out. Regenerate the report after restarting the audit server." : "This report does not include Image SEO category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : activeAuditTab === "eeat" ? (
          eeatCategories.length && !eeatUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {eeatCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(eeatAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No EEAT categories available"
              message={eeatUnavailable ? "EEAT audit timed out. Regenerate the report after restarting the audit server." : "This report does not include EEAT category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : activeAuditTab === "trustSignals" ? (
          trustSignalsCategories.length && !trustSignalsUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {trustSignalsCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(trustSignalsAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No Trust Signal categories available"
              message={trustSignalsUnavailable ? "Trust Signal audit timed out. Regenerate the report after restarting the audit server." : "This report does not include Trust Signal category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : activeAuditTab === "geo" ? (
          <div className="grid gap-3">
            {geoCategories.length && !geoUnavailable ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {geoCategories.map((category) => {
                  const isSkipped = category.status === "Skipped";
                  return (
                    <AuditCategoryCard
                      key={category.categoryName}
                      category={category}
                      isSkipped={isSkipped}
                      badgeTone={geoStatusTone(category.status)}
                      badgeLabel={isSkipped ? "Skipped" : category.status === "Passed" ? "Passed" : "Issues Found"}
                      statusLabel={category.status}
                      issueParameters={issueParametersForCategory(geoAeoAudit.checks, category.categoryName)}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyAuditState
                title="No GEO / AEO categories available"
                message={geoUnavailable ? geoAeoAudit.grade_description || "GEO / AEO audit timed out. Regenerate the report after restarting the audit server." : geoAeoAudit.grade_description || "This report does not include GEO / AEO category data. Regenerate the report after restarting the audit server."}
              />
            )}

            <Card className="bg-ink p-6 text-white">
              <p className="text-sm font-black uppercase text-[#f4b942]">Unlock Full GEO / AEO Report</p>
              <ul className="mt-5 grid gap-2 text-sm font-semibold text-white/75 md:grid-cols-2">
                {["Complete GEO issue breakdown", "AI visibility roadmap", "Entity optimization strategy", "FAQ & answer optimization plan", "Implementation recommendations"].map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <a href={pdfExportUrl} download>
                <Button className="mt-6 w-full justify-center rounded-full bg-[#f4b942] text-ink hover:bg-[#f4b942] md:w-auto">
                  <Download className="size-4" />
                  Get My Full Report
                </Button>
              </a>
            </Card>
          </div>
        ) : activeAuditTab === "indexability" ? (
          indexabilityCategories.length && !indexabilityUnavailable ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {indexabilityCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(indexabilityAudit.checks, category.categoryName)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyAuditState
              title="No Indexability categories available"
              message={indexabilityUnavailable ? "Indexability audit timed out. Regenerate the report after restarting the audit server." : "This report does not include Indexability category data. Regenerate the report after restarting the audit server so the latest audit code is used."}
            />
          )
        ) : (
          <div className="grid gap-4">
            {citationLikeCategories.length && !citationLikeUnavailable ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {citationLikeCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = category.status === "Skipped" || ("skippedChecks" in category && category.skippedChecks === category.totalChecks);
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <AuditCategoryCard
                    key={category.categoryName}
                    category={category}
                    isSkipped={isSkipped}
                    badgeTone={statusTone}
                    badgeLabel={isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}
                    statusLabel={isSkipped ? "Skipped" : category.status}
                    issueParameters={issueParametersForCategory(geoAeoAudit.checks, category.categoryName)}
                  />
                );
                })}
              </div>
            ) : (
              <EmptyAuditState
                title={activeAuditTab === "gemini" ? "No Gemini Citation categories available" : "No ChatGPT Citation categories available"}
                message={citationLikeUnavailable ? "Citation audit timed out because the GEO / AEO audit did not complete. Regenerate the report after restarting the audit server." : "This report does not include citation category data. Regenerate the report after restarting the audit server so the latest GEO / AEO audit code is used."}
              />
            )}
          </div>
        )}
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="text-xl font-black text-ink">Visibility Opportunities</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[#e85d4f]/20 bg-[#e85d4f]/10 p-4">
              <p className="text-xs font-black uppercase text-ink/60">High Impact Issues</p>
              <p className="mt-2 text-4xl font-black text-[#e85d4f]">{issueImpactCounts.high}</p>
            </div>
            <div className="rounded-lg border border-[#f4b942]/30 bg-[#f4b942]/15 p-4">
              <p className="text-xs font-black uppercase text-ink/60">Medium Impact Issues</p>
              <p className="mt-2 text-4xl font-black text-ink">{issueImpactCounts.medium}</p>
            </div>
            <div className="rounded-lg border border-[#0f766e]/20 bg-[#0f766e]/10 p-4">
              <p className="text-xs font-black uppercase text-ink/60">Low Impact Issues</p>
              <p className="mt-2 text-4xl font-black text-[#0f766e]">{issueImpactCounts.low}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-ink p-6 text-white">
          <p className="text-sm font-black uppercase text-[#f4b942]">Unlock Your Complete AI Visibility Report</p>
          <h2 className="mt-3 text-2xl font-black leading-8">Our analysis identified {issueImpactCounts.high} high-impact issues that may be limiting your visibility in AI-generated recommendations.</h2>
          <ul className="mt-5 space-y-2 text-sm font-semibold text-white/75">
            {["Complete issue breakdown", "Priority roadmap", "AI visibility strategy", "Page-level findings", "Implementation recommendations"].map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
          <a href={pdfExportUrl} download>
            <Button className="mt-6 w-full justify-center rounded-full bg-[#f4b942] text-ink hover:bg-[#f4b942]">
              <Download className="size-4" />
              Get My Full Report
            </Button>
          </a>
          <button
            type="button"
            onClick={() => setShowStrategyForm(true)}
            className="mt-3 block w-full text-center text-sm font-black text-[#f4b942] transition hover:text-white"
          >
            Schedule Strategy Call
          </button>
        </Card>
      </section>

      <section className="mb-6">
        <Card className="flex flex-col gap-4 bg-white p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-[#f4b942]">Run another audit</p>
            <h2 className="mt-2 text-2xl font-black text-ink">Generate a new visibility report</h2>
          </div>
          <Button onClick={() => router.push("/")} className="w-full rounded-full bg-ink text-white hover:bg-[#263238] md:w-auto">
            <Sparkles className="size-4" />
            Generate New Report
          </Button>
        </Card>
      </section>

      {showStrategyForm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 px-5 py-8">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-[#f4b942]">Strategy Call</p>
                <h2 className="mt-2 text-2xl font-black text-ink">Schedule Strategy Call</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowStrategyForm(false)}
                className="rounded-full bg-mist px-3 py-2 text-sm font-black text-ink/60 transition hover:bg-ink hover:text-white"
              >
                Close
              </button>
            </div>
            <form onSubmit={onStrategySubmit} className="mt-6 grid gap-4">
              <input
                required
                value={strategyForm.name}
                onChange={(event) => setStrategyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Name"
                className="min-h-11 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-[#f4b942] focus:ring-4 focus:ring-[#f4b942]/10"
              />
              <input
                required
                type="email"
                value={strategyForm.email}
                onChange={(event) => setStrategyForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="min-h-11 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-[#f4b942] focus:ring-4 focus:ring-[#f4b942]/10"
              />
              <input
                required
                value={strategyForm.phone}
                onChange={(event) => setStrategyForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Phone"
                className="min-h-11 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-[#f4b942] focus:ring-4 focus:ring-[#f4b942]/10"
              />
              <Button disabled={isSubmittingStrategy} className="w-full rounded-full bg-ink text-white hover:bg-[#263238]">
                <CalendarCheck className="size-4" />
                {isSubmittingStrategy ? "Submitting..." : "Submit Request"}
              </Button>
              {strategyStatus ? <p className="text-sm font-semibold text-ink/60">{strategyStatus}</p> : null}
            </form>
          </Card>
        </div>
      ) : null}
      </div>
    </main>
  );
}
