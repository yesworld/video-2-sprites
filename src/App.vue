<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CircleAlert, FilePlus2, GripHorizontal, Layers2, Redo2, ShieldCheck, Undo2, Upload, X,
} from '@lucide/vue'
import AnimationPreview from './components/AnimationPreview.vue'
import FrameInspector from './components/FrameInspector.vue'
import FrameTimeline from './components/FrameTimeline.vue'
import SourcePanel from './components/SourcePanel.vue'
import { useEditor } from './composables/useEditor'
import { usePlayback } from './composables/usePlayback'
import { clamp } from './media/format'

const {
  source, assets, frames, active, selected, selectedIndex, error, busy, importing, extracting,
  extractionRate, range, processed, decoder, expected, sequenceVersion, fileSize, canUndo, canRedo,
  load, cleanProject, extract, stopExtraction, setRange, setExtractionRate, undo, redo, selectFrame,
  toggleFrame, setSelection, duplicateFrame, deleteFrame, moveFrame,
} = useEditor()
const { playing, loop, direction, fps, current, frameIndex, setFps, togglePlaying, step } = usePlayback(active, sequenceVersion)
const getCurrentId = () => current.value?.id ?? null
const picker = ref<HTMLInputElement>()
const dragDepth = ref(0)
const layout = ref({ source: 258, inspector: 236, timeline: 269 })
const userResized = ref({ source: false, inspector: false, timeline: false })
const layoutStyle = computed(() => ({
  '--source-width': userResized.value.source ? layout.value.source + 'px' : undefined,
  '--inspector-width': userResized.value.inspector ? layout.value.inspector + 'px' : undefined,
  '--timeline-height': userResized.value.timeline ? layout.value.timeline + 'px' : undefined,
}))
type PanelName = keyof typeof layout.value
let resize: { panel: PanelName; origin: number; size: number; pointerId: number } | undefined

function chooseVideo() { picker.value?.click() }

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void load(file)
  input.value = ''
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
function dragEnter(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragDepth.value++
}
function dragOver(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}
function dragLeave(event: DragEvent) {
  if (!hasFiles(event)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function dropFile(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragDepth.value = 0
  const file = event.dataTransfer?.files[0]
  if (file) void load(file)
}

function panelSize(panel: PanelName, value: number) {
  const min = panel === 'timeline' ? 150 : 195
  const max = panel === 'timeline' ? Math.max(min, Math.floor(window.innerHeight * 0.52))
    : Math.min(420, Math.floor(window.innerWidth * 0.32))
  layout.value[panel] = clamp(value, min, max)
  userResized.value[panel] = true
}
function startResize(event: PointerEvent, panel: PanelName) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  const area = handle.parentElement
  if (!area) return
  const bounds = area.getBoundingClientRect()
  const axis = panel === 'timeline' ? 'y' : 'x'
  resize = { panel, origin: axis === 'x' ? event.clientX : event.clientY, size: axis === 'x' ? bounds.width : bounds.height, pointerId: event.pointerId }
  handle.setPointerCapture(event.pointerId)
}
function moveResize(event: PointerEvent) {
  if (!resize || resize.pointerId !== event.pointerId) return
  const point = resize.panel === 'timeline' ? event.clientY : event.clientX
  const delta = (point - resize.origin) * (resize.panel === 'source' ? 1 : -1)
  panelSize(resize.panel, resize.size + delta)
}
function stopResize() { resize = undefined }
function resizeByKey(event: KeyboardEvent, panel: PanelName) {
  const keys = panel === 'timeline' ? ['ArrowUp', 'ArrowDown'] : ['ArrowRight', 'ArrowLeft']
  const index = keys.indexOf(event.key)
  if (index < 0) return
  event.preventDefault()
  const area = (event.currentTarget as HTMLElement).parentElement
  const size = panel === 'timeline' ? area?.offsetHeight : area?.offsetWidth
  const grow = (index === 0) === (panel !== 'inspector')
  panelSize(panel, (size ?? layout.value[panel]) + (grow ? 16 : -16))
}

function onShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input,select,textarea,[contenteditable]')) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if (event.code === 'Space' && !(target instanceof HTMLElement && target.closest('button'))) {
    event.preventDefault()
    if (!event.repeat) togglePlaying()
  }
}

function newProject() {
  if (frames.value.length && !source.value?.sample && !window.confirm('Clear this clip and its extracted frames?')) return
  cleanProject()
}

