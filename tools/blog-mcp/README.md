# HBCField Blog MCP

MCP server that lets Claude (Desktop or Code) author posts on **hbcfield.com/blog**:
list/create/update/delete posts and upload images (stored server-side, served at
`https://hbcfield.com/api/v1/blog/images/<id>`).

## Setup

```bash
cd tools/blog-mcp
npm install
```

Claude Desktop → Settings → Developer → Edit Config, add:

```json
{
  "mcpServers": {
    "hbcfield-blog": {
      "command": "node",
      "args": ["/Users/pc/work/doergo/tools/blog-mcp/index.mjs"],
      "env": {
        "HBCFIELD_PLATFORM_KEY": "<PLATFORM_ADMIN_KEY from the server .env.production>"
      }
    }
  }
}
```

## Authoring flow (what the AI does)

1. `upload_blog_image` (filePath or base64) → returns `{ id, url }`.
2. `create_blog_post` with markdown `content`, optional `coverUrl` = that url,
   and `![alt](url)` images anywhere in the body.
3. The post is live at `hbcfield.com/blog/<slug>` within ~5 minutes (ISR window).

Auth = the platform admin key (`x-platform-admin-key`), same credential as the
operator console break-glass endpoints. Keep it out of git.
