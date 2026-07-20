/**
 * Minimal, dependency-free CSV serializer for the open-data exports.
 * Escapes per RFC 4180 (quote fields containing comma, quote, or newline).
 */
function cell(value) {
	if (value == null) return '';
	let s = Array.isArray(value) ? value.join('; ') : String(value);
	if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
	return s;
}

/**
 * @param {Array<object>} rows
 * @param {Array<{key: string, label?: string}>} columns
 */
export function toCsv(rows, columns) {
	const header = columns.map((c) => cell(c.label || c.key)).join(',');
	const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(',')).join('\n');
	return `${header}\n${body}\n`;
}

export function csvHeaders(filename) {
	return {
		'Content-Type': 'text/csv; charset=utf-8',
		'Content-Disposition': `attachment; filename="${filename}"`,
		'Cache-Control': 'public, max-age=3600'
	};
}

export const jsonHeaders = {
	'Content-Type': 'application/json; charset=utf-8',
	'Cache-Control': 'public, max-age=3600'
};
