import { taskAttachmentsApi, uploadToS3 } from "@/lib/api"

/**
 * Put one file on a job as an attachment and return its id — the same three
 * steps the Attachments section takes (presign → upload → confirm).
 *
 * Step-form photos and signatures go through here FIRST: an answer names an
 * attachment of the job, and the server refuses one that is not.
 */
export async function uploadTaskFile(taskId: string, file: File): Promise<string> {
  const presigned = await taskAttachmentsApi.getPresignedUrl(taskId, file.name, file.type)
  if (!presigned) throw new Error("Upload URL was not issued")
  await uploadToS3(presigned.uploadUrl, file)
  const confirmed = await taskAttachmentsApi.confirmUpload(taskId, {
    fileName: file.name,
    fileKey: presigned.fileKey,
    fileUrl: presigned.fileUrl,
    fileType: file.type,
    fileSize: file.size,
  })
  if (!confirmed?.id) throw new Error("Upload was not confirmed")
  return confirmed.id
}

/** A `data:image/png;base64,…` URL (what the signature pad draws) as a File to upload. */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [head, body = ""] = dataUrl.split(",")
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/png"
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}
