<script setup lang="ts">
import { ref, watch } from 'vue'
import { Copy, Expand, Image, SlidersHorizontal, Trash2, X } from '@lucide/vue'
import type { FrameAssets } from '../media/frame-assets'
import { formatTime, frameNumber } from '../media/format'
import type { Frame, VideoSource } from '../media/types'
import FramePicture from './FramePicture.vue'

const props = defineProps<{
  frame: Frame | null
  index: number
  source: VideoSource | null
  assets: FrameAssets | null
}>()
const emit = defineEmits<{ toggle: [id: string]; duplicate: [id: string]; delete: [id: string] }>()
const dialog = ref<HTMLDialogElement>()
watch(() => props.frame, (frame) => { if (!frame) dialog.value?.close() })
</script>

<template>
  <aside class="inspector-panel" aria-label="Frame inspector">
    <section class="side-section">
      <div class="section-heading"><h2><SlidersHorizontal :size="15" /> Inspector</h2></div>
      <template v-if="frame && source">
        <button class="inspector-picture checker" type="button" aria-label="Enlarge selected frame" title="Enlarge selected frame" @click="dialog?.showModal()">
          <FramePicture :frame="frame" :assets="assets" />
          <span class="enlarge-icon"><Expand :size="14" /></span>
        </button>
        <div class="inspector-title">
          <h3>Frame {{ frameNumber(index) }}</h3>
          <span class="activity-pill" :class="{ active: frame.enabled }"><i></i>{{ frame.enabled ? 'Active' : 'Inactive' }}</span>
        </div>
        <dl class="metadata frame-metadata">
          <div><dt>Source time</dt><dd>{{ formatTime(frame.time, 3) }}</dd></div>
          <div><dt>Dimensions</dt><dd>{{ source.width }} × {{ source.height }} px</dd></div>
        </dl>
        <label class="include-control">
          <span>Include in sequence</span>
          <input class="switch" type="checkbox" :checked="frame.enabled" @change="emit('toggle', frame.id)" />
        </label>
        <div class="inspector-actions">
          <button class="button secondary" type="button" @click="emit('duplicate', frame.id)"><Copy :size="15" /> Duplicate</button>
          <button class="button secondary delete-action" type="button" aria-label="Delete frame" title="Delete frame" @click="emit('delete', frame.id)"><Trash2 :size="15" /></button>
        </div>
      </template>
      <div v-else class="inspector-empty">
        <Image :size="22" />
        <span>Select a frame to inspect it.</span>
      </div>
    </section>
    <dialog ref="dialog" class="frame-dialog">
      <template v-if="frame && source">
        <header><h2>Frame {{ frameNumber(index) }}</h2><button class="icon-button" type="button" aria-label="Close enlarged frame" @click="dialog?.close()"><X :size="19" /></button></header>
        <div class="frame-dialog-image checker"><FramePicture :frame="frame" :assets="assets" :alt="`Frame ${frameNumber(index)} at ${formatTime(frame.time, 3)}`" /></div>
        <div class="frame-dialog-details"><span>{{ source.width }} × {{ source.height }} px</span><span>{{ formatTime(frame.time, 3) }}</span></div>
      </template>
    </dialog>
  </aside>
</template>
