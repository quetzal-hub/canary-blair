/**
 * "My Reps" — legislators the visitor has pinned, stored ONLY in their browser's
 * localStorage. No account, no server, no tracking: we never learn who someone's
 * reps are. Exactly the alert/personalization model a no-tracking project can use.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'canary-blair:my-reps';

function load() {
	if (!browser) return [];
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
		return Array.isArray(raw) ? raw.filter((x) => Number.isInteger(x)) : [];
	} catch {
		return [];
	}
}

function persist(ids) {
	if (browser) localStorage.setItem(KEY, JSON.stringify(ids));
}

function createStore() {
	const { subscribe, update } = writable(load());

	// Keep multiple tabs in sync.
	if (browser) {
		window.addEventListener('storage', (e) => {
			if (e.key === KEY) update(() => load());
		});
	}

	return {
		subscribe,
		toggle(id) {
			update((ids) => {
				const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
				persist(next);
				return next;
			});
		},
		remove(id) {
			update((ids) => {
				const next = ids.filter((x) => x !== id);
				persist(next);
				return next;
			});
		}
	};
}

export const myReps = createStore();
