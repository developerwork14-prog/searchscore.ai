"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { AiVisibilityReport, PlaygroundResult } from "@aiva/core";
import { AlertTriangle, BarChart3, Bot, Download, ExternalLink, FileJson, FileText, Link2, Send, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    good: "bg-teal/10 text-teal",
    warn: "bg-gold/20 text-ink",
    bad: "bg-coral/10 text-coral"
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

  const chartData = useMemo(() => report?.competitors ?? [], [report]);

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
    return <main className="mx-auto max-w-3xl px-5 py-10"><Card className="p-6">{error}</Card></main>;
  }

  if (!report) {
    return <main className="mx-auto max-w-3xl px-5 py-10"><Card className="p-6">Loading report...</Card></main>;
  }

  const exportUrl = (format: string) => `${API_BASE}/api/reports/${report.id}/export/${format}`;

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <header className="mb-6 flex flex-col gap-4 border-b border-black/10 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal">AI Visibility Report</p>
          <h1 className="mt-1 text-3xl font-bold md:text-5xl">{report.brandName}</h1>
          <a className="mt-2 inline-flex items-center gap-2 text-sm text-ink/60" href={report.websiteUrl} target="_blank">
            {report.websiteUrl}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportUrl("pdf")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><FileText className="size-4" />PDF Export</Button></a>
          <a href={exportUrl("excel")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><Table2 className="size-4" />Excel Export</Button></a>
          <a href={exportUrl("json")}><Button className="bg-white text-ink ring-1 ring-black/10 hover:text-white"><FileJson className="size-4" />JSON Export</Button></a>
          <Button onClick={() => navigator.clipboard.writeText(report.shareUrl)}><Link2 className="size-4" />Share URL</Button>
        </div>
      </header>

      <section className="mb-6 grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="p-6">
          <p className="text-sm font-semibold text-ink/60">AI Visibility Score</p>
          <div className={`mt-3 text-7xl font-bold ${scoreColor(report.visibilityScore)}`}>{report.visibilityScore}%</div>
          <div className="mt-4"><Badge tone={report.visibilityScore < 40 ? "bad" : report.visibilityScore < 70 ? "warn" : "good"}>{report.visibilityLevel}</Badge></div>
          <p className="mt-5 text-sm text-ink/65">{report.sentiment.explanation}</p>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["AI Decision Coverage", report.breakdown.aiDecisionCoverage],
            ["Competitive Landscape", report.breakdown.competitiveLandscape],
            ["Brand Authority", report.breakdown.brandAuthority],
            ["Entity Strength", report.breakdown.entityStrength],
            ["Search Readiness", report.breakdown.searchReadiness]
          ].map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="min-h-10 text-sm font-semibold text-ink/60">{label}</p>
              <p className="mt-4 text-4xl font-bold">{value}%</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><BarChart3 className="size-5 text-teal" /><h2 className="text-xl font-bold">Competitor Landscape</h2></div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={110} />
                <Tooltip />
                <Bar dataKey="visibility" radius={[0, 6, 6, 0]}>
                  {chartData.map((entry) => <Cell key={entry.name} fill={entry.isYou ? "#0f766e" : "#e85d4f"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2"><Bot className="size-5 text-teal" /><h2 className="text-xl font-bold">AI Search Playground</h2></div>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`Best ${report.brandName} alternatives`}
              className="min-h-11 flex-1 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            <Button disabled={isTesting}><Send className="size-4" /></Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {["Best Brand alternatives", `Is ${report.brandName} worth it`, `Top tools like ${report.brandName}`].map((example) => (
              <button key={example} onClick={() => setPrompt(example)} className="rounded-md bg-mist px-2.5 py-1 font-semibold text-teal">{example}</button>
            ))}
          </div>
          {playground ? (
            <div className="mt-5 rounded-md border border-black/10 bg-mist p-4">
              <Badge tone={playground.mentionStatus === "Mentioned" ? "good" : playground.mentionStatus === "Partially Mentioned" ? "warn" : "bad"}>{playground.mentionStatus}</Badge>
              <p className="mt-3 text-sm text-ink/75">{playground.answer}</p>
              <p className="mt-3 text-sm font-bold">Confidence Score: {playground.confidenceScore}%</p>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-black/10 p-5"><h2 className="text-xl font-bold">Where You&apos;re Losing Customers</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-mist text-ink/60"><tr><th className="p-3">Prompt</th><th className="p-3">Intent Type</th><th className="p-3">Visibility</th></tr></thead>
              <tbody>{report.losingPrompts.map((item) => <tr key={item.prompt} className="border-t border-black/10"><td className="p-3 font-medium">{item.prompt}</td><td className="p-3">{item.intentType}</td><td className="p-3 font-bold">{item.visibility}%</td></tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-black/10 p-5"><h2 className="text-xl font-bold">Top Prompt Opportunities</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-mist text-ink/60"><tr><th className="p-3">Prompt</th><th className="p-3">Current Visibility</th><th className="p-3">Traffic Opportunity</th><th className="p-3">Difficulty</th><th className="p-3">Impact</th></tr></thead>
              <tbody>{report.opportunities.map((item) => <tr key={item.prompt} className="border-t border-black/10"><td className="p-3 font-medium">{item.prompt}</td><td className="p-3 font-bold">{item.currentVisibility}%</td><td className="p-3">{item.potentialTrafficOpportunity}</td><td className="p-3">{item.difficulty}</td><td className="p-3">{item.impact}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-xl font-bold">Brand Perception</h2>
          <p className="mt-1 text-sm font-semibold text-teal">What AI engines currently understand about your brand</p>
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
                <h3 className="text-sm font-bold">{title}</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink/65">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-bold">Risk Assessment</h2>
          <div className="mt-3"><Badge tone={report.risk.level === "Low" ? "good" : report.risk.level === "Medium" ? "warn" : "bad"}>{report.risk.level}</Badge></div>
          <div className="mt-5 flex gap-3 rounded-md bg-coral/10 p-4 text-sm text-ink/75">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral" />
            <div>{report.risk.businessImpact.map((impact) => <p key={impact} className="mb-2 last:mb-0">{impact}</p>)}</div>
          </div>
        </Card>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        {report.recommendations.map((group) => (
          <Card key={group.priority} className="p-6">
            <h2 className="text-xl font-bold">{group.priority}</h2>
            <ul className="mt-4 space-y-3 text-sm text-ink/70">{group.items.map((item) => <li key={item} className="flex gap-2"><Download className="mt-0.5 size-4 text-teal" />{item}</li>)}</ul>
          </Card>
        ))}
      </section>
    </main>
  );
}