onMounted(() => {
  window.addEventListener('keydown', onShortcut)
  void load(null)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
</script>

<template>
  <div class="editor" :style="layoutStyle" @dragenter="dragEnter" @dragover="dragOver" @dragleave="dragLeave" @drop="dropFile">
    <header class="topbar">
      <div class="brand"><span class="brand-icon"><Layers2 :size="21" :stroke-width="2" /></span><h1>Stripe Studio</h1></div>
      <span class="vertical-line top-divider"></span>
      <div class="project-name">
        <span :title="source?.file.name">{{ source?.file.name ?? 'Untitled project' }}</span>
        <span v-if="source?.sample" class="sample-badge">Sample</span>
      </div>
      <div class="top-actions">
        <button class="icon-button" type="button" aria-label="New project" title="New project" :disabled="!source && !busy" @click="newProject"><FilePlus2 :size="18" /></button>
        <span class="vertical-line"></span>
        <button class="icon-button" type="button" aria-label="Undo sequence edit" title="Undo sequence edit" :disabled="!canUndo" @click="undo"><Undo2 :size="18" /></button>
        <button class="icon-button" type="button" aria-label="Redo sequence edit" title="Redo sequence edit" :disabled="!canRedo" @click="redo"><Redo2 :size="18" /></button>
        <button class="button primary import-button" type="button" @click="chooseVideo"><Upload :size="16" /><span>Import video</span></button>
      </div>
      <input ref="picker" type="file" hidden accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" @change="handleFile" />
    </header>

    <main class="workspace">
      <div class="left-pane">
        <SourcePanel
          :source="source" :file-size="fileSize" :importing="importing" :extracting="extracting"
          :range="range" :fps="extractionRate" :expected="expected" :processed="processed" :decoder="decoder"
          @import="chooseVideo" @sample="load(null)" @range="setRange" @fps="setExtractionRate" @extract="extract" @cancel="stopExtraction"
        />
        <div
          class="splitter splitter-left" role="separator" tabindex="0" aria-label="Resize source panel" aria-orientation="vertical"
          @pointerdown="startResize($event, 'source')" @pointermove="moveResize" @lostpointercapture="stopResize" @pointercancel="stopResize"
          @keydown="resizeByKey($event, 'source')"
        ></div>
      </div>
      <AnimationPreview
        :frame="current" :assets="assets" :source="source" :frame-index="frameIndex" :count="active.length"
        :playing="playing" :loop="loop" :direction="direction" :fps="fps" :sequence-version="sequenceVersion"
        @toggle="togglePlaying" @step="step" @loop="loop = $event" @direction="direction = $event" @fps="setFps" @import="chooseVideo"
      />
      <div class="right-pane">
        <FrameInspector :frame="selected" :index="selectedIndex" :source="source" :assets="assets" @toggle="toggleFrame" @duplicate="duplicateFrame" @delete="deleteFrame" />
        <div
          class="splitter splitter-right" role="separator" tabindex="0" aria-label="Resize inspector" aria-orientation="vertical"
          @pointerdown="startResize($event, 'inspector')" @pointermove="moveResize" @lostpointercapture="stopResize" @pointercancel="stopResize"
          @keydown="resizeByKey($event, 'inspector')"
        ></div>
      </div>
    </main>

    <div class="timeline-pane">
      <FrameTimeline
        :frames="frames" :active-count="active.length" :selected-id="selected?.id ?? null" :get-current-id="getCurrentId"
        @toggle="toggleFrame" @select="selectFrame" @selection="setSelection" @move="moveFrame"
      />
      <div
        class="splitter splitter-timeline" role="separator" tabindex="0" aria-label="Resize frame sequence" aria-orientation="horizontal"
        @pointerdown="startResize($event, 'timeline')" @pointermove="moveResize" @lostpointercapture="stopResize" @pointercancel="stopResize"
        @keydown="resizeByKey($event, 'timeline')"
      ><GripHorizontal :size="17" /></div>
    </div>

    <footer class="statusbar">
      <span><ShieldCheck :size="13" /> Local processing</span>
      <span v-if="source && !busy"><i></i>{{ decoder ?? 'Video ready' }}</span>
    </footer>

    <div v-if="error" class="error-banner" role="alert"><CircleAlert :size="17" /><span>{{ error }}</span><button class="icon-button compact" type="button" aria-label="Dismiss error" @click="error = ''"><X :size="16" /></button></div>
    <div v-if="dragDepth" class="drop-overlay"><div><Upload :size="32" /><strong>Drop a video to import</strong><span>MP4, WebM or MOV</span></div></div>
  </div>
</template>
