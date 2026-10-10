

/** Downscale an image file to a PNG data URL (max edge = `max`px). Data URLs
 *  avoid CORS when the PDF renderer draws the logo onto a canvas. */
export function resizeImageToDataUrl(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("read failed"))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error("decode failed"))
      img.onload = () => {
        let { width, height } = img
        if (width >= height && width > max) { height = Math.round((height * max) / width); width = max }
        else if (height > max) { width = Math.round((width * max) / height); height = max }
        const canvas = document.createElement("canvas")
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("no canvas"))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL("image/png"))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
