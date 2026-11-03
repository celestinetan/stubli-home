import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// The wall iPad is frozen at Safari 16, so compile everything down for it.
export default defineConfig({
  plugins: [preact()],
  build: { target: 'safari16', cssTarget: 'safari16', outDir: 'dist', emptyOutDir: true },
})
