import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { fileURLToPath } from 'node:url';

// The per-state config lives in the pipeline package (its canonical home) and
// is shared into the app via this alias, so both halves read ONE file. Editing
// pipeline/lib/state-config.js retargets the scoring engine, the AI prompts,
// AND the frontend at once.
const stateConfig = fileURLToPath(new URL('../pipeline/lib/state-config.js', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
	resolve: {
		alias: { $stateConfig: stateConfig }
	},
	server: {
		// Allow the dev server to read the shared config outside the app root.
		fs: { allow: [repoRoot] }
	},
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Canary Blair',
				short_name: 'Canary Blair',
				description: 'WV legislative accountability',
				theme_color: '#1a1a1a',
				background_color: '#1a1a1a',
				display: 'standalone',
				icons: [
					{
						src: '/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'supabase-api',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 300
							}
						}
					}
				]
			}
		})
	]
});
