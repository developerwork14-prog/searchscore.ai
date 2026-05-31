import type { CreatedPublicReport, PlaygroundResult, ReportInput, StructuredAiVisibilityReport } from "@aiva/core";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await response.json().catch(() => null))?.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function createReport(input: ReportInput) {
  const response = await fetch(`${API_BASE}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<CreatedPublicReport>(response);
}

export async function getReport(id: string) {
  const response = await fetch(`${API_BASE}/api/reports/${id}`, { cache: "no-store" });
  return parseResponse<StructuredAiVisibilityReport>(response);
}

export async function runPlayground(reportId: string, prompt: string) {
  const response = await fetch(`${API_BASE}/api/playground`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, prompt })
  });
  return parseResponse<PlaygroundResult>(response);
}

export async function submitStrategyCall(input: { reportId: string; name: string; email: string; phone: string }) {
  const response = await fetch(`${API_BASE}/api/strategy-call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<{ ok: boolean; message: string; mailtoUrl: string; whatsappUrl: string }>(response);
}
