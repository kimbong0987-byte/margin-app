import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true, // ngrok의 무작위 주소 접속을 허용합니다.
    host: true,         // 내 컴퓨터 외부(핸드폰 등) 접속을 허용합니다.
    port: 5173          // 포트 번호를 5173으로 고정합니다.
  }
})