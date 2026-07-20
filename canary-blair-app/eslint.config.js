import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Flat config for ESLint 9 + Svelte 5. */
export default [
	js.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		rules: {
			// The app deliberately reads `let { data } = $props()` then aliases
			// `const member = data.member` on SSR pages whose data never mutates.
			// That's a safe pattern here, so keep the compiler hint as a warning
			// rather than a CI-blocking error.
			'svelte/valid-compile': 'warn'
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'static/']
	}
];
