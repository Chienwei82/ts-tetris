import { defineConfig } from 'vite';

export default defineConfig({
  // host: true escucha en todas las interfaces (0.0.0.0), no solo localhost,
  // para poder jugar desde otros dispositivos de la LAN.
  server: { host: true, port: 5173 },
  // El build de producción servido con `npm run preview` también sale a la LAN.
  preview: { host: true, port: 4173 },
  // Vite 8 compila y optimiza con Rolldown + Oxc (ya no esbuild/Rollup).
  build: {
    target: 'es2023',
    sourcemap: true,
    // Code splitting nativo de Rolldown (`advancedChunks` de Rollup ya no aplica):
    // three.js en su propio chunk para que la caché del navegador sobreviva
    // a cambios del código de la app. El límite de aviso se ajusta porque
    // three.js ocupa ~580 kB él solo.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three/ }]
        }
      }
    }
  }
});
