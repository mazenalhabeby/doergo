/** Message contracts for auth-service `blog` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const blogListPublished = rpc<Record<string, never>>('blog_list_published');
export const blogGetBySlug = rpc<{ slug?: string }>('blog_get_by_slug');
export const blogImageGet = rpc<{ id?: string }>('blog_image_get');
export const blogListAll = rpc<Record<string, never>>('blog_list_all');
export const blogCreate = rpc<{
  title?: string;
  description?: string;
  content?: string;
  slug?: string;
  coverUrl?: string;
  author?: string;
  tags?: string[];
  status?: string;
  publishedAt?: string;
}>('blog_create');
export const blogUpdate = rpc<{ id?: string } & Record<string, unknown>>('blog_update');
export const blogDelete = rpc<{ id?: string }>('blog_delete');
export const blogImageSave = rpc<{ dataBase64?: string; mime?: string; fileName?: string }>('blog_image_save');
