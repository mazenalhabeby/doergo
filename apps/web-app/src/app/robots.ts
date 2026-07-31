import type { MetadataRoute } from "next";

const SITE = "https://hbcfield.com";

// Block the private app + API from all crawlers; allow the public marketing +
// legal pages. AI crawlers are allowed explicitly so HBCField can appear in
// AI answer engines (opt out here later if you ever want to).
const DISALLOW = ["/dashboard", "/api/", "/login", "/register", "/onboarding", "/welcome", "/operator", "/my/", "/account-deletion/success"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      // Explicitly allow the major AI/answer-engine crawlers.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "Applebot-Extended"], allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
