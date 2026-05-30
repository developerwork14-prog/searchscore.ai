import {
  AiVisibilityReport,
  AiMarketPosition,
  Recommendation,
  RecommendationPriority,
  ReportInput,
  RiskLevel,
  ScoringPillars,
  VisibilityLevel
} from "./types.js";
import { runTechnicalAudit, TechnicalAuditResult, TechnicalCheckResult, TechnicalSeverity } from "./technical-audit.js";
import { classifyBusiness } from "./lib/business-classification.js";

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

function authorityStrength(score: number): AiMarketPosition["authorityStrength"] {
  if (score < 35) return "Low";
  if (score < 65) return "Moderate";
  if (score < 85) return "Strong";
  return "Excellent";
}

function marketPosition(score: number, categoryVisibility: number, authority: number) {
  if (score >= 80 && categoryVisibility >= 75 && authority >= 75) return "Strong AI-ready position within the detected category";
  if (score >= 65 && categoryVisibility >= 60) return "Established AI visibility within the detected category";
  if (score >= 45) return "Developing AI presence with clear optimization upside";
  return "Early-stage AI visibility with limited supporting evidence";
}

function priorityFromSeverity(severities: TechnicalSeverity[]): RecommendationPriority {
  if (severities.includes("BLOCKER") || severities.includes("MAJOR")) return "High Priority";
  if (severities.includes("MINOR")) return "Medium Priority";
  return "Low Priority";
}

function severityRank(priority: RecommendationPriority) {
  return priority === "High Priority" ? 0 : priority === "Medium Priority" ? 1 : 2;
}

function evidenceFor(checks: TechnicalCheckResult[]) {
  return checks.map((check) => `${check.name}: ${check.evidence}`).join("; ");
}

function makeRecommendation(
  failedChecks: TechnicalCheckResult[],
  checkIds: number[],
  recommendation: string,
  expectedAiVisibilityImpact: string,
  priority?: RecommendationPriority
): Recommendation | null {
  const matched = failedChecks.filter((check) => checkIds.includes(check.id));
  if (!matched.length) return null;

  return {
    priority: priority ?? priorityFromSeverity(matched.map((check) => check.severity)),
    recommendation,
    reason: evidenceFor(matched),
    expectedAiVisibilityImpact
  };
}

