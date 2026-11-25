export interface VideoMetadata {
  width: number
  height: number
  duration: number
  fps: number | null
}

export interface VideoSource extends VideoMetadata {
  file: File
  url: string
  native: boolean
  sample: boolean
}

export interface ExtractionOptions {
  start: number
  end: number
  fps: number
}

export interface FramePacket {
  time: number
  image: Blob
  thumbnail?: Blob
}

export interface Frame {
  id: string
  asset: number
  time: number
  thumbnail: string
  small: boolean
  enabled: boolean
}

export type Decoder = 'WebCodecs' | 'Browser video'
export type Direction = 'forward' | 'reverse' | 'ping-pong'

export type WorkerRequest =
  | { kind: 'probe'; file: File }
  | { kind: 'extract'; file: File; options: ExtractionOptions }
  | { kind: 'encode'; bitmap: ImageBitmap; time: number }
  | { kind: 'continue' }

export type WorkerResponse =
  | { kind: 'metadata'; metadata: VideoMetadata }
  | { kind: 'batch'; frames: FramePacket[] }
  | { kind: 'encoded'; frame: FramePacket }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

export function frameCount({ start, end, fps }: ExtractionOptions) {
  return Math.max(0, Math.ceil((end - start) * fps - 1e-8))
}

export function* sampleTimes(options: ExtractionOptions) {
  const count = frameCount(options)
  for (let i = 0; i < count; i++) yield options.start + i / options.fps
}
