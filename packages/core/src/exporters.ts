import { AiVisibilityReport } from "./types.js";

export function reportToJson(report: AiVisibilityReport) {
  return JSON.stringify(report, null, 2);
}

export function reportToCsv(report: AiVisibilityReport) {
  const rows = [
    ["Metric", "Value"],
    ["Brand", report.brandName],
    ["AI Visibility Score", `${report.visibilityScore}%`],
    ["Visibility Level", report.visibilityLevel],
    ["AI Decision Coverage", `${report.breakdown.aiDecisionCoverage}%`],
    ["Competitive Landscape", `${report.breakdown.competitiveLandscape}%`],
    ["Brand Authority", `${report.breakdown.brandAuthority}%`],
    ["Entity Strength", `${report.breakdown.entityStrength}%`],
    ["Search Readiness", `${report.breakdown.searchReadiness}%`]
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}

export function reportToHtml(report: AiVisibilityReport) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${report.brandName} AI Visibility Report</title></head>
<body style="font-family:Inter,Arial,sans-serif;color:#111827;line-height:1.5;padding:32px">
<h1>${report.brandName} AI Visibility Report</h1>
<h2>${report.visibilityScore}% - ${report.visibilityLevel}</h2>
<p>${report.sentiment.explanation}</p>
<h3>Recommendations</h3>
${report.recommendations.map((group) => `<h4>${group.priority}</h4><ul>${group.items.map((item) => `<li>${item}</li>`).join("")}</ul>`).join("")}
</body>
</html>`;
}
