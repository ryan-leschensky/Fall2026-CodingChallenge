import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The backend's CORS_ORIGIN allows this origin only, so fail loudly instead of moving to another port
    port: 5173,
    strictPort: true,
  },
})
