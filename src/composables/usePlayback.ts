import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { clamp } from '../media/format'
import type { Direction, Frame } from '../media/types'

export function usePlayback(frames: Ref<Frame[]>, sequenceVersion: Ref<number>) {
  const playing = ref(true)
  const loop = ref(true)
  const direction = ref<Direction>('forward')
  const fps = ref(12)
  const position = ref(0)
  const sequence = computed(() => {
    if (direction.value === 'reverse') return frames.value.slice().reverse()
    if (direction.value === 'ping-pong' && frames.value.length > 1) {
      const returnPath = frames.value.slice(loop.value ? 1 : 0, -1).reverse()
      return [...frames.value, ...returnPath]
    }
    return frames.value
  })
  const current = computed(() => sequence.value[position.value] ?? null)
  const activeIndices = computed(() => new Map(frames.value.map((frame, index) => [frame.id, index])))
  const frameIndex = computed(() => current.value ? activeIndices.value.get(current.value.id) ?? -1 : -1)
  let animation = 0
  let previousTime: number | undefined

  watch(sequence, (next, previous) => {
    const id = previous[position.value]?.id
    const keep = next[position.value]?.id === id ? position.value : next.findIndex((frame) => frame.id === id)
    position.value = keep >= 0 && keep < next.length ? keep : clamp(position.value, 0, Math.max(0, next.length - 1))
    previousTime = undefined
  }, { flush: 'sync' })

  watch(sequenceVersion, () => {
    position.value = 0
    playing.value = true
    previousTime = undefined
  })

  function setFps(value: number) {
    if (Number.isFinite(value)) fps.value = clamp(Math.round(value), 1, 60)
    previousTime = undefined
  }

  function togglePlaying() {
    if (!sequence.value.length) return
    if (!playing.value && !loop.value && position.value === sequence.value.length - 1) position.value = 0
    playing.value = !playing.value
    previousTime = undefined
  }

  function step(offset: number) {
    const length = sequence.value.length
    if (!length) return
    playing.value = false
    position.value = loop.value
      ? (position.value + offset + length) % length
      : clamp(position.value + offset, 0, length - 1)
  }

  function tick(time: number) {
    if (playing.value && sequence.value.length) {
      previousTime ??= time
      const interval = 1000 / fps.value
      const advance = Math.floor((time - previousTime) / interval)
      if (advance > 0) {
        previousTime += advance * interval
        const last = sequence.value.length - 1
        const next = position.value + advance
        if (loop.value) {
          position.value = next % sequence.value.length
        } else if (next > last) {
          position.value = last
          playing.value = false
          previousTime = undefined
        } else {
          position.value = next
        }
      }
    } else {
      previousTime = undefined
    }
    animation = requestAnimationFrame(tick)
  }

  onMounted(() => { animation = requestAnimationFrame(tick) })
  onBeforeUnmount(() => cancelAnimationFrame(animation))

  return { playing, loop, direction, fps, sequence, current, frameIndex, setFps, togglePlaying, step }
}