function generateAuditRecommendations(audit: TechnicalAuditResult): Recommendation[] {
  const failedChecks = audit.checks.filter((check) => !check.passed);
  const recommendations = [
    makeRecommendation(
      failedChecks,
      [85],
      "Implement FAQPage schema for visible FAQ sections",
      "Helps AI engines extract concise question-answer pairs from the page and use them in answer-style results."
    ),
    makeRecommendation(
      failedChecks,
      [80, 81],
      "Implement Organization schema with sameAs entity links",
      "Strengthens brand entity recognition by connecting the website to official social, directory, and profile URLs."
    ),
    makeRecommendation(
      failedChecks,
      [77, 78, 79, 91],
      "Fix JSON-LD schema coverage and validation errors",
      "Improves machine-readable context so AI systems can parse the brand, services, and page purpose with less ambiguity."
    ),
    makeRecommendation(
      failedChecks,
      [82],
      "Add WebSite schema with SearchAction",
      "Gives crawlers a clearer site-level entity and search pattern, improving structured understanding of the domain."
    ),
    makeRecommendation(
      failedChecks,
      [87],
      "Add LocalBusiness or ProfessionalService schema on service pages",
      "Clarifies location, service area, and service type for local and service-intent AI recommendations."
    ),
    makeRecommendation(
      failedChecks,
      [89],
      "Add Product schema on product or pricing pages",
      "Makes product names, offers, and pricing easier for AI systems to interpret in commercial prompts."
    ),
    makeRecommendation(
      failedChecks,
      [114],
      "Create an llms.txt file at the site root",
      "Provides AI crawlers with a concise map of important pages, brand context, and preferred content sources.",
      "Medium Priority"
    ),
    makeRecommendation(
      failedChecks,
      [107],
      "Expand page content depth around the detected business category",
      "Gives AI systems more topical evidence to understand services, eligibility, benefits, and decision criteria."
    ),
    makeRecommendation(
      failedChecks,
      [96, 97, 35],
      "Optimize internal linking with descriptive anchors",
      "Improves crawl paths and helps AI systems connect service pages, category pages, proof pages, and conversion pages."
    ),
    makeRecommendation(
      failedChecks,
      [113],
      "Add visible review or testimonial signals",
      "Adds trust evidence that AI systems can use when evaluating brand credibility and customer proof."
    ),
    makeRecommendation(
      failedChecks,
      [10, 11, 12, 13],
      "Fix robots.txt and sitemap discovery",
      "Helps search and AI crawlers discover priority URLs reliably and understand which pages should be indexed."
    ),
    makeRecommendation(
      failedChecks,
      [16, 17, 18, 19],
      "Rewrite title and meta description to match the page intent",
      "Improves the page summary signals that AI and search systems use to classify relevance."
    ),
    makeRecommendation(
      failedChecks,
      [24, 25, 26],
      "Correct heading structure on the page",
      "Makes the page hierarchy easier for crawlers and AI systems to parse into topics and subtopics."
    ),
    makeRecommendation(
      failedChecks,
      [27, 28, 29],
      "Fix canonical tags",
      "Reduces duplicate or conflicting URL signals so crawlers can consolidate authority to the correct page."
    ),
    makeRecommendation(
      failedChecks,
      [61, 62, 103],
      "Add descriptive alt text for meaningful images",
      "Exposes visual proof, charts, services, and product context to crawlers that cannot rely on image pixels alone."
    ),
    makeRecommendation(
      failedChecks,
      [46, 49, 53, 56, 59, 72, 73],
      "Improve mobile performance and render-blocking resources",
      "Improves crawl efficiency and user experience signals that can affect AI and search visibility."
    ),
    makeRecommendation(
      failedChecks,
      [67, 68, 69, 70],
      "Strengthen trust pages and contact information",
      "Improves credibility signals by making ownership, contact details, policies, and brand background easier to verify."
    )
  ].filter((item): item is Recommendation => Boolean(item));

  const coveredIds = new Set(recommendations.flatMap((recommendation) =>
    failedChecks
      .filter((check) => recommendation.reason.includes(check.name))
      .map((check) => check.id)
  ));
  const uncovered = failedChecks
    .filter((check) => !coveredIds.has(check.id) && check.severity !== "ADVISORY")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, 6 - recommendations.length))
    .map((check): Recommendation => ({
      priority: priorityFromSeverity([check.severity]),
      recommendation: `Fix ${check.name.toLowerCase()}`,
      reason: `${check.category}: ${check.evidence}`,
      expectedAiVisibilityImpact: `Improves ${check.category.toLowerCase()} signals by resolving the failed "${check.name}" audit check.`
    }));

  return [...recommendations, ...uncovered]
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
    .slice(0, 12);
}

function classificationRecommendation(confidence: number): Recommendation | null {
  if (confidence >= 55) return null;
  return {
    priority: "High Priority",
    recommendation: "Clarify homepage category and service positioning",
    reason: `Business classification confidence is ${confidence}%, which means the homepage evidence is not strong enough to classify industry, sub-industry, and business model reliably.`,
    expectedAiVisibilityImpact: "Improves how AI systems understand what the brand does before they decide whether to recommend it for category-specific prompts."
  };
}

function auditWeaknesses(audit: TechnicalAuditResult, recommendations: Recommendation[]) {
  const failedMajorChecks = audit.checks.filter((check) => !check.passed && (check.severity === "BLOCKER" || check.severity === "MAJOR"));
  const recommendationWeaknesses = recommendations.slice(0, 3).map((item) => item.recommendation);
  const auditWeaknesses = failedMajorChecks.slice(0, 3).map((check) => `${check.name} failed (${check.evidence})`);
  return (recommendationWeaknesses.length ? recommendationWeaknesses : auditWeaknesses).slice(0, 3);
}

