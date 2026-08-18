import fs from "node:fs";
import path from "node:path";

/**
 * File-based blog: posts live in `content/blog/<slug>.md` with a minimal
 * frontmatter block. Everything is read at build time (pages are statically
 * generated), so no runtime CMS or database is involved — publishing a post
 * is committing a markdown file and redeploying.
 *
 * Frontmatter format (all values plain strings, no quoting needed):
 *   ---
 *   title: Post title
 *   description: One-sentence summary used for meta description + list page.
 *   date: 2026-08-18
 *   author: HBCField Team
 *   tags: field service, gps
 *   ---
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  author: string;
  tags: string[];
  readingMinutes: number;
  /** Markdown body (frontmatter stripped) */
  content: string;
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function toPost(slug: string, raw: string): BlogPost {
  const { meta, body } = parseFrontmatter(raw);
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? "",
    date: meta.date ?? "1970-01-01",
    author: meta.author ?? "HBCField Team",
    tags: (meta.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    readingMinutes: Math.max(1, Math.round(words / 220)),
    content: body.trim(),
  };
}

/** All posts, newest first. Returns [] when the content directory is absent. */
export function getAllPosts(): BlogPost[] {
  let files: string[];
  try {
    files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .map((f) => toPost(f.replace(/\.md$/, ""), fs.readFileSync(path.join(BLOG_DIR, f), "utf8")))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): BlogPost | null {
  // Slug comes from the URL — refuse anything that could traverse paths.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return toPost(slug, fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
