/**
 * CANARY BLAIR — minimal CSV helpers
 *
 * Just enough RFC 4180-ish quoting/parsing for the finance eid workflow
 * (pipeline/finance-eid-export.js + finance-eid-import.js). Not a general
 * CSV library — no multi-line-field or embedded-newline support beyond what
 * JSON.stringify-style quoting gives us.
 */

export function toCsvRow(fields) {
	return fields
		.map((f) => {
			const s = f == null ? '' : String(f);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		})
		.join(',');
}

/** Parses one CSV line into fields. Handles quoted fields with "" escapes. */
export function parseCsvLine(line) {
	const fields = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inQuotes) {
			if (c === '"') {
				if (line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			fields.push(cur);
			cur = '';
		} else {
			cur += c;
		}
	}
	fields.push(cur);
	return fields;
}

/** Parses a full CSV file (with header row) into an array of row objects. */
export function parseCsv(text) {
	const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
	if (lines.length === 0) return [];
	const header = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		const row = {};
		header.forEach((h, i) => (row[h] = values[i] ?? ''));
		return row;
	});
}
