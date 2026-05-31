"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PlaygroundResult, StructuredAiVisibilityReport } from "@aiva/core";
import { Bot, CalendarCheck, ExternalLink, Link2, Send, Sparkles } from "lucide-react";
import { getReport, runPlayground } from "@/lib/api";
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

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<StructuredAiVisibilityReport | null>(null);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [playground, setPlayground] = useState<PlaygroundResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [activeAuditTab, setActiveAuditTab] = useState<"technical" | "geo">("technical");

  useEffect(() => {
    getReport(params.id).then(setReport).catch((err) => setError(err instanceof Error ? err.message : "Report not found"));
  }, [params.id]);

  async function onPromptSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !report) return;
    setIsTesting(true);
    try {
      setPlayground(await runPlayground(params.id, prompt));
    } finally {
      setIsTesting(false);
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
  const geoOpportunitiesFound = geoAeoAudit.opportunity_counts.high + geoAeoAudit.opportunity_counts.medium + geoAeoAudit.opportunity_counts.low;
  const geoStatusTone = (status: string) => status === "Passed" ? "good" : status === "Minor Attention" ? "warn" : "bad";

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

      {/* <section className="mb-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Bot className="size-5 text-teal" /><h2 className="text-xl font-black">AI Search Playground</h2></div>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={report.playground_questions[0] ?? `What does ${report.brand} offer?`}
              className="min-h-11 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            <Button disabled={isTesting}><Send className="size-4" /></Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {report.playground_questions.map((example) => (
              <button key={example} onClick={() => setPrompt(example)} className="rounded-md bg-mist px-2.5 py-1 font-bold text-teal transition hover:bg-teal hover:text-white">{example}</button>
            ))}
          </div>
          {playground ? (
            <div className="mt-5 rounded-md border border-black/10 bg-mist p-4 shadow-soft">
              <Badge tone={playground.mentionStatus === "Mentioned" ? "good" : playground.mentionStatus === "Partially Mentioned" ? "warn" : "bad"}>{playground.mentionStatus}</Badge>
              <p className="mt-3 text-sm text-ink/75">{playground.answer}</p>
              <p className="mt-3 text-sm font-bold">Confidence Score: {playground.confidenceScore}%</p>
            </div>
          ) : null}
        </Card>
      </section> */}
      {/* <section className="mb-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Bot className="size-5 text-teal" /><h2 className="text-xl font-black">AI Search Playground</h2></div>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={report.playground_questions[0] ?? `What does ${report.brand} offer?`}
              className="min-h-11 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            <Button disabled={isTesting}><Send className="size-4" /></Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {report.playground_questions.map((example) => (
              <button key={example} onClick={() => setPrompt(example)} className="rounded-md bg-mist px-2.5 py-1 font-bold text-teal transition hover:bg-teal hover:text-white">{example}</button>
            ))}
          </div>
          {playground ? (
            <div className="mt-5 rounded-md border border-black/10 bg-mist p-4 shadow-soft">
              <Badge tone={playground.mentionStatus === "Mentioned" ? "good" : playground.mentionStatus === "Partially Mentioned" ? "warn" : "bad"}>{playground.mentionStatus}</Badge>
              <p className="mt-3 text-sm text-ink/75">{playground.answer}</p>
              <p className="mt-3 text-sm font-bold">Confidence Score: {playground.confidenceScore}%</p>
            </div>
          ) : null}
        </Card>
      </section> */}

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
        ) : (
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
              {geoAeoAudit.categories.map((category) => (
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
              <a href={`mailto:?subject=Full GEO / AEO Report for ${encodeURIComponent(report.brand)}`}>
                <Button className="mt-6 w-full justify-center bg-teal text-white hover:bg-coral md:w-auto">
                  <CalendarCheck className="size-4" />
                  Get My Full Report
                </Button>
              </a>
            </Card>
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
          <a href={`mailto:?subject=AI Visibility Consultation for ${encodeURIComponent(report.brand)}`}>
            <Button className="mt-6 w-full justify-center bg-teal text-white hover:bg-coral">
              <CalendarCheck className="size-4" />
              Get My Full Report
            </Button>
          </a>
          <a className="mt-3 block text-center text-sm font-black text-mint transition hover:text-white" href={`mailto:?subject=Strategy Call for ${encodeURIComponent(report.brand)}`}>
            Schedule Strategy Call
          </a>
        </Card>
      </section>
      </div>
    </main>
  );
}
