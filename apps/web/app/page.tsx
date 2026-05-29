"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Gauge, Loader2 } from "lucide-react";
import { createReport } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

const tasks = [
  "Scanning AI Search Engines",
  "Scanning Traditional Search Engines",
  "Scanning Video Search Engines",
  "Scanning Local Search Engines",
  "Checking Brand Authority",
  "Checking Entity Authority",
  "Analyzing Competitors",
  "Generating Visibility Score",
  "Compiling Insights"
];

const statuses = [
  "Checking how AI engines perceive your brand",
  "Comparing competitors",
  "Evaluating brand authority",
  "Analyzing high-intent customer prompts",
  "Measuring AI recommendation likelihood"
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
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-10">
        <Card className="p-6 md:p-10">
          <div className="grid gap-8 md:grid-cols-[280px_1fr] md:items-center">
            <div className="flex flex-col items-center">
              <div
                className="progress-ring flex size-48 items-center justify-center rounded-full"
                style={{ "--progress": `${progress}%` } as React.CSSProperties}
              >
                <div className="flex size-36 flex-col items-center justify-center rounded-full bg-white">
                  <Gauge className="mb-2 size-8 text-teal" />
                  <span className="text-4xl font-bold">{progress}%</span>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-6">
                <h1 className="text-3xl font-bold md:text-4xl">Analyzing Your Visibility...</h1>
                <p className="mt-2 text-base text-ink/65">Generating your comprehensive report...</p>
                <p className="mt-1 text-sm font-medium text-teal">Estimated time: 45-60 seconds</p>
              </div>
              <div className="mb-6 flex min-h-12 items-center gap-3 rounded-md bg-mist px-4 text-sm font-semibold text-teal">
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
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1fr_440px] lg:items-center">
      <section>
        <div className="mb-8 inline-flex items-center gap-2 rounded-md border border-teal/20 bg-mist px-3 py-2 text-sm font-semibold text-teal">
          <Gauge className="size-4" />
          AI Visibility Analyzer
        </div>
        <h1 className="max-w-3xl text-5xl font-bold tracking-normal md:text-7xl">Know if AI engines recommend your brand.</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink/65">
          A single business-focused score across AI search, traditional search, local discovery, video search, entity authority, and competitor visibility.
        </p>
      </section>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold">Brand Name</label>
            <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Acme Finance" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Website URL</label>
            <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Business Email</label>
            <Input type="email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} placeholder="you@company.com" required />
          </div>
          {error ? <p className="rounded-md bg-coral/10 px-3 py-2 text-sm font-medium text-coral">{error}</p> : null}
          <Button className="w-full" type="submit">
            Generate Report
            <ArrowRight className="size-4" />
          </Button>
        </form>
      </Card>
    </main>
  );
}
