import { createFrameEncoder } from './canvas'
import VideoWorker from '../workers/video.worker?worker'
import {
  sampleTimes, type Decoder, type ExtractionOptions, type FramePacket,
  type VideoMetadata, type VideoSource, type WorkerRequest, type WorkerResponse,
} from './types'

type ExtractionCallbacks = {
  onBatch: (frames: FramePacket[]) => Promise<void>
  onDecoder: (decoder: Decoder) => void
  onRestart: () => Promise<void>
}

function workerJob<T>(
  request: WorkerRequest,
  signal: AbortSignal,
  onMessage: (message: WorkerResponse, worker: Worker, finish: (value: T) => void) => void | Promise<void>,
  timeout?: number,
) {
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted()
    const worker = new VideoWorker()
    const deadline = timeout ? setTimeout(() => fail(new Error('Video inspection timed out.')), timeout) : undefined
    const close = () => {
      clearTimeout(deadline)
      worker.terminate()
      signal.removeEventListener('abort', abort)
    }
    const fail = (error: unknown) => {
      close()
      reject(error)
    }
    const abort = () => fail(signal.reason)
    const finish = (value: T) => {
      close()
      resolve(value)
    }

    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = (event) => fail(new Error(event.message || 'The video worker could not start.'))
    worker.onmessage = async ({ data }: MessageEvent<WorkerResponse>) => {
      try {
        if (data.kind === 'error') throw new Error(data.message)
        await onMessage(data, worker, finish)
      } catch (error) {
        fail(error)
      }
    }
    try { worker.postMessage(request) } catch (error) { fail(error) }
  })
}

function mediaEvent(video: HTMLVideoElement, name: string, signal: AbortSignal, timeout = 15_000) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(name, ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', abort)
    }
    const ready = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('The browser could not decode this video.')) }
    const abort = () => { cleanup(); reject(signal.reason) }
    const timer = setTimeout(failed, timeout)
    video.addEventListener(name, ready, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', abort, { once: true })
  })
}

function createVideo() {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  return video
}

function releaseVideo(video: HTMLVideoElement) {
  video.removeAttribute('src')
  video.load()
}

async function nativeMetadata(url: string, signal: AbortSignal): Promise<VideoMetadata> {
  const video = createVideo()
  try {
    video.preload = 'metadata'
    const loaded = mediaEvent(video, 'loadedmetadata', signal)
    video.src = url
    await loaded
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error('The clip has no finite video track.')
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, fps: null }
  } finally {
    releaseVideo(video)
  }
}

export async function readSource(file: File, signal: AbortSignal, sample: boolean): Promise<VideoSource> {
  const url = URL.createObjectURL(file)
  try {
    const [native, demuxed] = await Promise.allSettled([
      nativeMetadata(url, signal),
      workerJob<VideoMetadata>({ kind: 'probe', file }, signal, (message, _worker, finish) => {
        if (message.kind === 'metadata') finish(message.metadata)
      }, 15_000),
    ])
    signal.throwIfAborted()
    const metadata = native.status === 'fulfilled' ? native.value : demuxed.status === 'fulfilled' ? demuxed.value : null
    if (!metadata || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      throw new Error('Could not open this video. Try an MP4, WebM or MOV with a video codec supported by your browser.')
    }

    return {
      ...metadata, file, url, sample, native: native.status === 'fulfilled',
      fps: demuxed.status === 'fulfilled' ? demuxed.value.fps : null,
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function extractNative(source: VideoSource, options: ExtractionOptions, signal: AbortSignal, callbacks: ExtractionCallbacks) {
  const video = createVideo()
  let encoder: ReturnType<typeof createFrameEncoder> | undefined
  let worker: Worker | undefined
  let rejectBitmap: ((error: unknown) => void) | undefined
  const abort = () => {
    worker?.terminate()
    rejectBitmap?.(signal.reason)
  }
  signal.addEventListener('abort', abort, { once: true })

  try {
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try { worker = new VideoWorker() } catch { /* Use the browser canvas when workers are blocked. */ }
    }
    const loaded = mediaEvent(video, 'loadeddata', signal)
    video.src = source.url
    await loaded

    let batch: FramePacket[] = []
    let batchBytes = 0
    for (const time of sampleTimes(options)) {
      signal.throwIfAborted()
      if (Math.abs(video.currentTime - time) > 1e-6) {
        const seeked = mediaEvent(video, 'seeked', signal)
        video.currentTime = time
        await seeked
      }

      let frame: FramePacket | undefined
      if (worker) {
        try {
          const bitmap = await createImageBitmap(video)
          const activeWorker = worker
          frame = await new Promise<FramePacket>((resolve, reject) => {
            if (signal.aborted) {
              bitmap.close()
              reject(signal.reason)
              return
            }
            rejectBitmap = reject
            activeWorker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
              if (data.kind === 'encoded') resolve(data.frame)
              if (data.kind === 'error') reject(new Error(data.message))
            }
            activeWorker.onerror = (event) => reject(new Error(event.message))
            try { activeWorker.postMessage({ kind: 'encode', time, bitmap } satisfies WorkerRequest, [bitmap]) }
            catch (error) { bitmap.close(); reject(error) }
          })
        } catch {
          signal.throwIfAborted()
          worker.terminate()
          worker = undefined
        } finally {
          rejectBitmap = undefined
        }
      }

      if (!frame) {
        encoder ??= createFrameEncoder(source.width, source.height)
        frame = await encoder(time, (context) => context.drawImage(video, 0, 0, source.width, source.height))
      }

      batch.push(frame)
      batchBytes += frame.image.size
      if (batch.length >= 8 || batchBytes >= 16 * 1024 ** 2) {
        await callbacks.onBatch(batch)
        batch = []
        batchBytes = 0
      }
    }

    if (batch.length) await callbacks.onBatch(batch)
  } finally {
    signal.removeEventListener('abort', abort)
    worker?.terminate()
    releaseVideo(video)
  }
}

export async function extractVideo(source: VideoSource, options: ExtractionOptions, signal: AbortSignal, callbacks: ExtractionCallbacks) {
  if (typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    callbacks.onDecoder('WebCodecs')
    let storageFailed = false
    try {
      await workerJob<void>({ kind: 'extract', file: source.file, options }, signal, async (message, worker, finish) => {
        if (message.kind === 'batch') {
          try {
            await callbacks.onBatch(message.frames)
          } catch (error) {
            storageFailed = true
            throw error
          }
          worker.postMessage({ kind: 'continue' } satisfies WorkerRequest)
        }
        if (message.kind === 'done') finish()
      })
      return
    } catch (error) {
      signal.throwIfAborted()
      if (!source.native || storageFailed) throw error
      await callbacks.onRestart()
    }
  }

  signal.throwIfAborted()
  if (!source.native) throw new Error('This browser has no decoder for this video.')
  callbacks.onDecoder('Browser video')
  await extractNative(source, options, signal, callbacks)
}
