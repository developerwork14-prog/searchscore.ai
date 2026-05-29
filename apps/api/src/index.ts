import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { generateVisibilityReport, reportToCsv, reportToHtml, reportToJson, runPromptPlayground } from "@aiva/core";
import { z } from "zod";
import { env } from "./env.js";
import { reportStore } from "./report-store.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.webOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const reportInputSchema = z.object({
  brandName: z.string().min(2).max(120),
  websiteUrl: z.string().min(4).max(300),
  businessEmail: z.string().email()
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-visibility-analyzer-api" });
});

app.post("/api/reports", async (req, res, next) => {
  try {
    const input = reportInputSchema.parse(req.body);
    const report = await generateVisibilityReport(input, env.webOrigin);
    await reportStore.save(report);
    res.status(201).json(report);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/:id", async (req, res) => {
  const report = await reportStore.get(req.params.id);
  if (!report) {
    res.status(404).json({ message: "Report not found" });
    return;
  }
  res.json(report);
});

app.post("/api/playground", async (req, res, next) => {
  try {
    const body = z.object({
      reportId: z.string(),
      prompt: z.string().min(4).max(500)
    }).parse(req.body);
    const report = await reportStore.get(body.reportId);
    if (!report) {
      res.status(404).json({ message: "Report not found" });
      return;
    }
    res.json(runPromptPlayground(report.brandName, body.prompt, report.visibilityScore));
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/:id/export/:format", async (req, res) => {
  const report = await reportStore.get(req.params.id);
  if (!report) {
    res.status(404).json({ message: "Report not found" });
    return;
  }

  if (req.params.format === "json") {
    res.type("application/json").send(reportToJson(report));
    return;
  }
  if (req.params.format === "excel") {
    res.setHeader("Content-Disposition", `attachment; filename="${report.brandName}-visibility.csv"`);
    res.type("text/csv").send(reportToCsv(report));
    return;
  }
  if (req.params.format === "pdf") {
    res.setHeader("Content-Disposition", `attachment; filename="${report.brandName}-visibility.html"`);
    res.type("text/html").send(reportToHtml(report));
    return;
  }

  res.status(400).json({ message: "Unsupported export format" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.flatten() });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`AI Visibility Analyzer API running on http://localhost:${env.port}`);
});
