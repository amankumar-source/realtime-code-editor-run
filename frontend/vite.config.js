import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // Increase chunk warning limit slightly — Monaco is legitimately large
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Manual chunking: separate vendor libs from app code
        // — Monaco editor is ~4MB; isolating it allows the app shell to load fast
        // while Monaco lazily streams in the background
        manualChunks: {
          // React core — tiny, loads first, cached long-term
          "vendor-react": ["react", "react-dom"],
          // Socket.io client — separate chunk, not needed until join
          "vendor-socket": ["socket.io-client"],
          // UUID utility — tiny, bundle with react vendor is fine but isolated here
          // to demonstrate the pattern; can collapse into vendor-react if desired
          "vendor-utils": ["uuid"],
          // Monaco editor — largest chunk, keep isolated for optimal caching
          "vendor-monaco": ["@monaco-editor/react"],
        },
      },
    },

    // Enable source maps in production for easier debugging of deployed errors
    // Set to false to shave ~20% off build size if source maps aren't needed
    sourcemap: false,

    // Minify with esbuild (default) — fastest, good compression
    minify: "esbuild",

    // Target modern browsers to allow smaller output (no IE11 polyfills)
    target: "es2020",
  },

  server: {
    // Warm up frequently imported modules to improve HMR response time in dev
    warmup: {
      clientFiles: ["./src/App.jsx"],
    },
  },
});
