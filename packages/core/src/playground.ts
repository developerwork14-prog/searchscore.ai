import { PlaygroundResult } from "./types.js";

export function runPromptPlayground(brandName: string, prompt: string, baseVisibility = 40): PlaygroundResult {
  const promptLower = prompt.toLowerCase();
  const brandLower = brandName.toLowerCase();
  const isDirectBrandPrompt = promptLower.includes(brandLower);
  const isComparison = promptLower.includes("alternative") || promptLower.includes("top") || promptLower.includes("best");
  const confidenceScore = Math.max(18, Math.min(92, baseVisibility + (isDirectBrandPrompt ? 24 : 0) + (isComparison ? -8 : 4)));
  const mentionStatus = isDirectBrandPrompt ? "Mentioned" : confidenceScore > 58 ? "Partially Mentioned" : "Not Mentioned";

  const answer =
    mentionStatus === "Mentioned"
      ? `${brandName} is relevant to this query and would likely be included with context about its category fit, customer use cases, and alternatives buyers should compare.`
      : mentionStatus === "Partially Mentioned"
        ? `${brandName} may appear as a secondary option, but category leaders with stronger authority signals are more likely to be recommended first.`
        : `AI engines are more likely to recommend better-established competitors for this prompt unless ${brandName} strengthens entity signals and answer-ready content.`;

  return {
    prompt,
    answer,
    mentionStatus,
    confidenceScore
  };
}
