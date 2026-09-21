import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		name: 'page-context-collector',
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		silent: 'passed-only',
	},
})
