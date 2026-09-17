import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 仅用于 53001 的「数据问答」Demo：/api 代理到临时 demo 后端（8010），
// 不动 53000 / 8000 的线上业务服务，也不改默认的 vite.config.ts。
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 53001,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8010',
    },
  },
})
