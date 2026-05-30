"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AiVisibilityReport, PlaygroundResult } from "@aiva/core";
import { AlertTriangle, Bot, Download, ExternalLink, FileJson, FileText, Link2, Send, Sparkles, Table2, Target } from "lucide-react";
import { API_BASE, getReport, runPlayground } from "@/lib/api";
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
  const [report, setReport] = useState<AiVisibilityReport | null>(null);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [playground, setPlayground] = useState<PlaygroundResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    getReport(params.id).then(setReport).catch((err) => setError(err instanceof Error ? err.message : "Report not found"));
  }, [params.id]);

  async function onPromptSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !report) return;
    setIsTesting(true);
    try {
      setPlayground(await runPlayground(report.id, prompt));
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

  const exportUrl = (format: string) => `${API_BASE}/api/reports/${report.id}/export/${format}`;
  const aiMarketPosition = report.aiMarketPosition ?? {
    industry: "Unknown",
    subIndustry: report.perception.businessCategory,
    businessModel: "Unknown",
    classificationConfidence: 0,
    evidenceKeywords: [],
    rejectedCategories: [],
    categoryVisibility: report.breakdown.categoryVisibility ?? report.breakdown.aiDecisionCoverage,
    aiPresenceLevel: report.visibilityLevel,
    authorityStrength: report.pillars.brandAuthority < 35 ? "Low" : report.pillars.brandAuthority < 65 ? "Moderate" : report.pillars.brandAuthority < 85 ? "Strong" : "Excellent",
    marketPosition: "Brand visibility is evaluated from owned signals and category relevance"
  };

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
          <h1 className="mt-4 text-3xl font-black md:text-5xl">{report.brandName}</h1>
          <a className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink/55" href={report.websiteUrl} target="_blank">
            {report.websiteUrl}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportUrl("pdf")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><FileText className="size-4" />PDF</Button></a>
          <a href={exportUrl("excel")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><Table2 className="size-4" />Excel</Button></a>
          <a href={exportUrl("json")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><FileJson className="size-4" />JSON</Button></a>
          <Button onClick={() => navigator.clipboard.writeText(report.shareUrl)}><Link2 className="size-4" />Share URL</Button>
        </div>
        </div>
      </header>

      <section className="mb-6 grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-ink p-6 text-white">
            <p className="text-sm font-bold text-mint">AI Visibility Score</p>
            <div className="mt-3 flex items-end gap-3">
              <span className={`text-7xl font-black ${scoreColor(report.visibilityScore)}`}>{report.visibilityScore}%</span>
            </div>
          </div>
          <div className="p-6">
          <div className="mt-4"><Badge tone={report.visibilityScore < 40 ? "bad" : report.visibilityScore < 70 ? "warn" : "good"}>{report.visibilityLevel}</Badge></div>
          <p className="mt-5 text-sm leading-6 text-ink/65">{report.sentiment.explanation}</p>
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["AI Decision Coverage", report.breakdown.aiDecisionCoverage],
            ["Category Visibility", aiMarketPosition.categoryVisibility],
            ["Brand Authority", report.breakdown.brandAuthority],
            ["Entity Strength", report.breakdown.entityStrength],
            ["Search Readiness", report.breakdown.searchReadiness]
          ].map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="min-h-10 text-sm font-bold text-ink/58">{label}</p>
              <p className="mt-4 text-4xl font-black">{value}%</p>
              <div className="mt-4 h-2 rounded-full bg-ink/8">
                <div className="h-full rounded-full bg-teal" style={{ width: `${value}%` }} />
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Target className="size-5 text-teal" /><h2 className="text-xl font-black">AI Market Position</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Industry", aiMarketPosition.industry],
              ["Sub Industry", aiMarketPosition.subIndustry],
              ["Business Model", aiMarketPosition.businessModel],
              ["Classification Confidence", `${aiMarketPosition.classificationConfidence}%`],
              ["Category Visibility", `${aiMarketPosition.categoryVisibility}%`],
              ["AI Presence Level", aiMarketPosition.aiPresenceLevel],
              ["Authority Strength", aiMarketPosition.authorityStrength],
              ["Market Position", aiMarketPosition.marketPosition]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-black/10 bg-cloud p-4">
                <p className="text-xs font-black uppercase text-ink/45">{label}</p>
                <p className="mt-2 text-sm font-black leading-5 text-ink">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Bot className="size-5 text-teal" /><h2 className="text-xl font-black">AI Search Playground</h2></div>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`What does ${report.brandName} offer?`}
              className="min-h-11 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm font-medium outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            <Button disabled={isTesting}><Send className="size-4" /></Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[`What does ${report.brandName} offer?`, `Is ${report.brandName} worth it?`, `How trusted is ${report.brandName}?`].map((example) => (
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
      </section>

      <section className="mb-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Target className="size-5 text-teal" /><h2 className="text-xl font-black">Classification Debug</h2></div>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Industry", aiMarketPosition.industry],
              ["Sub Industry", aiMarketPosition.subIndustry],
              ["Business Model", aiMarketPosition.businessModel],
              ["Confidence", `${aiMarketPosition.classificationConfidence}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-black/10 bg-cloud p-4">
                <p className="text-xs font-black uppercase text-ink/45">{label}</p>
                <p className="mt-2 text-sm font-black leading-5 text-ink">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase text-ink/45">Evidence Keywords</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {aiMarketPosition.evidenceKeywords.length ? aiMarketPosition.evidenceKeywords.map((keyword) => (
                  <span key={keyword} className="rounded-md bg-mist px-2.5 py-1 text-xs font-bold text-teal">{keyword}</span>
                )) : <span className="text-sm font-medium text-ink/55">No strong evidence keywords found.</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-ink/45">Rejected Categories</p>
              <div className="mt-2 space-y-2">
                {aiMarketPosition.rejectedCategories.length ? aiMarketPosition.rejectedCategories.map((item) => (
                  <div key={`${item.category}-${item.reason}`} className="rounded-md border border-black/10 bg-white p-3">
                    <p className="text-sm font-black text-ink">{item.category}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-ink/60">{item.reason}</p>
                  </div>
                )) : <p className="text-sm font-medium text-ink/55">No conflicting categories crossed the rejection threshold.</p>}
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-black/10 bg-white/70 p-5"><h2 className="text-xl font-black">Where You&apos;re Losing Customers</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-mist text-ink/60"><tr><th className="p-3">Prompt</th><th className="p-3">Intent Type</th><th className="p-3">Visibility</th></tr></thead>
              <tbody>{report.losingPrompts.map((item) => <tr key={item.prompt} className="border-t border-black/10 hover:bg-cloud"><td className="p-3 font-semibold">{item.prompt}</td><td className="p-3">{item.intentType}</td><td className="p-3 font-black">{item.visibility}%</td></tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-black/10 bg-white/70 p-5"><h2 className="text-xl font-black">Top Prompt Opportunities</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-mist text-ink/60"><tr><th className="p-3">Prompt</th><th className="p-3">Current Visibility</th><th className="p-3">Traffic Opportunity</th><th className="p-3">Difficulty</th><th className="p-3">Impact</th></tr></thead>
              <tbody>{report.opportunities.map((item) => <tr key={item.prompt} className="border-t border-black/10 hover:bg-cloud"><td className="p-3 font-semibold">{item.prompt}</td><td className="p-3 font-black">{item.currentVisibility}%</td><td className="p-3">{item.potentialTrafficOpportunity}</td><td className="p-3">{item.difficulty}</td><td className="p-3">{item.impact}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-xl font-black">Brand Perception</h2>
          <p className="mt-1 text-sm font-bold text-teal">What AI engines currently understand about your brand</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Object.entries({
              "Business category": [report.perception.businessCategory],
              "Main services": report.perception.mainServices,
              "Target audience": report.perception.targetAudience,
              "Market positioning": report.perception.marketPositioning,
              Strengths: report.perception.strengths,
              Weaknesses: report.perception.weaknesses
            }).map(([title, items]) => (
              <div key={title}>
                <h3 className="text-sm font-black">{title}</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink/65">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-black">Risk Assessment</h2>
          <div className="mt-3"><Badge tone={report.risk.level === "Low" ? "good" : report.risk.level === "Medium" ? "warn" : "bad"}>{report.risk.level}</Badge></div>
          <div className="mt-5 flex gap-3 rounded-md border border-coral/15 bg-coral/10 p-4 text-sm text-ink/75">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral" />
            <div>{report.risk.businessImpact.map((impact) => <p key={impact} className="mb-2 last:mb-0">{impact}</p>)}</div>
          </div>
        </Card>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        {report.recommendations.length ? report.recommendations.map((item) => (
          <Card key={`${item.priority}-${item.recommendation}`} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <Badge tone={item.priority === "High Priority" ? "bad" : item.priority === "Medium Priority" ? "warn" : "neutral"}>{item.priority}</Badge>
              <Download className="size-4 shrink-0 text-teal" />
            </div>
            <h2 className="mt-4 text-lg font-black leading-6">{item.recommendation}</h2>
            <div className="mt-4 space-y-4 text-sm text-ink/70">
              <div>
                <p className="text-xs font-black uppercase text-ink/45">Reason</p>
                <p className="mt-1 font-medium leading-6">{item.reason}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-ink/45">Expected AI Visibility Impact</p>
                <p className="mt-1 font-medium leading-6">{item.expectedAiVisibilityImpact}</p>
              </div>
            </div>
          </Card>
        )) : (
          <Card className="p-6 lg:col-span-3">
            <h2 className="text-xl font-black">Recommendations</h2>
            <p className="mt-2 text-sm font-medium text-ink/65">No audit-backed recommendations were triggered for this report.</p>
          </Card>
        )}
      </section>
      </div>
    </main>
  );
}
