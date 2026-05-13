import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA Configuration
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg}'],
        maximumFileSizeToCacheInBytes: 5000000
      },
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'ROW — Rehab on Wheels | APD',
        short_name: 'ROW',
        description: 'Rehabilitation outreach management — The Association of People with Disability',
        theme_color: '#008080',
        icons: [
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
          'vendor-excel': ['exceljs'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-dexie': ['dexie'],
        },
      },
    },
  },
})
