import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  preview: {
    allowedHosts: ['launchup.onrender.com']
  },
  // No `/api` proxy here: routes/api/[...path]/+server.ts handles it, and a
  // vite proxy would shadow that route and skip its cookie-to-Bearer swap.
  server: {
    host: true,
    port: 5173
  }
});
