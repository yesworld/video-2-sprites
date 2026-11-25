import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI)).catch(() => {})
}
