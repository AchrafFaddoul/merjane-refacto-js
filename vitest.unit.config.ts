import {type UserConfig, mergeConfig} from 'vitest/config';
import {baseConfig} from './vitest.config.base.js';

export default mergeConfig<UserConfig, UserConfig>(baseConfig, {
	test: {
		include: ['**/*.spec.ts', '!**/*.integration.spec.ts'],
	},
});
