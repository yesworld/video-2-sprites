import { BlobSource, Input, MP4, QTFF, VideoSampleSink, WEBM } from 'mediabunny'
import { createFrameEncoder } from '../media/canvas'
import { sampleTimes, type FramePacket, type WorkerRequest, type WorkerResponse } from '../media/types'

const worker = self as unknown as DedicatedWorkerGlobalScope
const send = (message: WorkerResponse) => worker.postMessage(message)
let continueBatch: (() => void) | undefined
let bitmapEncoder: ReturnType<typeof createFrameEncoder> | undefined

async function processMessage(message: Exclude<WorkerRequest, { kind: 'continue' }>) {
  if (message.kind === 'encode') {
    const { bitmap, time } = message
    try {
      bitmapEncoder ??= createFrameEncoder(bitmap.width, bitmap.height)
      const frame = await bitmapEncoder(time, (context) => context.drawImage(bitmap, 0, 0))
      send({ kind: 'encoded', frame })
    } finally {
      bitmap.close()
    }
    return
  }

  const input = new Input({ source: new BlobSource(message.file), formats: [MP4, QTFF, WEBM] })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('There is no video track in this file.')
    const [width, height] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()])

    if (message.kind === 'probe') {
      const rate = track.computeFrameRateMetrics().catch(() => null)
      const duration = await track.getDurationFromMetadata() ?? await track.computeDuration()
      send({ kind: 'metadata', metadata: { width, height, duration, fps: (await rate)?.underlyingFrameRate ?? null } })
      return
    }

    if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined' || !await track.canDecode()) {
      throw new Error('WebCodecs cannot decode this clip.')
    }

    const encoder = createFrameEncoder(width, height)
    const sink = new VideoSampleSink(track)
    const firstTime = (await track.getFirstTimestamp()) ?? 0
    const { options } = message
    const times = sampleTimes(options)

    function* trackTimes() {
      for (const time of sampleTimes(options)) yield Math.max(time, firstTime)
    }

    let batch: FramePacket[] = []
    let batchBytes = 0
    async function sendBatch() {
      const acknowledged = new Promise<void>((resolve) => { continueBatch = resolve })
      send({ kind: 'batch', frames: batch })
      batch = []
      batchBytes = 0
      await acknowledged
    }

    for await (const sample of sink.samplesAtTimestamps(trackTimes())) {
      const { value: time } = times.next()
      if (!sample) throw new Error('A requested frame could not be decoded.')
      try {
        const frame = await encoder(time!, (context) => sample.draw(context, 0, 0, width, height))
        batch.push(frame)
        batchBytes += frame.image.size
      } finally {
        sample.close()
      }
      if (batch.length >= 8 || batchBytes >= 16 * 1024 ** 2) await sendBatch()
    }

    if (batch.length) await sendBatch()
    send({ kind: 'done' })
  } finally {
    input.dispose()
  }
}

worker.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.kind === 'continue') {
    continueBatch?.()
    continueBatch = undefined
    return
  }
  void processMessage(data).catch((error: unknown) => {
    send({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}
