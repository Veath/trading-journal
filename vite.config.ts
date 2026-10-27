import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages 部署在 /<仓库名>/ 下，由 CI 传入
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
