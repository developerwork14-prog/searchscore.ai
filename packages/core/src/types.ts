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
  competitiveLandscape: number;
  brandAuthority: number;
  entityStrength: number;
  searchReadiness: number;
}

export interface CompetitorVisibility {
  name: string;
  visibility: number;
  isYou?: boolean;
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

export interface RecommendationGroup {
  priority: "High Priority" | "Medium Priority" | "Low Priority";
  items: string[];
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
  competitors: CompetitorVisibility[];
  losingPrompts: LosingPrompt[];
  opportunities: PromptOpportunity[];
  perception: BrandPerception;
  sentiment: {
    value: Sentiment;
    explanation: string;
  };
  risk: RiskAssessment;
  recommendations: RecommendationGroup[];
  shareUrl: string;
}

export interface PlaygroundResult {
  prompt: string;
  answer: string;
  mentionStatus: "Mentioned" | "Not Mentioned" | "Partially Mentioned";
  confidenceScore: number;
}
