export const CHATGPT_CITATION_CATEGORIES = [
  "Crawlability",
  "Technical Access",
  "Content Structure",
  "Content Quality"
] as const;

export const CHATGPT_CITATION_CATEGORY_SET = new Set<string>(CHATGPT_CITATION_CATEGORIES);

export const CHATGPT_CITATION_RECOMMENDATIONS: Record<number, string> = {
  38: "Allow OAI-SearchBot in robots.txt so ChatGPT search can crawl public pages.",
  39: "Allow ChatGPT-User in robots.txt for user-triggered browsing and citations.",
  40: "Separate GPTBot training rules from OAI-SearchBot and ChatGPT-User access rules.",
  41: "Allow OAI user agents through WAF, bot protection, and challenge pages.",
  42: "Make citable page content visible without login, interstitials, or paywalls.",
  49: "Create alternatives pages for high-intent comparison queries.",
  50: "Create use-case or industry pages that map the offer to specific buyer situations.",
  52: "Complete Product schema with name plus offers, reviews, or aggregate ratings where applicable.",
  54: "Show reviews from diverse sources or multiple trust platforms.",
  55: "Link merchant trust pages such as privacy, terms, refund, warranty, shipping, contact, and secure payment.",
  65: "Remove nosnippet, max-snippet:0, X-Robots-Tag restrictions, and data-nosnippet from citable content.",
  66: "Ensure OAI-SearchBot receives raw HTML content comparable to normal page content."
};

export function isChatgptCitationCategory(categoryName: string) {
  return CHATGPT_CITATION_CATEGORY_SET.has(categoryName);
}
