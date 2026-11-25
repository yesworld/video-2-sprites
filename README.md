# Stripe Studio

A local editor for extracting video frames and assembling a sprite animation. This release implements **Stage 1** of the project brief.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL shown by Vite. The editor opens with a bundled sample. Import an MP4, WebM, or MOV with the file picker or by dropping it into the workspace. Set the clip range and extraction FPS, then select **Extract frames**. Video codecs are limited to those available in your browser on Windows or macOS.

Click a frame to include or exclude it. Shift-click applies the clicked frame's new state across a range. Right-click or move keyboard focus to a frame to inspect it. Drag a frame to reorder it, or use Alt+Left/Right while it has keyboard focus. Sequence edits support undo and redo. The preview plays the active sequence at its own FPS. Press Space to play or pause when focus is outside an input or button.

## Production build

```sh
npm run build
npm run preview
```

On HTTPS or localhost, the production service worker caches the editor and sample for offline use after the first successful load.

## Deploy to GitHub Pages

Run `npm ci` after a fresh checkout. With Git configured and write access to `origin`, run:

```sh
npm run deploy
```

The command runs `sh deploy.sh`, builds the app into `dist/`, and pushes the build to `gh-pages`. It uses a temporary checkout so you stay on your current branch.

After the first push creates `gh-pages`, select **Deploy from a branch → gh-pages → /(root)** in [Settings → Pages](https://github.com/yesworld/video-2-sprites/settings/pages). GitHub will serve the site at [yesworld.github.io/video-2-sprites](https://yesworld.github.io/video-2-sprites/).

## Architecture

- `src/components` contains the source controls, preview, inspector, and sequence grid.
- `src/composables` owns the sequence, undo history, and playback state.
- `src/media` handles the browser-video fallback, Canvas 2D encoding, and temporary IndexedDB frame storage.
- `src/workers/video.worker.ts` demultiplexes supported video with Mediabunny and extracts frames with WebCodecs and OffscreenCanvas. The worker sends bounded batches and waits for storage before decoding the next batch. When WebCodecs cannot decode the clip, the editor seeks an HTMLVideoElement and uses Canvas 2D.
- Original frames are kept as PNGs. The grid uses smaller thumbnails when needed. Import, frame processing, and storage all run on the device.

Later stages cover image processing, sprite sheet export, and project save and restore. The workflow uses [Sorceress Auto-Sprite](https://sorceress.games/tutorials/auto-sprite) as a functional reference.
