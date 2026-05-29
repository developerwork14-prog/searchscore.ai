import {
  AiVisibilityReport,
  CompetitorVisibility,
  ReportInput,
  RiskLevel,
  ScoringPillars,
  VisibilityLevel
} from "./types.js";
import { runTechnicalAudit } from "./technical-audit.js";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function stableHash(value: string) {
  return [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function scoreFromSeed(seed: number, offset: number, min = 18, max = 82) {
  const normalized = ((seed >> offset) & 0xff) / 255;
  return clamp(min + normalized * (max - min));
}

function getVisibilityLevel(score: number): VisibilityLevel {
  if (score < 25) return "Critical";
  if (score < 40) return "Poor";
  if (score < 55) return "Below Average";
  if (score < 70) return "Average";
  if (score < 85) return "Strong";
  return "Excellent";
}

function inferCategory(input: ReportInput) {
  const text = `${input.brandName} ${input.websiteUrl}`.toLowerCase();
  if (text.includes("loan") || text.includes("fin") || text.includes("pay")) return "Financial technology";
  if (text.includes("health") || text.includes("care") || text.includes("clinic")) return "Healthcare services";
  if (text.includes("shop") || text.includes("store") || text.includes("mart")) return "Ecommerce";
  if (text.includes("travel") || text.includes("hotel") || text.includes("trip")) return "Travel and hospitality";
  if (text.includes("ai") || text.includes("saas") || text.includes("cloud")) return "B2B software";
  return "Digital business";
}

function competitorNames(input: ReportInput, category: string) {
  const domain = new URL(input.websiteUrl).hostname.replace(/^www\./, "").split(".")[0];
  const base = category === "Financial technology"
    ? ["Navi", "MoneyTap", "KreditBee", "CASHe"]
    : category === "B2B software"
      ? ["Profound", "AthenaHQ", "SearchScore", "Peec AI"]
      : ["Market Leader", "Category Hero", "Growth Challenger", "Local Favorite"];
  return base.filter((name) => name.toLowerCase() !== input.brandName.toLowerCase() && name.toLowerCase() !== domain).slice(0, 4);
}

function calculateScore(pillars: ScoringPillars) {
  return clamp(
    pillars.technicalFoundation * 0.2 +
      pillars.geoReadiness * 0.25 +
      pillars.aeoReadiness * 0.15 +
      pillars.brandAuthority * 0.15 +
      pillars.aiSearchVisibility * 0.25
  );
}

function riskLevel(score: number): RiskLevel {
  if (score < 25) return "Critical";
  if (score < 45) return "High";
  if (score < 70) return "Medium";
  return "Low";
}

export async function generateVisibilityReport(input: ReportInput, origin = "http://localhost:3000"): Promise<AiVisibilityReport> {
  const normalizedUrl = input.websiteUrl.startsWith("http") ? input.websiteUrl : `https://${input.websiteUrl}`;
  const normalizedInput = { ...input, websiteUrl: normalizedUrl };
  const seed = stableHash(`${input.brandName}:${normalizedUrl}:${input.businessEmail}`);
  const category = inferCategory(normalizedInput);
  const technicalAudit = await runTechnicalAudit(normalizedUrl);

  const pillars: ScoringPillars = {
    technicalFoundation: technicalAudit.score,
    geoReadiness: scoreFromSeed(seed, 4, 20, 75),
    aeoReadiness: scoreFromSeed(seed, 8, 16, 78),
    brandAuthority: scoreFromSeed(seed, 12, 18, 80),
    aiSearchVisibility: scoreFromSeed(seed, 16, 12, 70)
  };

  const visibilityScore = calculateScore(pillars);
  const competitors: CompetitorVisibility[] = [
    { name: input.brandName, visibility: visibilityScore, isYou: true },
    ...competitorNames(normalizedInput, category).map((name, index) => ({
      name,
      visibility: clamp(visibilityScore + 8 + index * 7 + ((seed >> (index + 3)) % 9))
    }))
  ];

  const id = `${stableHash(`${Date.now()}:${input.brandName}`).toString(36)}-${Date.now().toString(36)}`;
  const prompts = [
    `Best ${category.toLowerCase()} brands for growing teams`,
    `Top alternatives to ${input.brandName}`,
    `Is ${input.brandName} worth it for businesses`,
    `How to choose a ${category.toLowerCase()} provider`,
    `Best ${category.toLowerCase()} options near me`
  ];

  return {
    id,
    createdAt: new Date().toISOString(),
    brandName: input.brandName,
    websiteUrl: normalizedUrl,
    businessEmail: input.businessEmail,
    visibilityScore,
    visibilityLevel: getVisibilityLevel(visibilityScore),
    pillars,
    breakdown: {
      aiDecisionCoverage: pillars.aiSearchVisibility,
      competitiveLandscape: clamp(100 - Math.max(...competitors.slice(1).map((c) => c.visibility)) + visibilityScore),
      brandAuthority: pillars.brandAuthority,
      entityStrength: pillars.geoReadiness,
      searchReadiness: clamp((pillars.technicalFoundation + pillars.aeoReadiness) / 2)
    },
    competitors,
    losingPrompts: prompts.slice(0, 4).map((prompt, index) => ({
      prompt,
      intentType: ["Commercial", "Comparison", "Transactional", "Informational"][index] as never,
      visibility: clamp(pillars.aiSearchVisibility - 12 + index * 5)
    })),
    opportunities: prompts.map((prompt, index) => ({
      prompt,
      currentVisibility: clamp(pillars.aiSearchVisibility - 18 + index * 4),
      potentialTrafficOpportunity: ["High-intent buyers", "Competitor switchers", "Evaluation traffic", "Research demand", "Local discovery"][index],
      difficulty: (index < 2 ? "Medium" : index === 2 ? "High" : "Low") as never,
      impact: (index < 3 ? "High" : "Medium") as never
    })),
    perception: {
      businessCategory: category,
      mainServices: [`${category} solutions`, "Customer acquisition support", "Digital decision enablement"],
      targetAudience: ["High-intent buyers", "Comparison-stage prospects", "Local and category searchers"],
      marketPositioning: ["Recognized but underrepresented in AI answers", "Competing against stronger category entities"],
      strengths: ["Clear brand identity", "Recoverable prompt demand", "Solid search readiness signals"],
      weaknesses: ["Limited appearance in buying prompts", "Competitors have stronger entity associations", "Needs more answer-ready content"]
    },
    sentiment: {
      value: visibilityScore >= 70 ? "Positive" : visibilityScore >= 40 ? "Neutral" : "Negative",
      explanation:
        visibilityScore >= 70
          ? "AI perception is favorable, with enough authority signals to appear in category conversations."
          : visibilityScore >= 40
            ? "Visibility appears moderate with limited authority signals compared with category leaders."
            : "AI engines have weak evidence to confidently recommend the brand in commercial prompts."
    },
    risk: {
      level: riskLevel(visibilityScore),
      factors: ["Missing from buying prompts", "Weak AI visibility", "Weak entity authority", "Weak competitor positioning"],
      businessImpact: [
        "Competitors are being recommended before your brand.",
        "Potential revenue loss due to AI invisibility.",
        "High-intent customers may complete research without encountering your brand."
      ]
    },
    recommendations: [
      {
        priority: "High Priority",
        items: ["Create comparison pages", "Improve entity authority", "Expand AI-answer-ready content"]
      },
      {
        priority: "Medium Priority",
        items: ["Add FAQ content", "Improve topical coverage", "Strengthen author signals"]
      },
      {
        priority: "Low Priority",
        items: ["Refresh review signals", "Align brand descriptions across profiles", "Publish category education pages"]
      }
    ],
    shareUrl: `${origin}/report/${id}`
  };
}
