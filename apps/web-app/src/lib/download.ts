/**
 * Save a Blob the browser built (a CSV, a generated file) under `filename`.
 *
 * The anchor is attached while it is clicked — Firefox ignores a click on a
 * detached one — and the object URL is released on the next tick rather than
 * at once: revoking it synchronously after `click()` can cancel the download
 * before the browser has read the blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  a.style.display = "none"
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
