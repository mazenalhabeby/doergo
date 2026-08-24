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
  /** Optional cover image path under /public, e.g. /images/blog/my-post/cover.jpg */
  cover?: string;
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
    cover: meta.cover || undefined,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    content: body.trim(),
  };
}

/** File posts, newest first. Returns [] when the content directory is absent. */
export function getFilePosts(): BlogPost[] {
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

// ── API-backed posts (written via the platform blog API / MCP) ────────────────
// The DB is the dynamic source: new posts published through the API appear on
// the site within the revalidation window, no deploy needed. File posts remain
// as a second source; on a slug collision the DB wins.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://hbcfield.com/api/v1";

/** API-relative asset URLs (e.g. /api/v1/blog/images/x) → absolute against the API host. */
export function resolveBlogAssetUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("/api/v1/")) return `${API_URL}${u.slice("/api/v1".length)}`;
  return u;
}

interface ApiPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  coverUrl?: string | null;
  publishedAt: string;
  content: string;
}

function fromApi(p: ApiPost): BlogPost {
  const words = p.content.split(/\s+/).filter(Boolean).length;
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: (p.publishedAt ?? "").slice(0, 10) || "1970-01-01",
    author: p.author || "HBCField Team",
    tags: p.tags ?? [],
    cover: resolveBlogAssetUrl(p.coverUrl) ,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    content: p.content.trim(),
  };
}

async function fetchApiPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${API_URL}/blog/posts`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const body = await res.json();
    const list: ApiPost[] = body?.data ?? [];
    return list.map(fromApi);
  } catch {
    return [];
  }
}

/** All posts (DB + files, DB wins on slug), newest first. */
export async function getAllPosts(): Promise<BlogPost[]> {
  const api = await fetchApiPosts();
  const seen = new Set(api.map((p) => p.slug));
  return [...api, ...getFilePosts().filter((p) => !seen.has(p.slug))].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  // Slug comes from the URL — refuse anything that could traverse paths.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/blog/posts/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const body = await res.json();
      if (body?.data) return fromApi(body.data);
    }
  } catch {
    /* fall through to file */
  }
  try {
    return toPost(slug, fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // Marketing/blog content is authored in English only and this runs in a server
  // context with no initialised client i18n instance, so the date stays en-US.
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
