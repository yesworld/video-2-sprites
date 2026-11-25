<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Aperture, Film, FolderOpen, Play, Pause, ScanLine, Upload, X } from '@lucide/vue'
import { formatTime } from '../media/format'
import type { Decoder, VideoSource } from '../media/types'

const props = defineProps<{
  source: VideoSource | null
  fileSize: string
  importing: boolean
  extracting: boolean
  range: { start: number; end: number }
  fps: number
  expected: number
  processed: number
  decoder: Decoder | null
}>()
const emit = defineEmits<{
  import: []
  sample: []
  range: [key: 'start' | 'end', value: number]
  fps: [value: number]
  extract: []
  cancel: []
}>()

const presets = [6, 8, 12, 15, 24, 30, 60]
const busy = computed(() => props.importing || props.extracting)
const duration = computed(() => props.source?.duration ?? 0)
const startPercent = computed(() => duration.value ? props.range.start / duration.value * 100 : 0)
const endPercent = computed(() => duration.value ? props.range.end / duration.value * 100 : 100)
const video = ref<HTMLVideoElement>()
const playing = ref(false)
const videoTime = ref(0)
const clipFormat = computed(() => props.source?.file.name.split('.').pop()?.toUpperCase() ?? '')
const progress = computed(() => props.expected ? Math.round(props.processed / props.expected * 100) : 0)

watch(() => props.source, () => {
  playing.value = false
  videoTime.value = 0
})

function changeRange(key: 'start' | 'end', event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.valueAsNumber
  emit('range', key, value)
  const lower = key === 'start' ? 0 : props.range.start
  const upper = key === 'start' ? props.range.end : duration.value
  const corrected = Number.isFinite(value) ? Math.max(lower, Math.min(value, upper)) : props.range[key]
  input.value = input.type === 'number' ? String(Number(corrected.toFixed(3))) : String(corrected)
  if (Number.isFinite(value) && video.value?.readyState) {
    video.value.pause()
    video.value.currentTime = corrected
  }
}

function changeFps(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.valueAsNumber
  if (Number.isFinite(value)) emit('fps', value)
  input.value = String(Number.isFinite(value) ? Math.max(1, Math.min(60, Math.round(value))) : props.fps)
}

function toggleVideo() {
  if (!video.value) return
  if (video.value.paused) void video.value.play().catch(() => {})
  else video.value.pause()
}
</script>

<template>
  <aside class="source-panel" aria-label="Video source and extraction">
    <section class="side-section source-section">
      <div class="section-heading">
        <h2><Film :size="15" /> Source video</h2>
        <button class="icon-button compact" type="button" aria-label="Choose source video" title="Choose source video" @click="emit('import')">
          <FolderOpen :size="16" />
        </button>
      </div>

      <template v-if="source">
        <div class="source-monitor">
          <video
            v-if="source.native"
            ref="video"
            :key="source.url"
            :src="source.url"
            muted
            playsinline
            loop
            preload="auto"
            aria-label="Source video"
            @timeupdate="videoTime = video?.currentTime ?? 0"
            @play="playing = true"
            @pause="playing = false"
            @ended="playing = false"
          />
          <div v-else class="source-unavailable">Video playback is unavailable for this codec.</div>
          <button v-if="source.native" class="source-play" type="button" :aria-label="playing ? 'Pause source video' : 'Play source video'" @click="toggleVideo">
            <Pause v-if="playing" :size="13" fill="currentColor" />
            <Play v-else :size="13" fill="currentColor" />
          </button>
          <span v-if="source.native" class="source-time">{{ formatTime(videoTime) }} / {{ formatTime(source.duration) }}</span>
        </div>
        <div class="file-line">
          <span class="filename" :title="source.file.name">{{ source.file.name }}</span>
          <span class="file-format">{{ clipFormat }}</span>
        </div>
        <dl class="metadata source-metadata">
          <div><dt>Resolution</dt><dd>{{ source.width }} × {{ source.height }}</dd></div>
          <div><dt>Source FPS</dt><dd>{{ source.fps === null ? 'Unknown' : Number(source.fps.toFixed(3)) }}</dd></div>
          <div><dt>File size</dt><dd>{{ fileSize }}</dd></div>
        </dl>
      </template>

      <div v-else class="source-empty">
        <Upload :size="21" />
        <button class="button secondary" type="button" :disabled="importing" @click="emit('import')">Choose video</button>
        <span>MP4, WebM or MOV</span>
        <button class="text-button" type="button" :disabled="importing" @click="emit('sample')">Open sample</button>
      </div>
    </section>

    <section class="side-section extraction-section">
      <div class="section-heading"><h2><ScanLine :size="15" /> Frame extraction</h2></div>
      <fieldset class="extraction-settings" :disabled="!source || busy">
        <div class="trim-track" :class="{ 'start-on-top': endPercent > 98 && endPercent - startPercent < 4 }" :style="{ '--trim-start': startPercent + '%', '--trim-end': endPercent + '%' }">
          <div class="trim-fill"></div>
          <input type="range" aria-label="Clip start slider" :min="0" :max="duration" step="any" :value="range.start" @input="changeRange('start', $event)" />
          <input type="range" aria-label="Clip end slider" :min="0" :max="duration" step="any" :value="range.end" @input="changeRange('end', $event)" />
        </div>
        <div class="field-pair">
          <label class="input-label">Start <span class="numeric"><input type="number" aria-label="Start time" :min="0" :max="range.end" step="0.01" :value="Number(range.start.toFixed(3))" @change="changeRange('start', $event)" /><span>s</span></span></label>
          <label class="input-label">End <span class="numeric"><input type="number" aria-label="End time" :min="range.start" :max="duration" step="0.01" :value="Number(range.end.toFixed(3))" @change="changeRange('end', $event)" /><span>s</span></span></label>
        </div>
        <label class="rate-row">Extraction FPS <span class="numeric"><input type="number" aria-label="Extraction FPS" min="1" max="60" :value="fps" @change="changeFps" /><span>fps</span></span></label>
        <div class="fps-presets" aria-label="Extraction FPS presets">
          <button v-for="rate in presets" :key="rate" type="button" :aria-pressed="fps === rate" @click="emit('fps', rate)">{{ rate }}</button>
        </div>
      </fieldset>

      <button v-if="extracting" class="button secondary extract-button" type="button" @click="emit('cancel')"><X :size="15" /> Cancel extraction</button>
      <button v-else class="button primary extract-button" type="button" :disabled="!expected || busy" @click="emit('extract')"><Aperture :size="15" /> Extract frames</button>
      <div v-if="extracting" class="extraction-progress" aria-live="polite">
        <progress :value="processed" :max="expected" aria-label="Frame extraction progress"></progress>
        <div><span>{{ decoder ?? 'Starting' }}</span><span>{{ processed }} / {{ expected }} · {{ progress }}%</span></div>
      </div>
      <p v-else class="extraction-note">{{ importing ? 'Opening video…' : `Estimated output · ${expected} ${expected === 1 ? 'frame' : 'frames'}` }}</p>
    </section>
  </aside>
</template>
