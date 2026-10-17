import { CHAT_MAX_ATTACHMENTS, UPLOAD_RULES, uploadTypeAllowed, type ChatAttachment } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { uploadToS3 } from "@/lib/api/uploads"

/** Photos wider than this are shrunk in the browser before upload (a 12 MP phone photo is ~5 MB; this is ~300 KB). */
const MAX_SIDE = 1600
const SHRINKABLE = ["image/jpeg", "image/png", "image/webp"]

/** Is this file one chat takes? The same rule the server checks (shared UPLOAD_RULES.chat). */
export function chatFileAllowed(file: File): boolean {
  return uploadTypeAllowed(UPLOAD_RULES.chat, file.type) && file.size > 0 && file.size <= UPLOAD_RULES.chat.maxBytes
}

export { CHAT_MAX_ATTACHMENTS }

/** A photo made smaller (JPEG, longest side 1600) with its size; anything else as it is. */
async function prepare(file: File): Promise<{ file: File; width: number | null; height: number | null }> {
  if (!SHRINKABLE.includes(file.type) || typeof createImageBitmap !== "function")
    return { file, width: null, height: null }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  if (scale === 1 && file.size < 1_000_000) {
    bitmap.close()
    return { file, width, height }
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
  if (!blob) return { file, width, height }
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
  return { file: new File([blob], name, { type: "image/jpeg" }), width, height }
}

/**
 * One file into a conversation: shrink (photos), ask for an upload link, PUT it
 * straight to storage. The send then names the key — the server checks it is
 * this conversation's and really there.
 */
export async function uploadChatFile(
  conversationId: string,
  original: File,
  onProgress?: (p: number) => void,
): Promise<ChatAttachment> {
  const { file, width, height } = await prepare(original)
  const { uploadUrl, fileKey } = await chatApi.presign(conversationId, file.name, file.type)
  await uploadToS3(uploadUrl, file, onProgress)
  return { fileKey, fileName: file.name, mimeType: file.type, fileSize: file.size, width, height }
}
