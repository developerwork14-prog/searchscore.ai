import type { AiVisibilityReport, PlaygroundResult, ReportInput } from "@aiva/core";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

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
  return parseResponse<AiVisibilityReport>(response);
}

export async function getReport(id: string) {
  const response = await fetch(`${API_BASE}/api/reports/${id}`, { cache: "no-store" });
  return parseResponse<AiVisibilityReport>(response);
}

export async function runPlayground(reportId: string, prompt: string) {
  const response = await fetch(`${API_BASE}/api/playground`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId, prompt })
  });
  return parseResponse<PlaygroundResult>(response);
}
