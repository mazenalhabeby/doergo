#!/usr/bin/env node
/**
 * HBCField blog MCP server.
 *
 * Lets an AI (Claude Desktop, Claude Code, …) author posts on hbcfield.com/blog:
 * upload an image first, then create the post referencing the returned URL.
 *
 * Env:
 *   HBCFIELD_PLATFORM_KEY  (required) — the platform admin key (x-platform-admin-key)
 *   HBCFIELD_API_URL       (optional) — defaults to https://hbcfield.com/api/v1
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.HBCFIELD_API_URL || "https://hbcfield.com/api/v1").replace(/\/$/, "");
const KEY = process.env.HBCFIELD_PLATFORM_KEY || "";

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-platform-admin-key": KEY,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json?.message ?? text.slice(0, 300)}`);
  return json;
}

const out = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const err = (e) => ({ isError: true, content: [{ type: "text", text: String(e?.message ?? e) }] });

const MIME_BY_EXT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

const server = new McpServer({ name: "hbcfield-blog", version: "1.0.0" });

/** Resolve a post reference (id or slug) to its id using the admin list. */
async function resolveId(ref) {
  if (!ref) throw new Error("Provide id or slug");
  const posts = (await api("GET", "/platform/blog/posts")).data ?? [];
  const hit = posts.find((p) => p.id === ref || p.slug === ref);
  if (!hit) throw new Error(`No post found with id or slug "${ref}"`);
  return hit.id;
}

server.tool(
  "list_blog_posts",
  "List all blog posts on hbcfield.com (including drafts) with id, slug, title, status and dates.",
  {},
  async () => {
    try { return out((await api("GET", "/platform/blog/posts")).data); } catch (e) { return err(e); }
  },
);

server.tool(
  "get_blog_post",
  "Fetch one published blog post by slug (full markdown content).",
  { slug: z.string().describe("Post slug, e.g. what-is-field-service-management-software") },
  async ({ slug }) => {
    try { return out((await api("GET", `/blog/posts/${encodeURIComponent(slug)}`)).data); } catch (e) { return err(e); }
  },
);

server.tool(
  "upload_blog_image",
  "Upload an image for a blog post FIRST, then use the returned `url` as the post's coverUrl or inside the markdown body as ![alt](url). Provide either filePath (local file) or dataBase64.",
  {
    filePath: z.string().optional().describe("Absolute path to a local image file (jpg/png/webp/gif/svg)"),
    dataBase64: z.string().optional().describe("Raw base64 image data (alternative to filePath)"),
    mime: z.string().optional().describe("Mime type; inferred from filePath extension when omitted"),
    fileName: z.string().optional(),
  },
  async ({ filePath, dataBase64, mime, fileName }) => {
    try {
      let b64 = dataBase64;
      let m = mime;
      if (filePath) {
        b64 = (await readFile(filePath)).toString("base64");
        m = m || MIME_BY_EXT[extname(filePath).toLowerCase()];
        fileName = fileName || filePath.split("/").pop();
      }
      if (!b64) throw new Error("Provide filePath or dataBase64");
      if (!m) throw new Error("Could not infer mime type — pass `mime` explicitly");
      const r = await api("POST", "/platform/blog/images", { dataBase64: b64, mime: m, fileName });
      return out(r.data); // { id, url }
    } catch (e) { return err(e); }
  },
);

server.tool(
  "create_blog_post",
  "Create a blog post on hbcfield.com/blog. Content is Markdown (## headings, lists, ![alt](imageUrl)). Upload images first with upload_blog_image and reference the returned url. Publishes immediately unless status=DRAFT; the live site picks it up within ~5 minutes.",
  {
    title: z.string(),
    description: z.string().describe("One-sentence summary for meta description and the list page"),
    content: z.string().describe("Markdown body (no H1 — the title is rendered as the H1)"),
    slug: z.string().optional().describe("URL slug; derived from title when omitted"),
    coverUrl: z.string().optional().describe("Cover image URL from upload_blog_image (shown as hero + og:image)"),
    tags: z.array(z.string()).optional(),
    author: z.string().optional().describe("Defaults to 'HBCField Team'"),
    status: z.enum(["PUBLISHED", "DRAFT"]).optional(),
  },
  async (args) => {
    try {
      const r = await api("POST", "/platform/blog/posts", args);
      return out({ ...r.data, liveUrl: `https://hbcfield.com/blog/${r.data.slug}` });
    } catch (e) { return err(e); }
  },
);

const patchShape = {
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  newSlug: z.string().optional().describe("Change the post's URL slug"),
  coverUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  author: z.string().optional(),
  status: z.enum(["PUBLISHED", "DRAFT"]).optional(),
};

async function applyUpdate(ref, patch) {
  const id = await resolveId(ref);
  const body = { ...patch };
  if (body.newSlug !== undefined) { body.slug = body.newSlug; delete body.newSlug; }
  return (await api("PATCH", `/platform/blog/posts/${encodeURIComponent(id)}`, body)).data;
}

server.tool(
  "update_blog_post",
  "Update an existing blog post (any subset of fields; status PUBLISHED/DRAFT toggles visibility). Reference the post by id or slug.",
  { post: z.string().describe("Post id or slug"), ...patchShape },
  async ({ post, ...patch }) => {
    try { return out(await applyUpdate(post, patch)); } catch (e) { return err(e); }
  },
);

server.tool(
  "update_blog_posts",
  "Bulk-update several blog posts in one call. Each edit references a post by id or slug plus the fields to change. Returns a per-post result; one failure doesn't stop the rest.",
  {
    edits: z.array(z.object({ post: z.string().describe("Post id or slug"), ...patchShape })).min(1),
  },
  async ({ edits }) => {
    const results = [];
    for (const { post, ...patch } of edits) {
      try {
        const r = await applyUpdate(post, patch);
        results.push({ post, ok: true, slug: r.slug, status: r.status });
      } catch (e) {
        results.push({ post, ok: false, error: String(e?.message ?? e) });
      }
    }
    return out(results);
  },
);

server.tool(
  "delete_blog_post",
  "Permanently delete one blog post. Reference it by id or slug.",
  { post: z.string().describe("Post id or slug") },
  async ({ post }) => {
    try {
      const id = await resolveId(post);
      return out((await api("DELETE", `/platform/blog/posts/${encodeURIComponent(id)}`)).data);
    } catch (e) { return err(e); }
  },
);

server.tool(
  "delete_blog_posts",
  "Permanently delete several blog posts in one call (ids or slugs). Returns a per-post result; one failure doesn't stop the rest.",
  { posts: z.array(z.string()).min(1).describe("Post ids or slugs") },
  async ({ posts }) => {
    const results = [];
    for (const ref of posts) {
      try {
        const id = await resolveId(ref);
        const r = (await api("DELETE", `/platform/blog/posts/${encodeURIComponent(id)}`)).data;
        results.push({ post: ref, ok: true, deletedSlug: r.slug });
      } catch (e) {
        results.push({ post: ref, ok: false, error: String(e?.message ?? e) });
      }
    }
    return out(results);
  },
);

if (!KEY) {
  console.error("HBCFIELD_PLATFORM_KEY is not set — all calls will be rejected.");
}
await server.connect(new StdioServerTransport());
