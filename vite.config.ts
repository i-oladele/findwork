/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite refuses requests for hostnames it does not know, which blocks
  // tunnels used to put a build in front of testers. Listing the tunnel
  // domains keeps that protection for everything else.
  server: { allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'] },
  preview: { allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The icon and font CSS imported by index.css is large and irrelevant to
    // assertions; skipping CSS keeps the suite fast.
    css: false,
  },
})
