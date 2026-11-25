<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronDown, Hand, Maximize2, Minimize2, Minus, Pause, Play, Plus, Repeat2,
  RotateCcw, SkipBack, SkipForward, SquarePlay,
} from '@lucide/vue'
import type { FrameAssets } from '../media/frame-assets'
import { clamp, frameNumber } from '../media/format'
import type { Direction, Frame, VideoSource } from '../media/types'
import FramePicture from './FramePicture.vue'

const props = defineProps<{
  frame: Frame | null
  assets: FrameAssets | null
  source: VideoSource | null
  frameIndex: number
  count: number
  playing: boolean
  loop: boolean
  direction: Direction
  fps: number
  sequenceVersion: number
}>()
const emit = defineEmits<{
  toggle: []
  step: [offset: number]
  loop: [value: boolean]
  direction: [value: Direction]
  fps: [value: number]
  import: []
}>()

const backgroundOptions = [
  { id: 'checker', name: 'Transparent' },
  { id: 'black', name: 'Black', color: '#000000' },
  { id: 'white', name: 'White', color: '#ffffff' },
  { id: 'grey', name: 'Grey', color: '#808080' },
  { id: 'dark-brown', name: 'Dark Brown', color: '#382921' },
  { id: 'light-brown', name: 'Light Brown', color: '#b69073' },
  { id: 'green', name: 'Green', color: '#00aa57' },
  { id: 'custom', name: 'Custom Color' },
]
const background = ref('checker')
const customColor = ref('#354152')
const zoom = ref(100)
const pan = ref({ x: 0, y: 0 })
const viewportSize = ref({ width: 0, height: 0 })
const panel = ref<HTMLElement>()
const viewport = ref<HTMLElement>()
const dragging = ref(false)
const fullscreen = ref(false)
const fullscreenFallback = ref(false)
let observer: ResizeObserver | undefined
let pointer: { id: number; x: number; y: number } | undefined

const bgColor = computed(() => background.value === 'custom'
  ? customColor.value
  : backgroundOptions.find((option) => option.id === background.value)?.color,
)
const dimensions = computed(() => {
  if (!props.source) return { width: 0, height: 0 }
  const { width, height } = props.source
  const bounds = viewportSize.value
  const fit = Math.min(bounds.width * 0.77 / width, bounds.height * 0.76 / height)
  const fitToPixelGrid = fit >= 2 ? Math.floor(fit) : fit
  const scale = fitToPixelGrid * zoom.value / 100
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
})

function changeZoom(value: number) {
  if (Number.isFinite(value)) zoom.value = clamp(Math.round(value), 25, 1600)
}

function onZoomInput(event: Event) {
  const input = event.target as HTMLInputElement
  changeZoom(input.valueAsNumber)
  input.value = String(zoom.value)
}

function zoomStep(direction: number) {
  const steps = [25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1200, 1600]
  const ordered = direction < 0 ? steps.reverse() : steps
  const next = ordered.find((step) => direction < 0 ? step < zoom.value : step > zoom.value)
  if (next !== undefined) changeZoom(next)
}

function resetView() {
  zoom.value = 100
  pan.value = { x: 0, y: 0 }
}

function startPan(event: PointerEvent) {
  if (!props.frame || event.button !== 0) return
  viewport.value?.setPointerCapture(event.pointerId)
  pointer = { id: event.pointerId, x: event.clientX - pan.value.x, y: event.clientY - pan.value.y }
  dragging.value = true
}

function movePan(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  pan.value = { x: event.clientX - pointer.x, y: event.clientY - pointer.y }
}

function stopPan(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return
  pointer = undefined
  dragging.value = false
}

function readFullscreen() {
  fullscreen.value = document.fullscreenElement === panel.value
}

async function toggleFullscreen() {
  if (fullscreenFallback.value) {
    fullscreenFallback.value = false
  } else if (document.fullscreenElement === panel.value) {
    await document.exitFullscreen().catch(() => {})
  } else if (panel.value) {
    try {
      if (!panel.value.requestFullscreen) throw new Error('Fullscreen is unavailable')
      await panel.value.requestFullscreen()
    } catch {
      fullscreenFallback.value = true
    }
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && fullscreenFallback.value) fullscreenFallback.value = false
}

function changeFps(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.valueAsNumber
  if (Number.isFinite(value)) emit('fps', clamp(Math.round(value), 1, 60))
  input.value = String(Number.isFinite(value) ? clamp(Math.round(value), 1, 60) : props.fps)
}