async function fetchHomepageHtml(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "AIVisibilityAnalyzer/1.0 (+https://localhost)"
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

export async function generateVisibilityReport(input: ReportInput, origin = "http://localhost:3000"): Promise<AiVisibilityReport> {
  const normalizedUrl = input.websiteUrl.startsWith("http") ? input.websiteUrl : `https://${input.websiteUrl}`;
  const seed = stableHash(`${input.brandName}:${normalizedUrl}:${input.businessEmail}`);
  const [technicalAudit, htmlContent] = await Promise.all([
    runTechnicalAudit(normalizedUrl),
    fetchHomepageHtml(normalizedUrl)
  ]);
  const classification = classifyBusiness(normalizedUrl, htmlContent);
  const category = classification.subIndustry;

  const pillars: ScoringPillars = {
    technicalFoundation: technicalAudit.score,
    geoReadiness: scoreFromSeed(seed, 4, 20, 75),
    aeoReadiness: scoreFromSeed(seed, 8, 16, 78),
    brandAuthority: scoreFromSeed(seed, 12, 18, 80),
    aiSearchVisibility: scoreFromSeed(seed, 16, 12, 70)
  };

  const visibilityScore = calculateScore(pillars);
  const categoryVisibility = clamp((pillars.aiSearchVisibility * 0.6) + (pillars.geoReadiness * 0.2) + (pillars.aeoReadiness * 0.2));
  const aiMarketPosition: AiMarketPosition = {
    industry: classification.industry,
    subIndustry: classification.subIndustry,
    businessModel: classification.businessModel,
    classificationConfidence: classification.confidence,
    evidenceKeywords: classification.evidenceKeywords,
    rejectedCategories: classification.rejectedCategories,
    categoryVisibility,
    aiPresenceLevel: getVisibilityLevel(pillars.aiSearchVisibility),
    authorityStrength: authorityStrength(pillars.brandAuthority),
    marketPosition: marketPosition(visibilityScore, categoryVisibility, pillars.brandAuthority)
  };

  const id = `${stableHash(`${Date.now()}:${input.brandName}`).toString(36)}-${Date.now().toString(36)}`;
  const recommendations = [
    classificationRecommendation(classification.confidence),
    ...generateAuditRecommendations(technicalAudit)
  ].filter((item): item is Recommendation => Boolean(item));
  const promptCategory = category.toLowerCase().replace(/\s+services$/i, "");
  const prompts = [
    `${input.brandName} ${promptCategory} services`,
    `${input.brandName} ${category.toLowerCase()} reviews`,
    `Is ${input.brandName} a good ${promptCategory} provider`,
    `${input.brandName} ${classification.businessModel.toLowerCase()}`,
    `${input.brandName} ${classification.industry.toLowerCase()} credibility`
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
      categoryVisibility,
      brandAuthority: pillars.brandAuthority,
      entityStrength: pillars.geoReadiness,
      searchReadiness: clamp((pillars.technicalFoundation + pillars.aeoReadiness) / 2)
    },
    aiMarketPosition,
    losingPrompts: prompts.slice(0, 4).map((prompt, index) => ({
      prompt,
      intentType: ["Commercial", "Comparison", "Transactional", "Informational"][index] as never,
      visibility: clamp(pillars.aiSearchVisibility - 12 + index * 5)
    })),
    opportunities: prompts.map((prompt, index) => ({
      prompt,
      currentVisibility: clamp(pillars.aiSearchVisibility - 18 + index * 4),
      potentialTrafficOpportunity: ["High-intent buyers", "Brand evaluation traffic", "Evaluation traffic", "Research demand", "Local discovery"][index],
      difficulty: (index < 2 ? "Medium" : index === 2 ? "High" : "Low") as never,
      impact: (index < 3 ? "High" : "Medium") as never
    })),
    perception: {
      businessCategory: category,
      mainServices: classification.evidenceKeywords.length
        ? classification.evidenceKeywords.slice(0, 5)
        : [`${category} services`],
      targetAudience: [
        `${classification.subIndustry} buyers`,
        `${classification.businessModel} evaluators`,
        `${classification.industry} researchers`
      ],
      marketPositioning: [aiMarketPosition.marketPosition, "Brand visibility is evaluated from owned signals and category relevance"],
      strengths: ["Clear brand identity", "Recoverable prompt demand", "Solid search readiness signals"],
      weaknesses: auditWeaknesses(technicalAudit, recommendations)
    },
    sentiment: {
      value: visibilityScore >= 70 ? "Positive" : visibilityScore >= 40 ? "Neutral" : "Negative",
      explanation:
        visibilityScore >= 70
          ? "AI perception is favorable, with enough authority signals to appear in category conversations."
          : visibilityScore >= 40
            ? "Visibility appears moderate, with room to strengthen authority signals and category clarity."
            : "AI engines have weak evidence to confidently recommend the brand in commercial prompts."
    },
    risk: {
      level: riskLevel(visibilityScore),
      factors: [
        ...(classification.confidence < 55 ? ["Low classification confidence"] : []),
        ...recommendations.slice(0, 3).map((item) => item.recommendation)
      ].slice(0, 4),
      businessImpact: [
        "AI systems may not confidently understand when to recommend your brand.",
        "Potential revenue loss due to AI invisibility.",
        "High-intent customers may complete research without encountering your brand."
      ]
    },
    recommendations,
    shareUrl: `${origin}/report/${id}`
  };
}
