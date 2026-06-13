"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BadgeCheck, Check, EyeOff, Gauge, Loader2, Sparkles, TimerReset, WandSparkles } from "lucide-react";
import { createReport } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

const tasks = [
  "Checking if ChatGPT cites your brand",
  "Auditing your Google visibility gaps",
  "Detecting video & content authority signals",
  "Mapping your local AI discovery signals",
  "Finding technical issues blocking AI access",
  "Running GEO / AEO Audit",
  "Measuring you against competitors AI trusts",
  "Calculating your AI visibility score",
  "Compiling Insights"
];

const statuses = [
  "Checking if AI would recommend you or your competitor"
];

const channels = [
  { label: "brands are invisible to AI answer engines right now", value: "3 in 4", icon: EyeOff, tone: "bg-gold/20 text-ink" },
  { label: "revenue-killing issues found per audit on average", value: "54", icon: AlertTriangle, tone: "bg-coral/10 text-coral" },
  { label: "sites fail the E-E-A-T standard AI engines trust", value: "9 in 10", icon: BadgeCheck, tone: "bg-teal/10 text-teal" },
  { label: "to see exactly what AI thinks of your brand", value: "60 sec", icon: TimerReset, tone: "bg-ink text-white" }
];

const signals = ["ChatGPT", "Gemini", "Google", "GEO"];

