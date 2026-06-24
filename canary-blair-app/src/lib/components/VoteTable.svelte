<script>
	import PartyBadge from './PartyBadge.svelte';
	import { voteColor, voteText } from '$lib/utils.js';

	let { votes = [], sortBy = 'vote' } = $props();

	let sortField = $state(sortBy);
	let sortAsc = $state(true);

	function toggleSort(field) {
		if (sortField === field) {
			sortAsc = !sortAsc;
		} else {
			sortField = field;
			sortAsc = true;
		}
	}

	let sortedVotes = $derived.by(() => {
		const copy = [...votes];
		copy.sort((a, b) => {
			let va, vb;
			if (sortField === 'vote') {
				va = a.vote_value;
				vb = b.vote_value;
			} else if (sortField === 'party') {
				va = a.members?.party || '';
				vb = b.members?.party || '';
			} else if (sortField === 'name') {
				va = a.members?.full_name || '';
				vb = b.members?.full_name || '';
			} else {
				va = a[sortField] || '';
				vb = b[sortField] || '';
			}
			if (va < vb) return sortAsc ? -1 : 1;
			if (va > vb) return sortAsc ? 1 : -1;
			return 0;
		});
		return copy;
	});

	function sortIndicator(field) {
		if (sortField !== field) return '';
		return sortAsc ? ' ↑' : ' ↓';
	}
</script>

<div class="vote-table-wrap">
	<table class="vote-table">
		<thead>
			<tr>
				<th class="sortable" onclick={() => toggleSort('name')}>Name{sortIndicator('name')}</th>
				<th class="sortable" onclick={() => toggleSort('party')}>Party{sortIndicator('party')}</th>
				<th>District</th>
				<th class="sortable" onclick={() => toggleSort('vote')}>Vote{sortIndicator('vote')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sortedVotes as vote}
				<tr>
					<td>
						{#if vote.members}
							<a href="/members/{vote.members.id}">{vote.members.full_name}</a>
						{:else}
							Unknown
						{/if}
					</td>
					<td>
						{#if vote.members?.party}
							<PartyBadge party={vote.members.party} />
						{/if}
					</td>
					<td class="district">{vote.members?.district || ''}</td>
					<td>
						<span class="vote-badge {voteColor(vote.vote_value)}">
							{vote.vote_text || voteText(vote.vote_value)}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.vote-table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}
	.vote-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}
	th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 2px solid var(--color-border);
		color: var(--color-text-muted);
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	th.sortable {
		cursor: pointer;
		user-select: none;
	}
	th.sortable:hover {
		color: var(--color-text);
	}
	td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-border);
	}
	td a {
		color: var(--color-text);
	}
	td a:hover {
		color: var(--color-accent);
	}
	.district {
		color: var(--color-text-muted);
	}
	.vote-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.75rem;
	}
	.vote-yea { background: var(--color-yea); color: #fff; }
	.vote-nay { background: var(--color-nay); color: #fff; }
	.vote-nv { background: var(--color-nv); color: #fff; }
	.vote-absent { background: var(--color-absent); color: #fff; }
</style>
