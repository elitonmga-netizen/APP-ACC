export async function preparePhoto(file: File, maxBytes = 614400): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('Escolha uma imagem de até 25 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a foto neste navegador.')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.82, 0.65, 0.45, 0.25]) {
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= Math.ceil(maxBytes / 3) * 4 + 23) return data
    }
    throw new Error('A foto continua muito grande. Escolha uma imagem menor.')
  } finally { bitmap.close() }
}
