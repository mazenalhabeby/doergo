/**
 * blog — the public blog's posts, read by the web's server render (lib/blog.ts).
 * Gateway: modules/blog/blog.controller.ts (`@Public`).
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const blogWebEndpoints = defineEndpoints('blog', {
  posts: endpoint<void, unknown>({ method: 'GET', path: () => '/blog/posts', public: true }),
  post: endpoint<{ slug: string }, unknown>({ method: 'GET', path: (a) => path`/blog/posts/${a.slug}`, public: true }),
});
