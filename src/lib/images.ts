async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function toJpeg(source: ImageBitmap | HTMLImageElement, maxSize: number, quality: number): Promise<Blob> {
  const w = source.width
  const h = source.height
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality),
  )
}

/** Réduit une photo iPhone (~3-5 Mo) à ~200 Ko + une miniature pour les listes. */
export async function compressPhoto(file: Blob): Promise<{ blob: Blob; thumb: Blob }> {
  const img = await loadImage(file)
  const [blob, thumb] = await Promise.all([toJpeg(img, 1280, 0.82), toJpeg(img, 320, 0.75)])
  if ('close' in img) img.close()
  return { blob, thumb }
}
