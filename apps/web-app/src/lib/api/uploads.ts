import { putToPresignedUrl } from '@hbcfield/shared/client';

// Upload file to S3 presigned URL (browser). The PUT itself is shared with the
// phone; only the body differs, and here it is the browser `File`.
export function uploadToS3(
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return putToPresignedUrl(url, file, file.type, onProgress);
}
