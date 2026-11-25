<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import type { FrameAssets } from '../media/frame-assets'
import type { Frame } from '../media/types'

const props = withDefaults(defineProps<{
  frame: Frame
  assets: FrameAssets | null
  alt?: string
}>(), { alt: '' })

const original = shallowRef<{ asset: number; assets: FrameAssets; url: string }>()

watch(() => [props.frame.asset, props.assets] as const, async ([asset, assets], _previous, onCleanup) => {
  original.value = undefined
  if (props.frame.small || !assets) return
  let stale = false
  let url: string | undefined
  onCleanup(() => {
    stale = true
    if (url) URL.revokeObjectURL(url)
  })

  try {
    const blob = await assets.original(asset)
    if (stale || !blob) return
    const image = new Image()
    url = URL.createObjectURL(blob)
    image.src = url
    await image.decode()
    if (!stale) original.value = { asset, assets, url }
  } catch {
    // The thumbnail is always available while the original is loading or storage is being replaced.
  }
}, { immediate: true })
</script>

<template>
  <img
    :src="original?.asset === frame.asset && original.assets === assets ? original.url : frame.thumbnail"
    :alt="alt"
    class="frame-picture"
    draggable="false"
  />
</template>
