import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-core',
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 60,
              maxSize: 400_000,
            },
            {
              name: 'react-three',
              test: /[\\/]node_modules[\\/]@react-three[\\/]/,
              priority: 55,
            },
            {
              name: 'charts',
              test: /[\\/]node_modules[\\/](?:recharts|victory-vendor|react-smooth|d3-[^\\/]+)[\\/]/,
              priority: 50,
            },
            {
              name: 'react-core',
              test: /[\\/]node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)[\\/]/,
              priority: 45,
            },
            {
              name: 'motion',
              test: /[\\/]node_modules[\\/](?:motion|motion-dom|motion-utils|framer-motion)[\\/]/,
              priority: 40,
            },
            {
              name: 'pxlkit',
              test: /[\\/]node_modules[\\/]@pxlkit[\\/]/,
              priority: 35,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
