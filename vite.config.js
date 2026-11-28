import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Visitors arrive on old phones too: write the app's code in syntax those browsers can run.
  build: { target: ['chrome87', 'edge88', 'firefox78', 'safari14'] },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
