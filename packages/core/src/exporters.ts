import { AiVisibilityReport } from "./types.js";
import { toStructuredAiVisibilityReport } from "./structured-report.js";

export function reportToJson(report: AiVisibilityReport) {
  return JSON.stringify(toStructuredAiVisibilityReport(report), null, 2);
}

export function reportToCsv(report: AiVisibilityReport) {
  const publicReport = toStructuredAiVisibilityReport(report);
  const rows = [
    ["Metric", "Value"],
    ["Brand", publicReport.brand],
    ["AI Visibility Score", `${publicReport.overall_score}%`],
    ["Rating", publicReport.rating_label],
    ["Technical Score", `${publicReport.technical_audit.score}%`],
    ["Technical Grade", publicReport.technical_audit.grade],
    ["Technical Issues Found", publicReport.technical_audit.issues_found],
    ["GEO / AEO Score", `${publicReport.geo_aeo_audit.score}%`],
    ["GEO / AEO Grade", publicReport.geo_aeo_audit.grade],
    ["GEO / AEO Opportunities Found", publicReport.geo_aeo_audit.opportunity_counts.high + publicReport.geo_aeo_audit.opportunity_counts.medium + publicReport.geo_aeo_audit.opportunity_counts.low],
    [],
    ["Technical Category", "Total Checks", "Issues Found", "Category Score", "Status"],
    ...publicReport.technical_categories.map((category) => [
      category.categoryName,
      category.totalChecks,
      category.failedChecks,
      `${category.score}%`,
      category.status
    ]),
    [],
    ["GEO / AEO Category", "Total Checks", "Issues Found", "Category Score", "Status"],
    ...publicReport.geo_aeo_audit.categories.map((category) => [
      category.categoryName,
      category.totalChecks,
      category.failedChecks,
      `${category.score}%`,
      category.status
    ])
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}

export function reportToHtml(report: AiVisibilityReport) {
  const publicReport = toStructuredAiVisibilityReport(report);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${publicReport.brand} AI Visibility Report</title></head>
<body style="font-family:Inter,Arial,sans-serif;color:#111827;line-height:1.5;padding:32px">
<h1>${publicReport.brand} AI Visibility Report</h1>
<h2>${publicReport.overall_score}% - ${publicReport.rating_label}</h2>
<p>${publicReport.rating_description}</p>
<h3>Top Summary</h3>
<p><strong>Technical Audit:</strong> ${publicReport.technical_audit.score}% - Grade ${publicReport.technical_audit.grade} - ${publicReport.technical_audit.issues_found} Issues Found</p>
<p><strong>GEO / AEO Audit:</strong> ${publicReport.geo_aeo_audit.score}% - Grade ${publicReport.geo_aeo_audit.grade} - ${publicReport.geo_aeo_audit.opportunity_counts.high + publicReport.geo_aeo_audit.opportunity_counts.medium + publicReport.geo_aeo_audit.opportunity_counts.low} Opportunities Found</p>
<h3>GEO / AEO Summary</h3>
<p><strong>${publicReport.geo_aeo_audit.score}%</strong> - Grade ${publicReport.geo_aeo_audit.grade} (${publicReport.geo_aeo_audit.grade_description})</p>
<table style="border-collapse:collapse;width:100%">
<thead><tr><th align="left">Category</th><th align="left">Total Checks</th><th align="left">Issues Found</th><th align="left">Score</th><th align="left">Status</th></tr></thead>
<tbody>
${publicReport.geo_aeo_audit.categories.map((category) => `<tr><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.categoryName}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.totalChecks}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0;color:${category.failedChecks > 0 ? "#e95f5c" : "#187c72"};font-weight:700">${category.failedChecks}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.score}%</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.status}</td></tr>`).join("")}
</tbody>
</table>
<h3>Technical Category Summary</h3>
<table style="border-collapse:collapse;width:100%">
<thead><tr><th align="left">Category</th><th align="left">Total Checks</th><th align="left">Issues Found</th><th align="left">Score</th><th align="left">Status</th></tr></thead>
<tbody>
${publicReport.technical_categories.map((category) => `<tr><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.categoryName}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.totalChecks}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0;color:${category.failedChecks > 0 ? "#e95f5c" : "#187c72"};font-weight:700">${category.failedChecks}</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.score}%</td><td style="border-top:1px solid #e5e7eb;padding:8px 0">${category.status}</td></tr>`).join("")}
</tbody>
</table>
</body>
</html>`;
}

function pdfText(value: string | number) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLength = 88) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function reportToPdf(report: AiVisibilityReport) {
  const publicReport = toStructuredAiVisibilityReport(report);
  const geoOpportunities =
    publicReport.geo_aeo_audit.opportunity_counts.high +
    publicReport.geo_aeo_audit.opportunity_counts.medium +
    publicReport.geo_aeo_audit.opportunity_counts.low;
  const technicalIssues = [...publicReport.technical_categories]
    .filter((category) => category.failedChecks > 0)
    .sort((a, b) => b.failedChecks - a.failedChecks || a.score - b.score);
  const geoIssues = [...publicReport.geo_aeo_audit.categories]
    .filter((category) => category.failedChecks > 0)
    .sort((a, b) => b.failedChecks - a.failedChecks || a.score - b.score);
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 742;

  const color = {
    ink: "0.06 0.09 0.12",
    muted: "0.38 0.43 0.48",
    teal: "0.09 0.49 0.45",
    mint: "0.77 0.96 0.86",
    coral: "0.91 0.37 0.36",
    coralSoft: "1 0.91 0.90",
    gold: "0.95 0.70 0.22",
    goldSoft: "1 0.96 0.82",
    cloud: "0.96 0.98 0.99",
    border: "0.86 0.88 0.90",
    white: "1 1 1"
  };

  const push = (command: string) => commands.push(command);
  const setFill = (rgb: string) => push(`${rgb} rg`);
  const setStroke = (rgb: string) => push(`${rgb} RG`);
  const rect = (x: number, top: number, width: number, height: number, fill: string, stroke?: string) => {
    setFill(fill);
    if (stroke) setStroke(stroke);
    push(`${x} ${top - height} ${width} ${height} re ${stroke ? "B" : "f"}`);
  };
  const text = (value: string | number, x: number, top: number, size = 10, fill = color.ink, font = "F1") => {
    setFill(fill);
    push(`BT /${font} ${size} Tf ${x} ${top} Td (${pdfText(value)}) Tj ET`);
  };
  const wrapped = (value: string, x: number, top: number, maxLength: number, size = 10, fill = color.ink, font = "F1", lineGap = 14) => {
    const lines = wrapText(value, maxLength);
    lines.forEach((line, index) => text(line, x, top - index * lineGap, size, fill, font));
    return top - Math.max(1, lines.length) * lineGap;
  };
  const newPage = () => {
    pages.push(commands);
    commands = [];
    y = 742;
  };
  const toneForScore = (score: number) => score < 55 ? color.coral : score < 75 ? color.gold : color.teal;
  const severityFill = (score: number) => score < 40 ? color.coralSoft : score < 70 ? color.goldSoft : color.cloud;
  const issueLabel = (count: number) => count === 1 ? "1 issue" : `${count} issues`;
  const scoreCard = (x: number, title: string, score: number, label: string, note: string) => {
    rect(x, y, 162, 112, color.white, color.border);
    text(title, x + 14, y - 22, 10, color.muted, "F2");
    text(`${score}%`, x + 14, y - 62, 32, toneForScore(score), "F2");
    text(label, x + 92, y - 42, 10, color.ink, "F2");
    wrapped(note, x + 14, y - 82, 26, 8, color.muted, "F1", 10);
  };
  const categoryRow = (category: { categoryName: string; score: number; failedChecks: number; status: string }, index: number, x: number, width: number) => {
    const rowTop = y;
    rect(x, rowTop, width, 28, index % 2 === 0 ? color.white : color.cloud, color.border);
    rect(x + 8, rowTop - 8, 10, 10, toneForScore(category.score));
    text(category.categoryName, x + 24, rowTop - 18, 9, color.ink, "F2");
    text(`${category.score}%`, x + width - 188, rowTop - 18, 9, toneForScore(category.score), "F2");
    text(issueLabel(category.failedChecks), x + width - 132, rowTop - 18, 9, category.failedChecks > 0 ? color.coral : color.teal, "F2");
    text(category.status, x + width - 58, rowTop - 18, 8, color.muted, "F1");
    y -= 28;
  };
  const issueList = (title: string, items: typeof technicalIssues, x: number, width: number) => {
    text(title, x, y, 14, color.ink, "F2");
    y -= 18;
    if (!items.length) {
      rect(x, y, width, 34, color.cloud, color.border);
      text("No urgent issues detected in this section.", x + 12, y - 20, 10, color.teal, "F2");
      y -= 46;
      return;
    }
    items.slice(0, 8).forEach((category, index) => categoryRow(category, index, x, width));
    y -= 16;
  };

  rect(0, 792, 612, 118, color.ink);
  text("AEO GEO VISIBILITY AUDIT.COM", 42, 752, 11, color.mint, "F2");
  text("AI Visibility, GEO and AEO Audit Report", 42, 734, 10, "0.78 0.84 0.86", "F1");
  wrapped(publicReport.brand, 42, 708, 32, 26, color.white, "F2", 28);
  text(publicReport.url, 42, 676, 10, "0.78 0.84 0.86", "F1");
  rect(412, 744, 134, 48, color.teal);
  text("Overall Score", 426, 724, 9, color.white, "F2");
  text(`${publicReport.overall_score}%`, 426, 704, 22, color.white, "F2");

  y = 632;
  scoreCard(42, "AI Visibility Score", publicReport.overall_score, publicReport.rating_label, "Combined score from technical health and GEO / AEO readiness.");
  scoreCard(225, "Technical Audit", publicReport.technical_audit.score, `Grade ${publicReport.technical_audit.grade}`, `${publicReport.technical_audit.issues_found} issues found across site health checks.`);
  scoreCard(408, "GEO / AEO Audit", publicReport.geo_aeo_audit.score, `Grade ${publicReport.geo_aeo_audit.grade}`, `${geoOpportunities} opportunities found for AI answer visibility.`);

  y -= 142;
  rect(42, y, 504, 86, publicReport.overall_score < 70 ? color.coralSoft : color.goldSoft, color.coral);
  text("Immediate attention required", 60, y - 24, 16, color.coral, "F2");
  const urgency = `${publicReport.brand} is currently scoring ${publicReport.overall_score}%. We found ${publicReport.technical_audit.issues_found} technical issues and ${geoOpportunities} GEO / AEO opportunities that can limit how confidently AI systems understand, cite, and recommend the brand.`;
  wrapped(urgency, 60, y - 46, 76, 10, color.ink, "F1", 13);

  y -= 118;
  text("Why this matters", 42, y, 15, color.ink, "F2");
  y = wrapped("AI search engines rely on crawl access, structured data, entity clarity, page quality, and trust signals. When these signals are weak, buyers can complete research without seeing or trusting the brand.", 42, y - 20, 92, 10, color.muted, "F1", 14);

  y -= 22;
  rect(42, y, 504, 76, color.cloud, color.border);
  text("About this audit", 60, y - 22, 13, color.ink, "F2");
  wrapped("This report reviews technical, GEO, and AEO gaps that affect visibility in AI-assisted discovery. It is based on automated crawl checks, structured data review, content signals, and AI readiness indicators.", 60, y - 42, 78, 9, color.muted, "F1", 12);

  y -= 104;
  rect(42, y, 504, 76, color.ink);
  text("Recommended next step", 60, y - 22, 12, color.mint, "F2");
  wrapped("Book a strategy call to prioritize the issues that most directly affect AI visibility, organic traffic, sales, buyer trust, and lead generation.", 60, y - 42, 78, 10, color.white, "F2", 13);

  newPage();

  text("Priority Issues To Fix First", 42, y, 22, color.ink, "F2");
  y -= 22;
  wrapped("These are the highest-friction areas found in the audit. Fixing them first can improve how search engines and AI systems crawl, understand, trust, and recommend the brand.", 42, y, 94, 10, color.muted, "F1", 13);
  y -= 32;
  issueList("Top Technical Issues", technicalIssues, 42, 504);
  if (y < 260) newPage();
  issueList("Top GEO / AEO Opportunities", geoIssues, 42, 504);

  newPage();

  text("Detailed Issue Breakdown", 42, y, 22, color.ink, "F2");
  y -= 22;
  wrapped("Rows highlighted in red or yellow deserve priority review. Low-scoring categories usually contain missing crawl, schema, trust, content, or AI readiness signals.", 42, y, 94, 10, color.muted, "F1", 13);
  y -= 30;
  text("Technical Audit Categories", 42, y, 14, color.ink, "F2");
  y -= 16;
  publicReport.technical_categories.forEach((category, index) => {
    if (y < 82) {
      newPage();
      text("Technical Audit Categories", 42, y, 14, color.ink, "F2");
      y -= 16;
    }
    rect(42, y, 504, 26, severityFill(category.score), color.border);
    text(category.categoryName, 54, y - 17, 9, color.ink, "F2");
    text(`${category.score}%`, 338, y - 17, 9, toneForScore(category.score), "F2");
    text(issueLabel(category.failedChecks), 390, y - 17, 9, category.failedChecks > 0 ? color.coral : color.teal, "F2");
    text(category.status, 466, y - 17, 8, color.muted, "F1");
    y -= 26;
    if (index === publicReport.technical_categories.length - 1) y -= 20;
  });
  if (y < 220) newPage();
  text("GEO / AEO Audit Categories", 42, y, 14, color.ink, "F2");
  y -= 16;
  publicReport.geo_aeo_audit.categories.forEach((category) => {
    if (y < 82) {
      newPage();
      text("GEO / AEO Audit Categories", 42, y, 14, color.ink, "F2");
      y -= 16;
    }
    rect(42, y, 504, 26, severityFill(category.score), color.border);
    text(category.categoryName, 54, y - 17, 9, color.ink, "F2");
    text(`${category.score}%`, 338, y - 17, 9, toneForScore(category.score), "F2");
    text(issueLabel(category.failedChecks), 390, y - 17, 9, category.failedChecks > 0 ? color.coral : color.teal, "F2");
    text(category.status, 466, y - 17, 8, color.muted, "F1");
    y -= 26;
  });

  if (commands.length) pages.push(commands);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];

  pages.forEach((pageCommands, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const stream = pageCommands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join(""), "latin1"));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.from(chunks.join(""), "latin1");
}
