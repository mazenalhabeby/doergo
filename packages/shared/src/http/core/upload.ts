/**
 * PUT a file straight to a presigned storage URL, reporting progress.
 *
 * The one place an app talks to storage instead of our API (http/README.md:
 * "never `fetch` outside the client except presigned S3 URLs"). XHR, not fetch,
 * because fetch has no upload progress. The web and the phone each had a copy of
 * this; only the BODY differs — a browser `File`, or React Native's
 * `{ uri, type, name }` descriptor — so the caller passes the body.
 *
 * No DOM types in this package: the slice of XMLHttpRequest used here is
 * described below and taken from `globalThis`, where browsers and React Native
 * both provide it.
 */
interface XhrLike {
  upload: { addEventListener(type: 'progress', cb: (e: { lengthComputable: boolean; loaded: number; total: number }) => void): void };
  status: number;
  addEventListener(type: 'load' | 'error' | 'abort', cb: () => void): void;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: unknown): void;
}

export function putToPresignedUrl(
  url: string,
  body: unknown,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const Xhr = (globalThis as unknown as { XMLHttpRequest: new () => XhrLike }).XMLHttpRequest;
    const xhr = new Xhr();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(body);
  });
}
