export type VisibilityLevel = "Critical" | "Poor" | "Below Average" | "Average" | "Strong" | "Excellent";
export type IntentType = "Commercial" | "Transactional" | "Informational" | "Comparison";
export type ImpactLevel = "High" | "Medium" | "Low";
export type Sentiment = "Positive" | "Neutral" | "Negative";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

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
  evidenceKeywords: string[];
  rejectedCategories: Array<{
    category: string;
    reason: string;
  }>;
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
  aiMarketPosition: AiMarketPosition;
  losingPrompts: LosingPrompt[];
  opportunities: PromptOpportunity[];
  perception: BrandPerception;
  sentiment: {
    value: Sentiment;
    explanation: string;
  };
  risk: RiskAssessment;
  recommendations: Recommendation[];
  shareUrl: string;
}

export interface PlaygroundResult {
  prompt: string;
  answer: string;
  mentionStatus: "Mentioned" | "Not Mentioned" | "Partially Mentioned";
  confidenceScore: number;
}