const auditDimensions = [
  { dimension: "ChatGPT Citation", reveals: "Are you being recommended in AI chat answers?" },
  { dimension: "Gemini Citation", reveals: "Does Google's AI see you as a trusted source?" },
  { dimension: "Schema & Structured Data", reveals: "Can AI engines actually read your content?" },
  { dimension: "E-E-A-T Audit", reveals: "Do you signal expertise, authority, and trust?" },
  { dimension: "Technical SEO", reveals: "Are crawl errors silently blocking your visibility?" },
  { dimension: "GEO / AEO Signals", reveals: "Are you optimized for AI-generated answers?" },
  { dimension: "On-Page SEO", reveals: "Is your content structured to rank and get cited?" },
  { dimension: "Indexability", reveals: "Is Google even seeing your pages?" },
  { dimension: "Trust Signals", reveals: "Does your site pass the credibility test?" },
  { dimension: "Image SEO", reveals: "Are your visuals working for or against you?" }
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
              <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-bold">
                <Loader2 className="size-4 animate-spin text-gold" />
                Live scan running
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Uncovering your AI blind spots</h1>
              <p className="mt-3 text-sm leading-6 text-white/66">The audit is crawling how AI engines read, trust, and cite your brand right now across search, answers, schema, and authority signals.</p>
            </div>
            <div className="grid gap-8 p-6 md:grid-cols-[240px_1fr] md:items-center md:p-10">
              <div className="flex flex-col items-center">
                <div className="progress-ring flex size-52 items-center justify-center rounded-full shadow-soft" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
                  <div className="flex size-40 flex-col items-center justify-center rounded-full bg-white">
                    <Gauge className="mb-2 size-8 text-gold" />
                    <span className="text-4xl font-bold">{progress}%</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold md:text-3xl">Uncovering what AI really thinks about your brand</h2>
                  <p className="mt-2 text-sm text-ink/60">Your report opens automatically. This takes about 60 seconds.</p>
                </div>
                <div className="mb-6 flex min-h-12 items-center gap-3 rounded-lg border border-gold/30 bg-gold/15 px-4 text-sm font-bold text-ink">
                  <Loader2 className="size-4 animate-spin" />
                  {statuses[Math.floor(progress / 20) % statuses.length]}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tasks.map((task, index) => (
                    <div key={task} className="flex items-center gap-3 text-sm">
                      <span className={`flex size-6 items-center justify-center rounded-full ${index < completedTasks ? "bg-gold text-ink" : "bg-ink/10 text-ink/40"}`}>
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
    <main className="app-shell min-h-screen overflow-hidden px-5 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-7xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <div className="inline-flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-ink text-gold shadow-soft">
              <Gauge className="size-5" />
            </div>
            <div>
              <p className="text-sm font-black text-ink">AI Visibility Analyzer</p>
              <p className="text-xs font-semibold text-ink/50">GLOMAUDIT</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {signals.map((signal) => (
              <span key={signal} className="rounded-full border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-bold text-ink/64 shadow-soft backdrop-blur">
                {signal}
              </span>
            ))}
          </div>
        </header>

        <div className="grid flex-1 gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-center lg:py-10">
          <section className="max-w-5xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/78 px-3 py-2 text-sm font-bold text-ink shadow-soft backdrop-blur">
              <WandSparkles className="size-4 text-gold" />
              Multi-channel visibility scoring
            </div>
            <h1 className="max-w-4xl text-4xl font-black leading-[1.08] tracking-normal text-ink sm:text-5xl lg:text-[56px]">
              <span className="block">Your competitors are being</span>
              <span className="block">recommended by AI.</span>
              <span className="block">You're not. Here's proof.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-ink/62 sm:text-lg">
              Generate a boardroom-ready visibility score across AI answers, classic search, local discovery, video results, entity authority, and category-level prompts.
            </p>

            <div className="mt-7 grid max-w-4xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <div key={channel.label} className="rounded-lg border border-black/10 bg-white/86 p-4 shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:border-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${channel.tone}`}>
                        <Icon className="size-5" />
                      </div>
                      <Sparkles className="size-4 text-gold" />
                    </div>
                    <p className="mt-5 text-4xl font-black leading-none text-ink">{channel.value}</p>
                    <p className="mt-2 text-sm font-bold leading-5 text-ink/62">{channel.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid max-w-4xl gap-3 md:grid-cols-3">
              {["Why AI ignores you", "What's broken", "How to fix it"].map((item, index) => (
                <div key={item} className="flex min-h-14 items-center gap-3 rounded-lg border border-black/10 bg-white/72 p-3 text-sm font-bold text-ink/72 shadow-soft backdrop-blur">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/25 text-ink">{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <Card className="relative overflow-hidden border-black/10 bg-white/96 shadow-panel">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-mint to-teal" />
            <div className="border-b border-black/10 bg-ink p-6 text-white">
              <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-sm font-bold text-gold">AI Visibility Audit - Free</p>
                <div className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-gold shadow-soft">
                  <Sparkles className="size-5" />
                </div>
              </div>
              <h2 className="text-m font-black leading-tight">Your competitor is being recommended, Are you?</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/68">You can rank #1 and still lose. If AI doesn't recommend your brand, you're invisible where buying decisions happen.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-ink/70">Brand Name</label>
                <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Brand Name" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-ink/70">Website URL</label>
                <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://domain.com" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-ink/70">Business Email</label>
                <Input type="email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} placeholder="you@company.com" required />
              </div>
              {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm font-medium text-coral">{error}</p> : null}
              <Button className="w-full rounded-lg bg-gold text-ink shadow-soft hover:bg-gold" type="submit">
                Show Me What AI Thinks Of My Brand
                <ArrowRight className="size-4" />
              </Button>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                {["AI", "SEO", "GEO"].map((label) => (
                  <div key={label} className="rounded-lg border border-black/10 bg-mist/70 px-2 py-3">
                    <p className="text-xs font-black text-ink">{label}</p>
                    <p className="mt-1 text-[11px] font-semibold text-ink/48">included</p>
                  </div>
                ))}
              </div>
            </form>
          </Card>
        </div>

        <section className="pb-14 pt-8 lg:pb-20">
          <div className="rounded-lg border border-black/10 bg-white/78 p-5 shadow-soft backdrop-blur md:p-7 lg:p-8">
            <div className="mb-6 flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-black uppercase text-gold">Free report</p>
                <h2 className="mt-2 text-2xl font-black leading-tight text-ink md:text-3xl">
                  10 audit dimensions. Zero fluff.
                </h2>
              </div>
              <p className="max-w-xl text-sm font-medium leading-6 text-ink/60">
                See where AI engines fail to read, trust, or cite your brand across answers, search, schema, and authority signals.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
              <div className="grid grid-cols-[0.85fr_1.15fr] border-b border-black/10 bg-mist/70 px-4 py-3 text-xs font-black uppercase text-ink/56">
                <div>Dimension</div>
                <div>What it reveals</div>
              </div>
              <div className="divide-y divide-black/10">
                {auditDimensions.map((item, index) => (
                  <div key={item.dimension} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[0.85fr_1.15fr] sm:gap-5">
                    <div className="flex items-center gap-3 font-black text-ink">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gold/18 text-xs text-ink">{index + 1}</span>
                      {item.dimension}
                    </div>
                    <p className="font-medium leading-6 text-ink/64">{item.reveals}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 rounded-lg border border-gold/25 bg-gold/10 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-bold leading-6 text-ink/78">
                  The brands winning in 2026 are the ones AI trusts enough to recommend. Every week you wait, your competitors get cited instead of you.
                </p>
                <p className="mt-1 text-xs font-semibold text-ink/52">No credit card. No login. Just your score, your issues, and we help you to fix them.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="rounded-lg bg-gold px-5 text-ink shadow-soft hover:bg-gold" type="button">
                  Run My Free Audit
                  <ArrowRight className="size-4" />
                </Button>
                <button suppressHydrationWarning type="button" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-sm font-black text-teal transition hover:border-teal/30 hover:text-ink">
                  Request a call back
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