watch(() => props.sequenceVersion, resetView)
onMounted(() => {
  if (viewport.value) {
    observer = new ResizeObserver(([entry]) => {
      if (entry) viewportSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
    })
    observer.observe(viewport.value)
  }
  document.addEventListener('fullscreenchange', readFullscreen)
  window.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('fullscreenchange', readFullscreen)
  window.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <section ref="panel" class="preview-panel" :class="{ 'preview-fullscreen': fullscreenFallback }" aria-label="Live animation preview">
    <header class="preview-header">
      <div class="preview-title"><SquarePlay :size="17" /><h2>Live preview</h2></div>
      <div class="view-options">
        <label class="select-control background-select" title="Preview background">
          <span class="background-swatch" :style="{ backgroundColor: bgColor }" :class="{ checker: !bgColor }"></span>
          <select v-model="background" aria-label="Preview background">
            <option v-for="option in backgroundOptions" :key="option.id" :value="option.id">{{ option.name }}</option>
          </select>
          <ChevronDown :size="12" />
        </label>
        <input v-if="background === 'custom'" v-model="customColor" class="custom-color" type="color" aria-label="Custom preview color" />
        <span class="vertical-line"></span>
        <div class="zoom-control" aria-label="Preview magnification">
          <button class="icon-button compact" type="button" title="Zoom out" aria-label="Zoom out" :disabled="zoom === 25" @click="zoomStep(-1)"><Minus :size="14" /></button>
          <label><input type="number" min="25" max="1600" aria-label="Preview zoom" :value="zoom" @change="onZoomInput" /><span>%</span></label>
          <button class="icon-button compact" type="button" title="Zoom in" aria-label="Zoom in" :disabled="zoom === 1600" @click="zoomStep(1)"><Plus :size="14" /></button>
        </div>
        <button class="icon-button compact" type="button" title="Reset view" aria-label="Reset view" @click="resetView"><RotateCcw :size="15" /></button>
        <button class="icon-button compact" type="button" :title="fullscreen || fullscreenFallback ? 'Exit fullscreen' : 'Fullscreen'" :aria-label="fullscreen || fullscreenFallback ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
          <Minimize2 v-if="fullscreen || fullscreenFallback" :size="16" />
          <Maximize2 v-else :size="16" />
        </button>
      </div>
    </header>

    <div
      ref="viewport"
      class="viewport"
      :class="{ checker: !bgColor, pannable: frame, dragging }"
      :style="{ backgroundColor: bgColor }"
      @pointerdown.self="startPan"
      @pointermove="movePan"
      @pointerup="stopPan"
      @pointercancel="stopPan"
      @lostpointercapture="stopPan"
    >
      <div
        v-if="frame"
        class="artboard"
        :style="{ width: dimensions.width + 'px', height: dimensions.height + 'px', translate: `${pan.x}px ${pan.y}px` }"
        @pointerdown="startPan"
      >
        <FramePicture :frame="frame" :assets="assets" alt="Current animation frame" />
        <i v-for="corner in ['tl', 'tr', 'bl', 'br']" :key="corner" :class="'corner ' + corner"></i>
      </div>
      <div v-else class="stage-empty">
        <SquarePlay :size="30" />
        <strong>{{ !source ? 'Open a video to get started' : count ? 'Waiting for a frame' : 'No active frames' }}</strong>
        <span v-if="source">{{ count ? '' : 'Extract frames or enable them in the sequence.' }}</span>
        <button v-else class="button secondary" type="button" @click="emit('import')">Choose video</button>
      </div>
      <div v-if="frame && source" class="stage-badge stage-size">{{ source.width }} × {{ source.height }} px</div>
      <div v-if="frame" class="stage-badge pan-hint"><Hand :size="12" /> Drag to pan</div>
    </div>

    <footer class="transport">
      <div class="transport-play">
        <button class="icon-button" type="button" title="Previous frame" aria-label="Previous frame" :disabled="!count" @click="emit('step', -1)"><SkipBack :size="16" fill="currentColor" /></button>
        <button class="play-button" type="button" :title="playing && count ? 'Pause animation (Space)' : 'Play animation (Space)'" :aria-label="playing && count ? 'Pause animation' : 'Play animation'" :disabled="!count" @click="emit('toggle')">
          <Pause v-if="playing && count" :size="16" fill="currentColor" />
          <Play v-else :size="16" fill="currentColor" />
        </button>
        <button class="icon-button" type="button" title="Next frame" aria-label="Next frame" :disabled="!count" @click="emit('step', 1)"><SkipForward :size="16" fill="currentColor" /></button>
        <span class="frame-counter"><b>{{ frameIndex < 0 ? '00' : frameNumber(frameIndex) }}</b><span>/</span>{{ String(count).padStart(2, '0') }}</span>
      </div>
      <div class="transport-settings">
        <button class="icon-button loop-button" type="button" :aria-pressed="loop" title="Loop animation" aria-label="Loop animation" @click="emit('loop', !loop)"><Repeat2 :size="17" /></button>
        <label class="select-control direction-select" title="Playback direction">
          <select :value="direction" aria-label="Playback direction" @change="emit('direction', ($event.target as HTMLSelectElement).value as Direction)">
            <option value="forward">Forward</option>
            <option value="reverse">Reverse</option>
            <option value="ping-pong">Ping-pong</option>
          </select>
          <ChevronDown :size="12" />
        </label>
        <label class="numeric playback-fps" title="Playback FPS"><input type="number" min="1" max="60" aria-label="Playback FPS" :value="fps" @change="changeFps" /><span>fps</span></label>
      </div>
    </footer>
  </section>
</template>
