/**
 * CANARY BLAIR — campaign-finance prompt formatter
 *
 * Renders a member's finance_* columns (schema 011 + 014) into the
 * CAMPAIGN FINANCE section of the AI profile prompt. One implementation
 * imported by both ai-worker.js and profiles.js so the two can't drift.
 *
 * Returns '' when the member has no finance data.
 */
export function formatFinanceSection(member) {
	if (member?.finance_total_raised == null) return '';

	const lines = [];
	const approx = member.finance_matched_by === 'name' ? ', matched by name — approximate' : '';
	lines.push(`CAMPAIGN FINANCE (source: FollowTheMoney${approx}):`);
	lines.push(`Total contributions raised: $${Number(member.finance_total_raised).toLocaleString()}${member.finance_cycle ? ` (${member.finance_cycle} cycle)` : ''}`);

	if (Array.isArray(member.finance_contrib_types) && member.finance_contrib_types.length) {
		const parts = member.finance_contrib_types.map((t) => {
			const label = t.type === 'Individual' ? 'from individuals'
				: t.type === 'Non-Individual' ? 'from organizations & PACs'
				: 'other/unitemized';
			return `$${Number(t.total || 0).toLocaleString()} ${label}`;
		});
		lines.push(`Breakdown: ${parts.join(', ')}`);
	}

	if (member.finance_small_donor_total != null) {
		lines.push(`Small donations ($200 or less): $${Number(member.finance_small_donor_total).toLocaleString()}`);
	}

	if (Array.isArray(member.finance_top_industries) && member.finance_top_industries.length) {
		lines.push('Top industries funding them:');
		for (const i of member.finance_top_industries.slice(0, 5)) {
			lines.push(`- ${i.industry}${i.sector && i.sector !== i.industry ? ` (${i.sector})` : ''}: $${Number(i.total || 0).toLocaleString()}`);
		}
	}

	if (Array.isArray(member.finance_top_donors) && member.finance_top_donors.length) {
		lines.push('Largest contributors:');
		for (const d of member.finance_top_donors.slice(0, 5)) {
			lines.push(`- ${d.name}${d.type ? ` (${d.type})` : ''}: $${Number(d.total || 0).toLocaleString()}`);
		}
	}

	return '\n' + lines.join('\n');
}
