"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { StructuredAiVisibilityReport } from "@aiva/core";
import { CalendarCheck, Download, ExternalLink, Link2, Sparkles } from "lucide-react";
import { API_BASE, getReport, submitStrategyCall } from "@/lib/api";
import { Button, Card } from "@/components/ui";

function scoreColor(score: number) {
  if (score < 40) return "text-coral";
  if (score < 70) return "text-gold";
  return "text-teal";
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const classes = {
    neutral: "bg-ink/10 text-ink",
    good: "bg-teal/10 text-teal ring-1 ring-teal/15",
    warn: "bg-gold/25 text-ink ring-1 ring-gold/30",
    bad: "bg-coral/10 text-coral ring-1 ring-coral/15"
  };
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

const CHATGPT_CITATION_CATEGORIES = ["Crawlability", "Technical Access", "Content Structure", "Content Quality"];
const GEMINI_CITATION_CATEGORIES = ["Gemini Crawlability", "Local & E-Commerce", "Schema & Technical", "Media & Visuals", "Robots & Bot Access", "AI Discovery Files"];

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<StructuredAiVisibilityReport | null>(null);
  const [error, setError] = useState("");
  const [activeAuditTab, setActiveAuditTab] = useState<"technical" | "geo" | "citation" | "gemini" | "indexability">("technical");
  const [showGeminiFailures, setShowGeminiFailures] = useState(false);
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
    return <main className="app-shell mx-auto min-h-screen max-w-3xl px-5 py-10"><Card className="p-6 font-semibold text-coral">{error}</Card></main>;
  }

  if (!report) {
    return <main className="app-shell mx-auto min-h-screen max-w-3xl px-5 py-10"><Card className="p-6 font-semibold text-ink/70">Loading report...</Card></main>;
  }

  const technicalCategories = report.technical_categories ?? [];
  const technicalAudit = report.technical_audit ?? {
    score: 0,
    grade: "F",
    issues_found: technicalCategories.reduce((sum, category) => sum + category.failedChecks, 0)
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
  const geoCategories = geoAeoAudit.categories.filter((category) => !CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) && !GEMINI_CITATION_CATEGORIES.includes(category.categoryName) && category.categoryName !== "ChatGPT Citation" && category.categoryName !== "Gemini Citation");
  const citationCategories = geoAeoAudit.categories.filter((category) => CHATGPT_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "ChatGPT Citation");
  const geminiCategories = geoAeoAudit.categories.filter((category) => GEMINI_CITATION_CATEGORIES.includes(category.categoryName) || category.categoryName === "Gemini Citation");
  const citationLikeCategories = activeAuditTab === "indexability" ? indexabilityAudit.categories : activeAuditTab === "gemini" ? geminiCategories : citationCategories;
  const geminiFailedDetails = geminiCategories.flatMap((category) => (category.failedCheckDetails ?? []).map((detail) => ({ ...detail, categoryName: category.categoryName })));
  const geoOpportunitiesFound = geoAeoAudit.opportunity_counts.high + geoAeoAudit.opportunity_counts.medium + geoAeoAudit.opportunity_counts.low;
  const geoStatusTone = (status: string) => status === "Passed" ? "good" : status === "Minor Attention" ? "warn" : "bad";
  const pdfExportUrl = `${API_BASE}/api/reports/${params.id}/export/pdf`;

  return (
    <main className="app-shell min-h-screen px-5 py-6">
      <div className="mx-auto max-w-7xl">
      <header className="mb-6 rounded-lg border border-black/10 bg-white/82 p-5 shadow-soft backdrop-blur md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-md bg-mist px-3 py-2 text-sm font-black text-teal">
            <Sparkles className="size-4" />
            AI Visibility Report
          </p>
          <h1 className="mt-4 text-3xl font-black md:text-5xl">{report.brand}</h1>
          <a className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink/55" href={report.url} target="_blank">
            {report.url}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigator.clipboard.writeText(window.location.href)}><Link2 className="size-4" />Share URL</Button>
        </div>
        </div>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="flex h-full flex-col overflow-hidden">
          <div className="flex-1 bg-ink p-6 text-white">
            <p className="text-sm font-bold text-mint">AI Visibility Score</p>
            <p className={`mt-3 text-7xl font-black ${scoreColor(report.overall_score)}`}>{report.overall_score}%</p>
            <div className="mt-4"><Badge tone={report.overall_score < 40 ? "bad" : report.overall_score < 70 ? "warn" : "good"}>{report.rating_label}</Badge></div>
          </div>
          <div className="min-h-24 p-5">
            <p className="text-sm leading-6 text-ink/65">{report.rating_description}</p>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-black text-ink/58">Technical Audit</p>
          <p className={`mt-4 text-6xl font-black ${scoreColor(technicalAudit.score)}`}>{technicalAudit.score}%</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={technicalAudit.score < 40 ? "bad" : technicalAudit.score < 70 ? "warn" : "good"}>Grade {technicalAudit.grade}</Badge>
            <Badge tone={technicalAudit.issues_found > 0 ? "bad" : "good"}>{technicalAudit.issues_found} Issues Found</Badge>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-black text-ink/58">GEO / AEO Audit</p>
          <p className={`mt-4 text-6xl font-black ${scoreColor(geoAeoAudit.score)}`}>{geoAeoAudit.score}%</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={geoAeoAudit.score < 40 ? "bad" : geoAeoAudit.score < 70 ? "warn" : "good"}>Grade {geoAeoAudit.grade}</Badge>
            <Badge tone={geoOpportunitiesFound > 0 ? "warn" : "good"}>{geoOpportunitiesFound} Opportunities Found</Badge>
          </div>
        </Card>
      </section>

      <section className="mb-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 className="text-xl font-black">Audit Categories</h2>
          <div className="inline-flex w-full rounded-md border border-black/10 bg-white p-1 shadow-soft md:w-auto">
            <button
              onClick={() => setActiveAuditTab("technical")}
              className={`min-h-10 flex-1 rounded px-4 text-sm font-black transition md:flex-none ${activeAuditTab === "technical" ? "bg-ink text-white" : "text-ink/60 hover:bg-mist hover:text-ink"}`}
            >
              Technical Audit
            </button>
            <button
              onClick={() => setActiveAuditTab("geo")}
              className={`min-h-10 flex-1 rounded px-4 text-sm font-black transition md:flex-none ${activeAuditTab === "geo" ? "bg-ink text-white" : "text-ink/60 hover:bg-mist hover:text-ink"}`}
            >
              GEO / AEO Audit
            </button>
            <button
              onClick={() => setActiveAuditTab("citation")}
              className={`min-h-10 flex-1 rounded px-4 text-sm font-black transition md:flex-none ${activeAuditTab === "citation" ? "bg-ink text-white" : "text-ink/60 hover:bg-mist hover:text-ink"}`}
            >
              ChatGPT Citation
            </button>
            <button
              onClick={() => setActiveAuditTab("gemini")}
              className={`min-h-10 flex-1 rounded px-4 text-sm font-black transition md:flex-none ${activeAuditTab === "gemini" ? "bg-ink text-white" : "text-ink/60 hover:bg-mist hover:text-ink"}`}
            >
              Gemini Citation
            </button>
            <button
              onClick={() => setActiveAuditTab("indexability")}
              className={`min-h-10 flex-1 rounded px-4 text-sm font-black transition md:flex-none ${activeAuditTab === "indexability" ? "bg-ink text-white" : "text-ink/60 hover:bg-mist hover:text-ink"}`}
            >
              Indexability
            </button>
          </div>
        </div>

        {activeAuditTab === "technical" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {technicalCategories.map((category) => {
              const hasIssues = category.failedChecks >= 1;

              return (
                <Card key={category.categoryName} className="p-5">
                  <div className="flex min-h-16 items-start justify-between gap-3">
                    <h3 className="text-base font-black leading-6">{category.categoryName}</h3>
                    <Badge tone={hasIssues ? "bad" : "good"}>{hasIssues ? "Issues Found" : "Passed"}</Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Checks</p>
                      <p className="mt-1 text-2xl font-black text-ink">{category.totalChecks}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Issues</p>
                      <p className={`mt-1 text-2xl font-black ${hasIssues ? "text-coral" : "text-teal"}`}>{category.failedChecks}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Score</p>
                      <p className={`mt-1 text-2xl font-black ${scoreColor(category.score)}`}>{category.score}%</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between rounded-md bg-mist px-3 py-2">
                    <p className="text-xs font-black uppercase text-ink/45">Status</p>
                    <p className={`text-sm font-black ${hasIssues ? "text-coral" : "text-teal"}`}>{category.status}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : activeAuditTab === "geo" ? (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="overflow-hidden">
              <div className="bg-ink p-6 text-white">
                <p className="text-sm font-bold text-mint">GEO / AEO Score</p>
                <p className={`mt-3 text-7xl font-black ${scoreColor(geoAeoAudit.score)}`}>{geoAeoAudit.score}%</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone={geoAeoAudit.score < 40 ? "bad" : geoAeoAudit.score < 70 ? "warn" : "good"}>Grade {geoAeoAudit.grade}</Badge>
                  {geoAeoAudit.blocker_cap_applied ? <Badge tone="bad">Blocker Cap Applied</Badge> : null}
                </div>
                <p className="mt-4 text-sm font-semibold text-white/70">{geoAeoAudit.grade_description}</p>
              </div>
              
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {geoCategories.map((category) => (
                <Card key={category.categoryName} className="p-5">
                  <div className="flex min-h-16 items-start justify-between gap-3">
                    <h3 className="text-base font-black leading-6">{category.categoryName}</h3>
                    <Badge tone={geoStatusTone(category.status)}>{category.status === "Passed" ? "Passed" : "Issues Found"}</Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Checks</p>
                      <p className="mt-1 text-2xl font-black text-ink">{category.totalChecks}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Issues</p>
                      <p className={`mt-1 text-2xl font-black ${category.failedChecks > 0 ? "text-coral" : "text-teal"}`}>{category.failedChecks}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase text-ink/45">Score</p>
                      <p className={`mt-1 text-2xl font-black ${scoreColor(category.score)}`}>{category.score}%</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between rounded-md bg-mist px-3 py-2">
                    <p className="text-xs font-black uppercase text-ink/45">Status</p>
                    <p className={`text-sm font-black ${category.status === "Passed" ? "text-teal" : category.status === "Minor Attention" ? "text-ink" : "text-coral"}`}>{category.status}</p>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="bg-ink p-6 text-white lg:col-span-2">
              <p className="text-sm font-black uppercase text-mint">Unlock Full GEO / AEO Report</p>
              <ul className="mt-5 grid gap-2 text-sm font-semibold text-white/75 md:grid-cols-2">
                {["Complete GEO issue breakdown", "AI visibility roadmap", "Entity optimization strategy", "FAQ & answer optimization plan", "Implementation recommendations"].map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
              <a href={pdfExportUrl} download>
                <Button className="mt-6 w-full justify-center bg-teal text-white hover:bg-coral md:w-auto">
                  <Download className="size-4" />
                  Get My Full Report
                </Button>
              </a>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4">
            {activeAuditTab === "gemini" && geminiFailedDetails.length ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGeminiFailures((current) => !current)}
                  className="min-h-10 rounded-md bg-ink px-4 text-sm font-black text-white transition hover:bg-teal"
                >
                  {showGeminiFailures ? "Hide Failed Results" : "Show Failed Results"}
                </button>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {citationLikeCategories.map((category) => {
                const hasIssues = category.failedChecks >= 1;
                const isSkipped = "skippedChecks" in category && category.skippedChecks === category.totalChecks;
                const statusTone = isSkipped ? "neutral" : hasIssues ? "bad" : "good";

                return (
                  <Card key={category.categoryName} className="p-5">
                    <div className="flex min-h-16 items-start justify-between gap-3">
                      <h3 className="text-base font-black leading-6">{category.categoryName}</h3>
                      <Badge tone={statusTone}>{isSkipped ? "Skipped" : hasIssues ? "Issues Found" : "Passed"}</Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-ink/45">Checks</p>
                        <p className="mt-1 text-2xl font-black text-ink">{category.totalChecks}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-ink/45">Issues</p>
                        <p className={`mt-1 text-2xl font-black ${hasIssues ? "text-coral" : "text-teal"}`}>{category.failedChecks}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-ink/45">Score</p>
                        <p className={`mt-1 text-2xl font-black ${isSkipped ? "text-ink/45" : scoreColor(category.score)}`}>{isSkipped ? "N/A" : `${category.score}%`}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between rounded-md bg-mist px-3 py-2">
                      <p className="text-xs font-black uppercase text-ink/45">Status</p>
                      <p className={`text-sm font-black ${isSkipped ? "text-ink/45" : hasIssues ? "text-coral" : "text-teal"}`}>{isSkipped ? "Skipped" : category.status}</p>
                    </div>
                  </Card>
                );
              })}
            </div>

            {activeAuditTab === "gemini" && showGeminiFailures && geminiFailedDetails.length ? (
              <div className="grid gap-3">
                {geminiFailedDetails.map((detail) => (
                  <div key={`${detail.categoryName}-${detail.id}`} className="rounded-md border border-black/10 bg-cloud p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase text-ink/45">{detail.categoryName}</p>
                        <p className="mt-1 text-sm font-black text-ink">{detail.name}</p>
                        <p className="mt-1 text-sm font-semibold text-ink/60">{detail.evidence}</p>
                      </div>
                      <Badge tone={detail.severity === "BLOCKER" ? "bad" : detail.severity === "MAJOR" ? "warn" : "neutral"}>{detail.severity}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink/75">{detail.recommendation}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="text-xl font-black">Visibility Opportunities</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-coral/15 bg-coral/10 p-4">
              <p className="text-xs font-black uppercase text-ink/45">High Impact Opportunities</p>
              <p className="mt-2 text-4xl font-black text-coral">{report.opportunity_counts.high}</p>
            </div>
            <div className="rounded-md border border-gold/30 bg-gold/20 p-4">
              <p className="text-xs font-black uppercase text-ink/45">Medium Impact Opportunities</p>
              <p className="mt-2 text-4xl font-black text-ink">{report.opportunity_counts.medium}</p>
            </div>
            <div className="rounded-md border border-black/10 bg-cloud p-4">
              <p className="text-xs font-black uppercase text-ink/45">Low Impact Opportunities</p>
              <p className="mt-2 text-4xl font-black text-teal">{report.opportunity_counts.low}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-ink p-6 text-white">
          <p className="text-sm font-black uppercase text-mint">Unlock Your Complete AI Visibility Report</p>
          <h2 className="mt-3 text-2xl font-black leading-8">Our analysis identified {report.opportunity_counts.high} high-impact opportunities that may be limiting your visibility in AI-generated recommendations.</h2>
          <ul className="mt-5 space-y-2 text-sm font-semibold text-white/75">
            {["Complete issue breakdown", "Priority roadmap", "AI visibility strategy", "Page-level findings", "Implementation recommendations"].map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
          <a href={pdfExportUrl} download>
            <Button className="mt-6 w-full justify-center bg-teal text-white hover:bg-coral">
              <Download className="size-4" />
              Get My Full Report
            </Button>
          </a>
          <button
            type="button"
            onClick={() => setShowStrategyForm(true)}
            className="mt-3 block w-full text-center text-sm font-black text-mint transition hover:text-white"
          >
            Schedule Strategy Call
          </button>
        </Card>
      </section>

      <section className="mb-6">
        <Card className="flex flex-col gap-4 bg-white p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-teal">Run another audit</p>
            <h2 className="mt-2 text-2xl font-black">Generate a new visibility report</h2>
          </div>
          <Button onClick={() => router.push("/")} className="w-full bg-ink text-white hover:bg-teal md:w-auto">
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
                <p className="text-sm font-black uppercase text-teal">Strategy Call</p>
                <h2 className="mt-2 text-2xl font-black">Schedule Strategy Call</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowStrategyForm(false)}
                className="rounded-md bg-mist px-3 py-2 text-sm font-black text-ink/60 transition hover:bg-ink hover:text-white"
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
                className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
              />
              <input
                required
                type="email"
                value={strategyForm.email}
                onChange={(event) => setStrategyForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
              />
              <input
                required
                value={strategyForm.phone}
                onChange={(event) => setStrategyForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Phone"
                className="min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
              />
              <Button disabled={isSubmittingStrategy} className="w-full bg-teal text-white hover:bg-coral">
                <CalendarCheck className="size-4" />
                {isSubmittingStrategy ? "Submitting..." : "Submit Request"}
              </Button>
              {strategyStatus ? <p className="text-sm font-semibold text-ink/65">{strategyStatus}</p> : null}
            </form>
          </Card>
        </div>
      ) : null}
      </div>
    </main>
  );
}
