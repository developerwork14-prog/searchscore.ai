"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Check, Gauge, Loader2, MapPin, Search, Sparkles, Video } from "lucide-react";
import { createReport } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

const tasks = [
  "Scanning AI Search Engines",
  "Scanning Traditional Search Engines",
  "Scanning Video Search Engines",
  "Scanning Local Search Engines",
  "Checking Brand Authority",
  "Checking Entity Authority",
  "Mapping Market Position",
  "Generating Visibility Score",
  "Compiling Insights"
];

const statuses = [
  "Checking how AI engines perceive your brand",
  "Mapping market position",
  "Evaluating brand authority",
  "Analyzing high-intent customer prompts",
  "Measuring AI recommendation likelihood"
];

const channels = [
  { label: "AI Answers", value: "42%", icon: Bot, tone: "bg-teal/10 text-teal" },
  { label: "Search", value: "68%", icon: Search, tone: "bg-violet/10 text-violet" },
  { label: "Local", value: "51%", icon: MapPin, tone: "bg-gold/25 text-ink" },
  { label: "Video", value: "34%", icon: Video, tone: "bg-coral/10 text-coral" }
];

export default function HomePage() {
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const completedTasks = useMemo(() => Math.floor((progress / 100) * tasks.length), [progress]);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = window.setInterval(() => {
      setProgress((value) => Math.min(96, value + 2));
    }, 420);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsGenerating(true);
    setProgress(8);
    try {
      const report = await createReport({ brandName, websiteUrl, businessEmail });
      setProgress(100);
      window.setTimeout(() => router.push(`/report/${report.id}`), 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate report");
      setIsGenerating(false);
      setProgress(0);
    }
  }

  if (isGenerating) {
    return (
      <main className="app-shell mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-10">
        <Card className="overflow-hidden border-black/10">
          <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
            <div className="bg-ink p-6 text-white md:p-10">
              <div className="mb-8 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-bold">
                <Loader2 className="size-4 animate-spin text-mint" />
                Live scan running
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Building your visibility report</h1>
              <p className="mt-3 text-sm leading-6 text-white/66">The audit is scoring how buyers discover and compare your brand across AI, search, local, and video surfaces.</p>
              <p className="mt-6 text-sm font-bold text-mint">Estimated time: 45-60 seconds</p>
            </div>
            <div className="grid gap-8 p-6 md:p-10 md:grid-cols-[240px_1fr] md:items-center">
            <div className="flex flex-col items-center">
              <div
                className="progress-ring flex size-52 items-center justify-center rounded-full shadow-soft"
                style={{ "--progress": `${progress}%` } as React.CSSProperties}
              >
                <div className="flex size-40 flex-col items-center justify-center rounded-full bg-white">
                  <Gauge className="mb-2 size-8 text-teal" />
                  <span className="text-4xl font-bold">{progress}%</span>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold md:text-3xl">Analyzing visibility signals</h2>
                <p className="mt-2 text-sm text-ink/60">Your report will open automatically when the scan completes.</p>
              </div>
              <div className="mb-6 flex min-h-12 items-center gap-3 rounded-md border border-teal/15 bg-mist px-4 text-sm font-bold text-teal">
                <Loader2 className="size-4 animate-spin" />
                {statuses[Math.floor(progress / 20) % statuses.length]}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {tasks.map((task, index) => (
                  <div key={task} className="flex items-center gap-3 text-sm">
                    <span className={`flex size-6 items-center justify-center rounded-full ${index < completedTasks ? "bg-teal text-white" : "bg-ink/10 text-ink/40"}`}>
                      <Check className="size-4" />
                    </span>
                    {task}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="app-shell min-h-screen px-5 py-6">
      <div className="mx-auto grid min-h-[calc(100vh-48px)] max-w-7xl gap-6 lg:grid-cols-[1fr_460px] lg:items-center">
        <section>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-teal/20 bg-white/80 px-3 py-2 text-sm font-bold text-teal shadow-soft">
              <Gauge className="size-4" />
              AI Visibility Analyzer
            </div>
            <div className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-ink px-3 py-2 text-sm font-bold text-white">
              <Sparkles className="size-4 text-mint" />
              Multi-channel scoring
            </div>
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-normal text-ink md:text-7xl">
            See where AI engines do and do not recommend your brand.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/66">
            Generate a boardroom-ready visibility score across AI answers, classic search, local discovery, video results, entity authority, and category-level prompts.
          </p>

          <div className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {channels.map((channel) => {
              const Icon = channel.icon;
              return (
                <div key={channel.label} className="rounded-lg border border-black/10 bg-white/82 p-4 shadow-soft backdrop-blur">
                  <div className={`mb-4 flex size-10 items-center justify-center rounded-md ${channel.tone}`}>
                    <Icon className="size-5" />
                  </div>
                  <p className="text-3xl font-black">{channel.value}</p>
                  <p className="mt-1 text-sm font-semibold text-ink/55">{channel.label} sample visibility</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid max-w-4xl gap-3 md:grid-cols-3">
            {["Prompt gaps", "Category signals", "Revenue risk"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white/70 p-3 text-sm font-bold text-ink/72">
                <span className="flex size-8 items-center justify-center rounded-md bg-mist text-teal">{index + 1}</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="overflow-hidden">
          <div className="border-b border-black/10 bg-ink p-6 text-white">
            <p className="text-sm font-bold text-mint">Start a visibility audit</p>
            <h2 className="mt-2 text-2xl font-black">Generate your report</h2>
            <p className="mt-2 text-sm leading-6 text-white/64">Enter a brand and website to model how discovery surfaces currently understand you.</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-ink/70">Brand Name</label>
            <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Acme Finance" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-ink/70">Website URL</label>
            <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-ink/70">Business Email</label>
            <Input type="email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} placeholder="you@company.com" required />
          </div>
          {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm font-medium text-coral">{error}</p> : null}
          <Button className="w-full" type="submit">
            Generate Report
            <ArrowRight className="size-4" />
          </Button>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            {["AI", "SEO", "GEO"].map((label) => (
              <div key={label} className="rounded-md bg-mist px-2 py-3">
                <p className="text-xs font-black text-teal">{label}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink/48">included</p>
              </div>
            ))}
          </div>
        </form>
        </Card>
      </div>
    </main>
  );
}
