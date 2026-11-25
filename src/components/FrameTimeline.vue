<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Film, Grid2X2 } from '@lucide/vue'
import { clamp, formatTime, frameNumber } from '../media/format'
import type { Frame } from '../media/types'

const props = defineProps<{
  frames: Frame[]
  selectedId: string | null
  getCurrentId: () => string | null
  activeCount: number
}>()
const emit = defineEmits<{
  toggle: [id: string, extend: boolean]
  select: [id: string]
  selection: [action: 'all' | 'none' | 'invert']
  move: [id: string, target: string]
}>()

const zoom = ref(100)
const dragging = ref<string | null>(null)
const dropTarget = ref<string | null>(null)
const width = computed(() => Math.round(104 * zoom.value / 100))
watch([() => props.getCurrentId(), () => props.frames], ([current], [previous]) => {
  if (previous) document.getElementById('timeline-' + previous)?.removeAttribute('data-playing')
  if (current) document.getElementById('timeline-' + current)?.setAttribute('data-playing', '')
}, { flush: 'post' })

function changeZoom(event: Event) {
  const input = event.target as HTMLInputElement
  if (Number.isFinite(input.valueAsNumber)) zoom.value = clamp(Math.round(input.valueAsNumber), 65, 200)
  input.value = String(zoom.value)
}

function startDrag(event: DragEvent, id: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('text/plain', id)
  event.dataTransfer.effectAllowed = 'move'
  dragging.value = id
}

function setTarget(event: DragEvent, id: string) {
  if (!dragging.value || dragging.value === id) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = id
}

function endDrag() {
  dragging.value = null
  dropTarget.value = null
}

function putFrame(event: DragEvent, id: string) {
  if (!dragging.value) return
  event.preventDefault()
  event.stopPropagation()
  emit('move', dragging.value, id)
  endDrag()
}

function onKey(event: KeyboardEvent, frame: Frame, index: number) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (!event.altKey) return
  const target = props.frames[index + (event.key === 'ArrowRight' ? 1 : -1)]
  if (!target) return
  event.preventDefault()
  emit('move', frame.id, target.id)
}
</script>

<template>
  <section class="timeline-panel" aria-label="Frame sequence">
    <div class="timeline-toolbar">
      <div class="timeline-title"><Film :size="17" /><h2>Frame sequence</h2><span class="timeline-count"><b>{{ activeCount }}</b> / {{ frames.length }} active</span></div>
      <div class="timeline-controls">
        <div class="selection-buttons" aria-label="Frame selection">
          <button type="button" :disabled="!frames.length" @click="emit('selection', 'all')">All</button>
          <button type="button" :disabled="!frames.length" @click="emit('selection', 'none')">None</button>
          <button type="button" :disabled="!frames.length" @click="emit('selection', 'invert')">Invert</button>
        </div>
        <span class="vertical-line"></span>
        <div class="thumbnail-zoom" title="Thumbnail size">
          <Grid2X2 :size="14" />
          <input aria-label="Thumbnail size slider" type="range" min="65" max="200" :value="zoom" @input="changeZoom" />
          <label><input aria-label="Thumbnail size" type="number" min="65" max="200" :value="zoom" @change="changeZoom" /><span>%</span></label>
        </div>
      </div>
    </div>
    <div v-if="frames.length" class="timeline-scroll">
      <div class="frame-grid" :style="{ '--card-width': width + 'px' }">
        <button
          v-for="(frame, index) in frames"
          :key="frame.id"
          :id="'timeline-' + frame.id"
          type="button"
          class="frame-card"
          :class="{ inactive: !frame.enabled, selected: frame.id === selectedId, 'drop-target': frame.id === dropTarget }"
          :aria-label="`Frame ${frameNumber(index)}`"
          :aria-pressed="frame.enabled"
          :draggable="true"
          :title="`Frame ${frameNumber(index)} · ${formatTime(frame.time, 3)}`"
          @click="emit('toggle', frame.id, $event.shiftKey)"
          @focus="emit('select', frame.id)"
          @contextmenu.prevent="emit('select', frame.id)"
          @keydown="onKey($event, frame, index)"
          @dragstart="startDrag($event, frame.id)"
          @dragover="setTarget($event, frame.id)"
          @dragleave="dropTarget === frame.id && (dropTarget = null)"
          @drop="putFrame($event, frame.id)"
          @dragend="endDrag"
        >
          <span class="frame-thumb checker"><img :src="frame.thumbnail" alt="" draggable="false" loading="lazy" /></span>
          <span class="frame-label"><span>{{ frameNumber(index) }}</span><span class="frame-check"><Check v-if="frame.enabled" :size="10" :stroke-width="2.8" /></span></span>
        </button>
      </div>
    </div>
    <div v-else class="timeline-empty">Extract frames from a video to build a sequence.</div>
    <div class="timeline-hints"><span><kbd>Shift</kbd> + click for a range</span><span>Drag frames to reorder</span></div>
  </section>
</template>
