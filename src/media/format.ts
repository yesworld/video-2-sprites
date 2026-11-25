export function formatTime(seconds: number, precision = 2) {
  const scale = 10 ** precision
  const ticks = Math.round(seconds * scale)
  const minutes = Math.floor(ticks / (60 * scale))
  const remaining = ((ticks % (60 * scale)) / scale).toFixed(precision)
  return `${String(minutes).padStart(2, '0')}:${remaining.padStart(precision ? precision + 3 : 2, '0')}`
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function frameNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
