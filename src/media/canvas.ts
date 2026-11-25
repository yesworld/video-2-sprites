import type { FramePacket } from './types'

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function createCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    if (canvas.getContext('2d')) return canvas
  }
  if (typeof document === 'undefined') throw new Error('Offscreen Canvas 2D is unavailable.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getContext(canvas: Canvas): Context {
  const context = canvas.getContext('2d')
  if (!context || !('drawImage' in context)) throw new Error('Canvas 2D is unavailable in this browser.')
  return context
}

function toBlob(canvas: Canvas) {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode this frame.')), 'image/png')
  })
}

export function createFrameEncoder(width: number, height: number) {
  const original = createCanvas(width, height)
  const context = getContext(original)
  const ratio = Math.min(1, 176 / Math.max(width, height))
  const thumbnail = ratio < 1
    ? createCanvas(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)))
    : null
  const thumbnailContext = thumbnail ? getContext(thumbnail) : null

  return async (time: number, draw: (context: Context) => void): Promise<FramePacket> => {
    context.clearRect(0, 0, width, height)
    draw(context)
    if (!thumbnail || !thumbnailContext) return { time, image: await toBlob(original) }

    thumbnailContext.clearRect(0, 0, thumbnail.width, thumbnail.height)
    thumbnailContext.imageSmoothingEnabled = false
    thumbnailContext.drawImage(original, 0, 0, thumbnail.width, thumbnail.height)
    const [image, preview] = await Promise.all([toBlob(original), toBlob(thumbnail)])
    return { time, image, thumbnail: preview }
  }
}
