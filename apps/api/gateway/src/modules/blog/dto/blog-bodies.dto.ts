import { OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Blog bodies (operator, CODE_AUDIT.md B3) — the fields of the blogCreate / blogImageSave
  contracts. The post UPDATE stays loose on purpose: its contract is an open record.
*/

/** POST /platform/blog/posts */
export class CreateBlogPostDto {
  @OptString() title?: string;
  @OptString() description?: string;
  @OptString() content?: string;
  @OptString() slug?: string;
  @OptString() coverUrl?: string;
  @OptString() author?: string;
  @OptStrings() tags?: string[];
  @OptString() status?: string;
  @OptString() publishedAt?: string;
}

/** POST /platform/blog/images — a base64 image; the mime is checked by blogImageMime. */
export class BlogImageDto {
  @OptString() dataBase64?: string;
  @OptString() mime?: string;
  @OptString() fileName?: string;
}
