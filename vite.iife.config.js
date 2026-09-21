// @ts-check
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	clearScreen: false,
	publicDir: false,
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'PageContextCollector',
			fileName: 'page-context-collector',
			formats: ['iife'],
		},
		outDir: resolve(__dirname, 'dist', 'lib'),
		emptyOutDir: false,
		rollupOptions: {
			external: [],
		},
		minify: false,
		sourcemap: true,
	},
})
