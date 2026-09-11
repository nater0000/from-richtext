import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/from-richtext/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Rich Text to MD',
        short_name: 'RT2MD',
        theme_color: '#1e1e1e',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          // Place two placeholder images named icon-192.png and icon-512.png in your /public folder
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
