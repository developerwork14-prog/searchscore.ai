export type VisibilityLevel = "Critical" | "Poor" | "Below Average" | "Average" | "Strong" | "Excellent";
export type IntentType = "Commercial" | "Transactional" | "Informational" | "Comparison";
export type ImpactLevel = "High" | "Medium" | "Low";
export type Sentiment = "Positive" | "Neutral" | "Negative";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type GeoAeoGrade = "A" | "B" | "C" | "D" | "F";
export type GeoAeoSeverity = "BLOCKER" | "MAJOR" | "MINOR";
export type GeoAeoScope = "page" | "domain";

export interface ReportInput {
  brandName: string;
  websiteUrl: string;
  businessEmail: string;
}

export interface ScoringPillars {
  technicalFoundation: number;
  geoReadiness: number;
  aeoReadiness: number;
  brandAuthority: number;
  aiSearchVisibility: number;
}

export interface VisibilityBreakdown {
  aiDecisionCoverage: number;
  categoryVisibility: number;
  brandAuthority: number;
  entityStrength: number;
  searchReadiness: number;
}

export interface LosingPrompt {
  prompt: string;
  intentType: IntentType;
  visibility: number;
}

export interface PromptOpportunity {
  prompt: string;
  currentVisibility: number;
  potentialTrafficOpportunity: string;
  difficulty: ImpactLevel;
  impact: ImpactLevel;
}

export interface BrandPerception {
  businessCategory: string;
  mainServices: string[];
  targetAudience: string[];
  marketPositioning: string[];
  strengths: string[];
  weaknesses: string[];
}

export interface AiMarketPosition {
  industry: string;
  subIndustry: string;
  businessModel: string;
  classificationConfidence: number;
  categoryVisibility: number;
  aiPresenceLevel: VisibilityLevel;
  authorityStrength: "Low" | "Moderate" | "Strong" | "Excellent";
  marketPosition: string;
}

export type RecommendationPriority = "High Priority" | "Medium Priority" | "Low Priority";

export interface Recommendation {
  priority: RecommendationPriority;
  recommendation: string;
  reason: string;
  expectedAiVisibilityImpact: string;
}

export interface LeadGenerationMetric {
  label: "AI Decision Coverage" | "Brand Authority" | "Entity Strength" | "Search Readiness";
  score: number;
  opportunitiesIdentified: number;
  explanation: string;
  summary: string;
}

export interface VisibilityIssueSummary {
  highImpactOpportunities: number;
  mediumImpactOpportunities: number;
  lowImpactOpportunities: number;
  additionalFindingsDetected: number;
  teaserFindings: string[];
  summaryMessages: string[];
}

export type TechnicalCategoryStatus = "Passed" | "Minor Attention" | "Needs Attention";

export interface TechnicalCategorySummary {
  categoryName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  score: number;
  status: TechnicalCategoryStatus;
}

export interface GeoAeoCategorySummary {
  categoryName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  score: number;
  status: TechnicalCategoryStatus;
}

export interface GeoAeoCheckResult {
  id: number;
  category: string;
  name: string;
  severity: GeoAeoSeverity;
  scope: GeoAeoScope;
  passed: boolean;
  evidence: string;
}

export interface GeoAeoOpportunityCounts {
  high: number;
  medium: number;
  low: number;
}

export interface GeoAeoAuditResult {
  score: number;
  rawScore: number;
  pageScore: number;
  domainScore: number;
  grade: GeoAeoGrade;
  gradeDescription: string;
  blockerFailed: boolean;
  opportunityCounts: GeoAeoOpportunityCounts;
  checkedAt: string;
  categories: GeoAeoCategorySummary[];
  checks: GeoAeoCheckResult[];
}

export interface PublicGeoAeoAudit {
  score: number;
  grade: GeoAeoGrade;
  grade_description: string;
  page_score: number;
  domain_score: number;
  blocker_cap_applied: boolean;
  opportunity_counts: GeoAeoOpportunityCounts;
  categories: GeoAeoCategorySummary[];
}

export interface PublicTechnicalAudit {
  score: number;
  grade: GeoAeoGrade;
  issues_found: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: string[];
  businessImpact: string[];
}

export interface AiVisibilityReport {
  id: string;
  createdAt: string;
  brandName: string;
  websiteUrl: string;
  businessEmail: string;
  visibilityScore: number;
  visibilityLevel: VisibilityLevel;
  pillars: ScoringPillars;
  breakdown: VisibilityBreakdown;
  leadMetrics: LeadGenerationMetric[];
  visibilityIssueSummary: VisibilityIssueSummary;
  technicalCategorySummaries: TechnicalCategorySummary[];
  geoAeoAudit: GeoAeoAuditResult;
  visibilityOpportunities: string[];
  aiMarketPosition?: AiMarketPosition;
  losingPrompts: LosingPrompt[];
  opportunities: PromptOpportunity[];
  perception: BrandPerception;
  sentiment: {
    value: Sentiment;
    explanation: string;
  };
  risk: RiskAssessment;
  recommendations: Recommendation[];
  internalRecommendations?: Recommendation[];
  shareUrl: string;
}

export interface PlaygroundResult {
  prompt: string;
  answer: string;
  mentionStatus: "Mentioned" | "Not Mentioned" | "Partially Mentioned";
  confidenceScore: number;
}

export type StructuredRatingLabel = "Poor" | "Below Average" | "Average" | "Good" | "Excellent";
export type StructuredMetricCategory = "AI Visibility" | "Technical Audit" | "GEO / AEO Audit";
export type StructuredImpact = "high" | "medium" | "low";

export interface StructuredMetric {
  score: number;
  opportunities: number;
  description: string;
  detail: string;
  conflict_note?: string;
}

export interface StructuredOpportunity {
  title: string;
  category: StructuredMetricCategory;
  impact: StructuredImpact;
}

export interface StructuredAiVisibilityReport {
  brand: string;
  url: string;
  overall_score: number;
  rating_label: StructuredRatingLabel;
  rating_description: string;
  score_explanation: string;
  opportunities: StructuredOpportunity[];
  opportunity_counts: {
    high: number;
    medium: number;
    low: number;
  };
  technical_categories: TechnicalCategorySummary[];
  technical_audit: PublicTechnicalAudit;
  geo_aeo_audit: PublicGeoAeoAudit;
  playground_questions: string[];
}

export interface CreatedPublicReport extends StructuredAiVisibilityReport {
  id: string;
}
