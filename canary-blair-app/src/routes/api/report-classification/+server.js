import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { json } from '@sveltejs/kit';

// Accepts a public "this bill is misclassified" report and files it in the
// review queue (schema 013). Anonymous by design — contact is optional.
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Bad request' }, { status: 400 });
	}

	// Honeypot: real users never fill a hidden field. Pretend success so bots
	// don't learn they were caught.
	if (body.website) return json({ ok: true });

	const billId = Number.parseInt(body.bill_id);
	const reason = (body.reason || '').trim();
	const contact = (body.contact || '').trim();

	if (!Number.isInteger(billId) || reason.length < 1) {
		return json({ ok: false, error: 'Please describe what looks wrong.' }, { status: 400 });
	}

	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	const { error } = await supabase.from('classification_reports').insert({
		bill_id: billId,
		reason: reason.slice(0, 2000),
		reporter_contact: contact ? contact.slice(0, 200) : null
	});

	if (error) {
		return json({ ok: false, error: 'Could not submit — please try again later.' }, { status: 500 });
	}
	return json({ ok: true });
}
