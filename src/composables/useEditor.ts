import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { clamp, formatFileSize } from '../media/format'
import { FrameAssets } from '../media/frame-assets'
import { frameCount, type Decoder, type ExtractionOptions, type Frame, type VideoSource } from '../media/types'
import { extractVideo, readSource } from '../media/video'

const sampleName = 'cinder-idle.mp4'
const defaultFps = 12

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function dispose(assets: FrameAssets | null) {
  void assets?.dispose().catch(() => {})
}

export function useEditor() {
  const source = shallowRef<VideoSource | null>(null)
  const assets = shallowRef<FrameAssets | null>(null)
  const frames = shallowRef<Frame[]>([])
  const selectedId = ref<string | null>(null)
  const error = ref('')
  const importing = ref(false)
  const extracting = ref(false)
  const extractionRate = ref(defaultFps)
  const range = ref({ start: 0, end: 0 })
  const processed = ref(0)
  const decoder = ref<Decoder | null>(null)
  const historyPast = shallowRef<Frame[][]>([])
  const historyNext = shallowRef<Frame[][]>([])
  const sequenceVersion = ref(0)
  let anchorId: string | null = null
  let importTask: AbortController | undefined
  let extractionTask: AbortController | undefined
  let previousDecoder: Decoder | null = null
  let duplicateId = 0

  const active = computed(() => frames.value.filter((frame) => frame.enabled))
  const selectedIndex = computed(() => frames.value.findIndex((frame) => frame.id === selectedId.value))
  const selected = computed(() => frames.value[selectedIndex.value] ?? null)
  const options = computed<ExtractionOptions>(() => ({ ...range.value, fps: extractionRate.value }))
  const expected = computed(() => frameCount(options.value))
  const busy = computed(() => importing.value || extracting.value)

  function replaceFrames(next: Frame[]) {
    frames.value = next
    if (!next.some((frame) => frame.id === selectedId.value)) selectedId.value = next[0]?.id ?? null
  }

  function resetSequence() {
    replaceFrames([])
    historyPast.value = []
    historyNext.value = []
    anchorId = null
    dispose(assets.value)
    assets.value = null
    decoder.value = null
    sequenceVersion.value++
  }

  function stopExtraction() {
    const task = extractionTask
    extractionTask = undefined
    task?.abort()
    if (task) decoder.value = previousDecoder
    extracting.value = false
    processed.value = 0
  }

  function cleanProject() {
    const task = importTask
    importTask = undefined
    task?.abort()
    importing.value = false
    stopExtraction()
    resetSequence()
    if (source.value) URL.revokeObjectURL(source.value.url)
    source.value = null
    range.value = { start: 0, end: 0 }
    extractionRate.value = defaultFps
    error.value = ''
  }

  async function load(input: File | null) {
    if (input && !/\.(mp4|webm|mov)$/i.test(input.name)) {
      error.value = 'Choose an MP4, WebM or MOV video.'
      return
    }
    importTask?.abort()
    stopExtraction()
    const task = new AbortController()
    importTask = task
    importing.value = true
    error.value = ''

    try {
      let file = input
      if (!file) {
        const response = await fetch(new URL(sampleName, document.baseURI), { signal: task.signal })
        if (!response.ok) throw new Error('The sample video could not be opened.')
        file = new File([await response.blob()], sampleName, { type: 'video/mp4' })
      }
      const next = await readSource(file, task.signal, !input)
      if (task.signal.aborted) {
        URL.revokeObjectURL(next.url)
        return
      }
      resetSequence()
      if (source.value) URL.revokeObjectURL(source.value.url)
      source.value = next
      range.value = { start: 0, end: next.duration }
      extractionRate.value = defaultFps
    } catch (reason) {
      if (!task.signal.aborted) error.value = message(reason)
    } finally {
      if (importTask === task) {
        importTask = undefined
        importing.value = false
      }
    }
    if (!input && source.value?.sample && !task.signal.aborted && !error.value) await extract()
  }

  function setRange(key: 'start' | 'end', value: number) {
    if (!source.value || !Number.isFinite(value)) return
    const { start, end } = range.value
    range.value = key === 'start'
      ? { start: clamp(value, 0, end), end }
      : { start, end: clamp(value, start, source.value.duration) }
  }

  function setExtractionRate(value: number) {
    if (Number.isFinite(value)) extractionRate.value = clamp(Math.round(value), 1, 60)
  }

  async function extract() {
    const video = source.value
    if (!video || busy.value || !expected.value) return
    const request = options.value
    const task = new AbortController()
    const nextAssets = new FrameAssets()
    previousDecoder = decoder.value
    let batchWrites: Promise<void> = Promise.resolve()
    let nextFrames: Frame[] = []
    extractionTask = task
    extracting.value = true
    error.value = ''
    processed.value = 0
    try {
      await extractVideo(video, request, task.signal, {
        onDecoder: (value) => { decoder.value = value },
        onRestart: async () => {
          await nextAssets.clear()
          nextFrames = []
          if (extractionTask === task) processed.value = 0
        },
        onBatch: (batch) => {
          batchWrites = (async () => {
            task.signal.throwIfAborted()
            const stored = await nextAssets.add(batch)
            task.signal.throwIfAborted()
            for (const frame of stored) nextFrames.push({ ...frame, id: `frame-${frame.asset}`, enabled: true })
            processed.value = nextFrames.length
          })()
          return batchWrites
        },
      })
      task.signal.throwIfAborted()
      if (!nextFrames.length) throw new Error('No frames were decoded in this range.')
      resetSequenceAfterExtraction(nextFrames, nextAssets)
    } catch (reason) {
      await batchWrites.catch(() => {})
      dispose(nextAssets)
      if (extractionTask === task) {
        decoder.value = previousDecoder
        if (!task.signal.aborted) error.value = message(reason)
      }
    } finally {
      if (extractionTask === task) {
        extractionTask = undefined
        extracting.value = false
        processed.value = 0
      }
    }
  }

  function resetSequenceAfterExtraction(nextFrames: Frame[], nextAssets: FrameAssets) {
    const previous = assets.value
    assets.value = nextAssets
    selectedId.value = nextFrames[0]?.id ?? null
    replaceFrames(nextFrames)
    historyPast.value = []
    historyNext.value = []
    anchorId = null
    sequenceVersion.value++
    dispose(previous)
  }

  function commit(next: Frame[]) {
    historyPast.value = [...historyPast.value.slice(-39), frames.value]
    historyNext.value = []
    replaceFrames(next)
  }

  function undo() {
    const past = historyPast.value.at(-1)
    if (!past) return
    historyNext.value = [frames.value, ...historyNext.value]
    historyPast.value = historyPast.value.slice(0, -1)
    replaceFrames(past)
  }

  function redo() {
    const next = historyNext.value[0]
    if (!next) return
    historyPast.value = [...historyPast.value, frames.value]
    historyNext.value = historyNext.value.slice(1)
    replaceFrames(next)
  }

  function selectFrame(id: string) { selectedId.value = id }

  function toggleFrame(id: string, extend = false) {
    const index = frames.value.findIndex((frame) => frame.id === id)
    if (index < 0) return
    const anchor = extend ? frames.value.findIndex((frame) => frame.id === anchorId) : -1
    const start = anchor < 0 ? index : Math.min(anchor, index)
    const end = anchor < 0 ? index : Math.max(anchor, index)
    const enabled = !frames.value[index]!.enabled
    commit(frames.value.map((frame, position) =>
      position >= start && position <= end && frame.enabled !== enabled ? { ...frame, enabled } : frame,
    ))
    if (anchor < 0) anchorId = id
    selectFrame(id)
  }

  function setSelection(action: 'all' | 'none' | 'invert') {
    const next = frames.value.map((frame) => {
      const enabled = action === 'invert' ? !frame.enabled : action === 'all'
      return frame.enabled === enabled ? frame : { ...frame, enabled }
    })
    if (next.some((frame, index) => frame !== frames.value[index])) commit(next)
  }

  function duplicateFrame(id: string) {
    const index = frames.value.findIndex((frame) => frame.id === id)
    const frame = frames.value[index]
    if (!frame) return
    const duplicate = { ...frame, id: `duplicate-${++duplicateId}` }
    commit([...frames.value.slice(0, index + 1), duplicate, ...frames.value.slice(index + 1)])
    selectFrame(duplicate.id)
  }

  function deleteFrame(id: string) {
    const index = frames.value.findIndex((frame) => frame.id === id)
    if (index < 0) return
    const next = frames.value.filter((frame) => frame.id !== id)
    if (id === selectedId.value) selectedId.value = next[Math.min(index, next.length - 1)]?.id ?? null
    commit(next)
  }

  function moveFrame(id: string, targetId: string) {
    const from = frames.value.findIndex((frame) => frame.id === id)
    const to = frames.value.findIndex((frame) => frame.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...frames.value]
    const [frame] = next.splice(from, 1)
    next.splice(to, 0, frame!)
    commit(next)
    selectFrame(id)
  }

  onBeforeUnmount(cleanProject)
  return {
    source, assets, frames, active, selected, selectedIndex, error, busy, importing, extracting,
    extractionRate, range, processed, decoder, expected, sequenceVersion,
    fileSize: computed(() => source.value ? formatFileSize(source.value.file.size) : ''),
    canUndo: computed(() => historyPast.value.length > 0),
    canRedo: computed(() => historyNext.value.length > 0),
    load, cleanProject, extract, stopExtraction, setRange, setExtractionRate,
    undo, redo, selectFrame, toggleFrame, setSelection, duplicateFrame, deleteFrame, moveFrame,
  }
}
