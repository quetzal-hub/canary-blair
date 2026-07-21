<script>
	let { billId } = $props();

	let open = $state(false);
	let reason = $state('');
	let contact = $state('');
	let website = $state(''); // honeypot — hidden from real users
	let status = $state('idle'); // idle | sending | done | error
	let errorMsg = $state('');

	async function submit(e) {
		e.preventDefault();
		if (!reason.trim()) return;
		status = 'sending';
		errorMsg = '';
		try {
			const res = await fetch('/api/report-classification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bill_id: billId, reason, contact, website })
			});
			const data = await res.json();
			if (data.ok) {
				status = 'done';
			} else {
				status = 'error';
				errorMsg = data.error || 'Something went wrong.';
			}
		} catch {
			status = 'error';
			errorMsg = 'Network error — please try again.';
		}
	}
</script>

<div class="report">
	{#if !open}
		<button class="open-btn" onclick={() => (open = true)}>Think this classification is wrong? Flag it for review →</button>
	{:else if status === 'done'}
		<p class="thanks">✅ Thank you — this bill has been added to our review queue. Classifications are human-checkable, and a person will look at this one.</p>
	{:else}
		<form onsubmit={submit}>
			<p class="intro">
				Our classification is an AI-assisted assessment and can be wrong. Tell us what looks off and a
				human will review it. (See how the score is built on the <a href="/about">About</a> page.)
			</p>
			<label for="report-reason" class="sr-only">What looks wrong?</label>
			<textarea id="report-reason" bind:value={reason} placeholder="What's misclassified, and why?" rows="3" required></textarea>
			<label for="report-contact">Email <span class="opt">(optional — only if you want a reply)</span></label>
			<input id="report-contact" type="email" bind:value={contact} placeholder="you@example.com" />
			<!-- honeypot: visually hidden, ignored by humans -->
			<input class="hp" type="text" tabindex="-1" autocomplete="off" bind:value={website} aria-hidden="true" />
			<div class="actions">
				<button type="submit" class="submit" disabled={status === 'sending' || !reason.trim()}>
					{status === 'sending' ? 'Sending…' : 'Submit report'}
				</button>
				<button type="button" class="cancel" onclick={() => (open = false)}>Cancel</button>
			</div>
			{#if status === 'error'}<p class="err">{errorMsg}</p>{/if}
		</form>
	{/if}
</div>

<style>
	.report {
		margin-top: var(--space-lg);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-border);
	}
	.open-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		text-align: left;
		padding: 0;
	}
	.open-btn:hover {
		color: var(--color-accent);
	}
	.intro {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		margin-bottom: var(--space-sm);
	}
	textarea,
	input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg-raised);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: inherit;
	}
	label {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: var(--space-sm) 0 var(--space-xs);
	}
	.opt {
		color: var(--color-text-dim);
	}
	.hp {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
	}
	.actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-md);
	}
	.submit {
		background: var(--color-accent);
		color: #1a1a1a;
		border: none;
		border-radius: 6px;
		padding: 0.4rem 1rem;
		font-weight: 600;
		font-size: 0.8125rem;
	}
	.submit:disabled {
		opacity: 0.5;
	}
	.cancel {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 0.4rem 1rem;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}
	.thanks {
		font-size: 0.875rem;
		color: var(--color-text);
		line-height: 1.6;
	}
	.err {
		color: var(--color-nay);
		font-size: 0.8125rem;
		margin-top: var(--space-sm);
	}
</style>
