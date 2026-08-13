import { defineConfig } from 'vite'

// GitHub Pages 정적 export (Vercel 사용 이력 — 2026-08 Pages로 전환)
// Pages용: basePath '/sango-rising-dragons-kr' / Vercel용: basePath '' (root context)
// 환경변수로 분기 (P34 패턴)
export default defineConfig({
  base: process.env.VERCEL ? '' : '/sango-rising-dragons-kr/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
})