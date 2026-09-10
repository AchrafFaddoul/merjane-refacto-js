import {resolve} from 'node:path';
import {type UserConfig} from 'vitest/config';

export const baseConfig: UserConfig = {
	test: {
		reporters: ['default', 'html'],
		coverage: {
			provider: 'v8',
			all: true,
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/utils/test-utils/**'],
		},
		root: resolve(import.meta.dirname),
		globals: true,
		watchExclude: ['coverage', 'html/**', '**/*.db'],
	},
	resolve: {
		alias: {
			'@': resolve(import.meta.dirname, './src'),
		},
	},
};
