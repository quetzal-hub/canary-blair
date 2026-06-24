# Canary Blair

> *The canary watched for poison so the miners could survive. We do the same — for democracy.*

**Canary Blair** is a free, anonymous, civic accountability progressive web app (PWA) for West Virginia residents. It tracks every bill, every vote, and every legislator in the WV state legislature — summarizes them in plain language using AI — and makes that information radically accessible to ordinary people with no political or legal background.

The name comes from two pieces of West Virginia history: **Blair Mountain** (site of the 1921 miners' uprising, the largest armed labor revolt in U.S. history) and the **coal-mine canary** (an early warning system for poison gas). Canary Blair is the spirit of that fight — still watching, still singing.

---

## Table of Contents

- [Features](#features)
- [The Canary Score](#the-canary-score)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
  - [1. Clone the repo](#1-clone-the-repo)
  - [2. Install dependencies](#2-install-dependencies)
  - [3. Configure environment variables](#3-configure-environment-variables)
  - [4. Apply the database schema](#4-apply-the-database-schema)
  - [5. Run the initial data sync](#5-run-the-initial-data-sync)
  - [6. Start the dev server](#6-start-the-dev-server)
- [Running the Pipeline Locally](#running-the-pipeline-locally)
- [Deployment](#deployment)
- [Environment Variables Reference](#environment-variables-reference)
- [Core Values](#core-values)
- [Data Sources](#data-sources)
- [Privacy Policy](#privacy-policy)

---

## Features

### Legislative Tracker

Canary Blair pulls live data from the [LegiScan API](https://legiscan.com/) every day and surfaces it through a clean, fast, mobile-first interface.

**Bills (`/bills`)**
- Filterable, searchable list of every bill in the current WV legislative session
- Filter by status (Active / Passed / Failed / Vetoed), chamber (House / Senate), and AI-generated topic tags
- Full-text search across bill numbers and titles
- Each bill card shows: bill number, title, status badge, last action date, and topic tags
- Paginated at 20 results per page
- Toggle to include archived (passed/failed) bills

**Bill Detail (`/bills/[id]`)**
- Complete bill metadata: number, title, status, chamber, introduced date, last action
- **AI summary** — plain-language explanation of what the bill actually does, who benefits, and who gets hurt
- Topic tag pills for quick scanning
- Full sponsor list, each linked to their member profile
- Complete action history timeline (committee referrals, readings, amendments)
- **Full vote breakdown** — every legislator's vote on this bill, with:
  - Name, party, district, and chamber
  - Color-coded votes: green for Yea, red for Nay, gray for Not Voting/Absent
  - Sort by vote, party, or name

**Members (`/members`)**
- Directory of all current WV legislators (100 House delegates + 34 senators)
- Filter by chamber and party
- Search by name or district
- **Canary Score** prominently displayed on every card
- Sortable by Canary Score (default) to see who votes for people vs. capital

**Member Profile (`/members/[id]`)**
- Full profile: photo (if available), name, party, chamber, district
- Vote statistics: total votes, Yea %, Nay %, Not Voting %, Absent %
- **Canary Score** — prominent display with tier name, emoji, and tagline
- Score breakdown showing how many bills they were scored on, and how they voted on people-vs-capital bills
- Earned badges displayed as labeled pills
- AI-generated voting pattern summary — "How [Name] votes" in plain language
- **Ask a Question** — free-form Q&A powered by Claude; ask anything about this legislator's record and get a data-grounded answer
- Complete sponsored bills list
- Paginated full vote history, filterable by Yea / Nay / NV / Absent

**Session Digests (`/digests`)**
- AI-generated summaries of legislative activity
- Available in Daily, Weekly, Monthly, and Yearly views
- "What happened this week in the WV legislature" — written for humans, not lawyers

**Find My Rep (`/find`)**
- Look up your own representatives by district or name

**About (`/about`)**
- Mission statement and the Blair Mountain history
- How the data is collected (LegiScan attribution)
- How the Canary Score is calculated
- Full privacy policy

---

## The Canary Score

Every WV legislator gets a **Canary Score** from 0–100, calculated mathematically from their own voting record. It is not editorial. There are no human judgment calls. It is math applied to their public record.

| Score | Tier | Name | Tagline |
|-------|------|------|---------|
| 85–100 | ✨ | Mountaineer | *"Votes like they actually live here."* |
| 65–84 | 🌱 | Friend of the Holler | *"Not perfect, but they're trying."* |
| 45–64 | 🌫️ | The Fence Sitter | *"Which way is the wind blowing today?"* |
| 25–44 | 🪨 | The Company Man | *"Reliable — just not for you."* |
| 10–24 | 🐀 | The Rat in the Capitol | *"Actively working against the people who elected them."* |
| 0–9 | ☠️ | Owned | *"Congratulations to their donors on their investment."* |

**How it works:** Bills are classified as FOR_PEOPLE or FOR_CAPITAL using their AI-generated tags. Votes on those bills are scored (+2 / -2 for Yea/Nay, -0.5 for not showing up). Bills with strong AI-identified beneficiaries get a 1.5× weight multiplier. The raw score is normalized to 0–100. Members need at least 20 scored votes before receiving a score. Scores are recalculated weekly from live data.

**Badges** are awarded in addition to the tier score:
- 🦅 **Lone Canary** — Voted against their party's majority on a people-first bill at least 3 times
- 👻 **Ghost** — NV or Absent on more than 25% of all votes
- 📈 **Most Improved** — Canary Score increased 15+ points vs. previous session
- 💰 **Never Met a Corporation They Didn't Like** — 90%+ of corporate-interest votes were Yea
- 🔒 **Lockstep** — Voted with their party 95%+ of the time on scored bills
- 💧 **Water Protector** — Voted Yea on 80%+ of environment/water bills
- 👷 **Friend of the Worker** — Voted Yea on 80%+ of workers' rights bills

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Database | [Supabase](https://supabase.com/) (PostgreSQL) | Free tier, generous limits, Postgres underneath, Row Level Security built in |
| Sync pipeline | [Cloudflare Workers](https://workers.cloudflare.com/) + cron trigger | Free tier, runs at edge, no server to manage |
| AI pipeline | Cloudflare Workers + [Anthropic API](https://anthropic.com/) | Same infrastructure, Claude Sonnet for summarization |
| Frontend | [SvelteKit](https://kit.svelte.dev/) PWA | Lightweight, fast, excellent PWA support, SSR for SEO |
| Deployment | [Cloudflare Pages](https://pages.cloudflare.com/) | Free, global CDN, integrates with Workers |
| Data source | [LegiScan API](https://legiscan.com/) | Free tier, covers all 50 states, reliable legislative data |

---

## Prerequisites

You will need accounts and API keys from these services before you can run Canary Blair. All have free tiers sufficient for this project.

| Requirement | Where to get it | Notes |
|------------|----------------|-------|
| **Node.js 18+** | [nodejs.org/en/download](https://nodejs.org/en/download/) | Required to run the frontend and pipeline scripts locally |
| **npm 9+** | Included with Node.js | — |
| **Wrangler CLI** | `npm install -g wrangler` | Cloudflare's CLI for deploying and testing Workers |
| **Supabase account** | [supabase.com](https://supabase.com/) | Free. Create a new project. You need the project URL and both the anon key and the service role key. |
| **LegiScan API key** | [legiscan.com/legiscan](https://legiscan.com/legiscan) | Free. Register, then get your API key from your account dashboard. The free tier gives 30,000 queries/month — more than enough. |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com/) | Required for AI bill summarization, member profiles, session digests, and the Q&A feature. |
| **Cloudflare account** | [cloudflare.com](https://cloudflare.com/) | Free. Required for deployment only — not needed to run locally. |

---

## Project Structure

```
canary-blair/
├── .env                          # Your secrets (never committed)
├── .env.example                  # Template — copy this to .env
├── .gitignore
├── package.json                  # Pipeline-level package (dotenv, etc.)
├── wrangler-sync.toml            # Cloudflare config for the sync worker
├── wrangler-ai.toml              # Cloudflare config for the AI worker
│
├── schema/
│   ├── 001_initial.sql           # Full database schema — apply this first
│   ├── 002_scoring_columns.sql   # Canary Score columns for members table
│   ├── 003_text_change_detection.sql
│   ├── 004_active_bills_view_archived.sql
│   └── 005_refresh_passed_bills_view.sql
│
├── pipeline/
│   ├── sync.js                   # LegiScan → Supabase sync (Cloudflare Worker)
│   ├── ai-worker.js              # AI summarization worker (Cloudflare Worker)
│   ├── score.js                  # Canary Score calculation script
│   ├── summarize.js              # Bill summarization logic
│   ├── profiles.js               # Member profile generation logic
│   ├── bootstrap.js              # One-time full data load
│   ├── test-sync.js              # Local test runner for the sync worker
│   └── test-ai.js                # Local test runner for the AI worker
│
└── canary-blair-app/             # SvelteKit PWA
    ├── svelte.config.js
    ├── vite.config.js
    ├── package.json
    ├── static/
    │   ├── favicon.ico
    │   ├── favicon.svg
    │   ├── icon-192.png
    │   ├── icon-512.png
    │   └── images/               # Blair Mountain historical photos
    └── src/
        ├── app.html
        ├── app.css
        ├── lib/
        │   ├── supabase.js       # Supabase client singleton
        │   ├── utils.js          # Date formatting, vote colors, status labels
        │   └── components/
        │       ├── BillCard.svelte
        │       ├── BillStatusBadge.svelte
        │       ├── MemberCard.svelte
        │       ├── VoteTable.svelte
        │       ├── DigestCard.svelte
        │       ├── TagPill.svelte
        │       ├── PartyBadge.svelte
        │       ├── SearchBar.svelte
        │       └── Pagination.svelte
        └── routes/
            ├── +layout.svelte
            ├── +page.svelte          # Home / dashboard
            ├── +page.server.js
            ├── bills/
            │   ├── +page.svelte      # Bills list
            │   ├── +page.server.js
            │   └── [id]/
            │       ├── +page.svelte  # Bill detail
            │       └── +page.server.js
            ├── members/
            │   ├── +page.svelte      # Member directory
            │   ├── +page.server.js
            │   └── [id]/
            │       ├── +page.svelte  # Member profile
            │       └── +page.server.js
            ├── find/
            │   ├── +page.svelte      # Find my rep
            │   └── +page.server.js
            ├── digests/
            │   └── +page.svelte
            ├── about/
            │   └── +page.svelte
            └── api/
                ├── ask/+server.js         # Claude-powered Q&A endpoint
                └── sync-status/+server.js # Last sync run info
```

---

## Local Setup

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd canary-blair
```

### 2. Install dependencies

Install pipeline dependencies from the repo root:

```bash
npm install
```

Install frontend dependencies:

```bash
cd canary-blair-app
npm install
cd ..
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and add your API keys (see [Environment Variables Reference](#environment-variables-reference) below). Also copy it into the app directory for the frontend dev server:

```bash
cp .env canary-blair-app/.env
```

### 4. Apply the database schema

Open your [Supabase project's SQL editor](https://app.supabase.com/) and run the migration files in order:

```
schema/001_initial.sql
schema/002_scoring_columns.sql
schema/003_text_change_detection.sql
schema/004_active_bills_view_archived.sql
schema/005_refresh_passed_bills_view.sql
```

Paste each file's contents into the SQL editor and click **Run**. After each file, you should see no errors. After `001_initial.sql`, you can verify the tables were created by checking the **Table Editor** in your Supabase dashboard.

### 5. Run the initial data sync

The first sync pulls the full current WV legislative session from LegiScan — all members, all bills, all votes. This is a one-time operation that uses roughly 2,000–3,000 LegiScan API queries.

```bash
npm run bootstrap
```

This runs `pipeline/bootstrap.js`, which performs the full initial load. It will take several minutes. Watch the console for progress output.

After the bootstrap completes, verify your data in Supabase:

```sql
SELECT COUNT(*) FROM sessions;   -- Should be 1+ rows
SELECT COUNT(*) FROM members;    -- Should be ~134 (100 delegates + 34 senators)
SELECT COUNT(*) FROM bills;      -- Should be 1,000–2,000+ bills
SELECT COUNT(*) FROM votes;      -- Should be tens of thousands of votes
SELECT * FROM sync_log ORDER BY run_at DESC LIMIT 5;
```

After the initial sync, run the AI summarization pipeline on a sample of bills to verify your Anthropic API key works:

```bash
node pipeline/test-ai.js
```

Then calculate Canary Scores for all members:

```bash
node pipeline/score.js
```

### 6. Start the dev server

```bash
cd canary-blair-app
npm run dev
```

The app will be available at `http://localhost:5173`. Open it in your browser and verify:

- The home page loads with real session stats
- The bills list shows actual WV bills
- At least some bills show AI summaries
- Member profiles load with vote stats and Canary Scores

---

## Running the Pipeline Locally

The data pipeline consists of several Node.js scripts you can run manually during development. All scripts load secrets from `.env` via `dotenv`.

### Daily sync (LegiScan → Supabase)

Fetches any bills that changed since the last run using the `change_hash` delta system. On a normal legislative day this touches 5–50 bills, not all 2,000. This keeps API usage well within the 30k/month free tier.

```bash
node pipeline/test-sync.js
```

### AI summarization

Summarizes bills that have text but no AI summary yet. Run this after a sync to catch any new or updated bills.

```bash
node pipeline/test-ai.js
```

### Canary Score recalculation

Recalculates scores for all members based on the latest bill classifications and vote records. Run weekly, or any time you want fresh scores.

```bash
node pipeline/score.js
```

### Cron schedule (production)

When deployed to Cloudflare, the pipeline runs on this schedule automatically:

| Time (UTC) | Job |
|-----------|-----|
| 6:00am daily | LegiScan sync |
| 7:00am daily | Daily session digest |
| 7:00am Monday | Weekly session digest |
| 8:00am Sunday | Member AI profile refresh |
| 9:00am Sunday | Canary Score recalculation |

---

## Deployment

Deployment requires a [Cloudflare account](https://cloudflare.com/) and the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally.

### Deploy the sync worker

```bash
wrangler deploy pipeline/sync.js --config wrangler-sync.toml
wrangler secret put LEGISCAN_API_KEY --name canary-blair-sync
wrangler secret put SUPABASE_URL --name canary-blair-sync
wrangler secret put SUPABASE_SERVICE_KEY --name canary-blair-sync
wrangler secret put SYNC_SECRET --name canary-blair-sync
```

### Deploy the AI worker

```bash
wrangler deploy pipeline/ai-worker.js --config wrangler-ai.toml
wrangler secret put ANTHROPIC_API_KEY --name canary-blair-ai
wrangler secret put SUPABASE_URL --name canary-blair-ai
wrangler secret put SUPABASE_SERVICE_KEY --name canary-blair-ai
```

After the AI worker is deployed, grab its URL from the Cloudflare dashboard and set it on the sync worker so it can queue bills for summarization:

```bash
wrangler secret put AI_QUEUE_URL --name canary-blair-sync
# When prompted, enter: https://canary-blair-ai.<your-subdomain>.workers.dev
```

### Deploy the frontend

```bash
cd canary-blair-app
npm run build
wrangler pages deploy .svelte-kit/cloudflare --project-name canary-blair
```

Then in the **Cloudflare Pages** dashboard, set these environment variables under Settings → Environment Variables:

```
PUBLIC_SUPABASE_URL=        your Supabase project URL
PUBLIC_SUPABASE_ANON_KEY=   your Supabase anon key (safe to expose — RLS protects data)
ANTHROPIC_API_KEY=          your Anthropic key (for the server-side /api/ask endpoint)
```

### Trigger a manual sync to verify

```bash
curl -X POST https://canary-blair-sync.<your-subdomain>.workers.dev \
  -H "Authorization: Bearer YOUR_SYNC_SECRET"
```

Check `sync_log` in Supabase to confirm the run completed.

### Connect a custom domain

In the Cloudflare Pages dashboard, go to your project → Custom Domains and add your domain. Point your domain's nameservers to Cloudflare (recommended for full integration) or add a CNAME record if you manage DNS elsewhere.

---

## Environment Variables Reference

Copy `.env.example` to `.env` and fill in your values. Never commit `.env`.

```bash
# ── Sync Worker ──────────────────────────────────────────────
LEGISCAN_API_KEY=       # Free at legiscan.com/legiscan — get from account dashboard
SUPABASE_URL=           # e.g. https://abcdefghijkl.supabase.co
SUPABASE_SERVICE_KEY=   # Service role key — bypasses RLS; keep this secret
SYNC_SECRET=            # A random string you generate — protects the manual HTTP trigger
AI_QUEUE_URL=           # Set this AFTER deploying the AI worker (its worker URL)

# ── AI Worker ────────────────────────────────────────────────
ANTHROPIC_API_KEY=      # From console.anthropic.com

# ── SvelteKit Frontend ───────────────────────────────────────
PUBLIC_SUPABASE_URL=        # Same as SUPABASE_URL — safe to expose, used client-side
PUBLIC_SUPABASE_ANON_KEY=   # Anon key from Supabase — safe to expose; RLS enforces access
```

**Security rules:**
- `SUPABASE_SERVICE_KEY` is only used in Workers (server-side). It bypasses Row Level Security. Never expose it in the frontend.
- `ANTHROPIC_API_KEY` is only used in Workers and in the SvelteKit server endpoint (`/api/ask`). It is never sent to the browser.
- `PUBLIC_*` variables are intentionally client-safe. They are embedded in the frontend bundle.

---

## Database Schema

The schema is fully defined in `schema/001_initial.sql` with subsequent migrations in the numbered files. Key tables:

| Table | Description |
|-------|-------------|
| `sessions` | WV legislative sessions with year and status |
| `members` | All WV legislators — House and Senate, current and historical |
| `bills` | Every bill ever introduced, with AI summary fields and Canary Score data |
| `bill_sponsors` | Many-to-many relationship between bills and members |
| `roll_calls` | A vote event — one per chamber vote on a bill, with aggregate yea/nay/absent counts |
| `votes` | Every individual legislator's vote on every roll call — **never deleted, ever** |
| `bill_actions` | Complete action history for each bill (referrals, readings, amendments) |
| `member_sessions` | Which sessions each member served in |
| `session_digests` | AI-generated legislative summaries by period |
| `sync_log` | Audit trail of every pipeline run |

Pre-built views (do not recreate):

| View | Description |
|------|-------------|
| `member_vote_summary` | Per-member vote stats: total, yea_count, nay_count, yea_pct, etc. |
| `active_bills` | Bills with status 1, 2, or 3 (in progress) |
| `passed_bills` | Bills with status 4 (passed), ordered by date |

**Row Level Security:** The public can `SELECT` from all tables. No public `INSERT`, `UPDATE`, or `DELETE`. The service role key (used only in Workers) bypasses RLS.

---

## Core Values

These values are reflected in every technical decision in this codebase:

- **Privacy-first.** No user tracking. No analytics. No ads. No accounts required to read anything. No cookies beyond what SvelteKit uses for server-side rendering.

- **Radical accessibility.** Plain language. Mobile-first. Works on slow connections. System fonts only (no external font loading). Dark mode default with light mode support.

- **Nothing is ever deleted.** No `DELETE` statements exist in this codebase. Votes are permanent. Bills are archived, not removed. The `is_archived` flag is the only way anything "goes away." *We shall never forget.*

- **Zero exploitation.** No dark patterns. No monetization. No paywalls. Free forever.

- **Transparency.** The Canary Score methodology is fully documented and displayed in the app. No editorial decisions are hidden. The source code is public.

---

## Data Sources

Legislative data is provided by **[LegiScan](https://legiscan.com/)**, a nonpartisan, non-governmental service that tracks legislation in all 50 U.S. states and the U.S. Congress. LegiScan provides a free API with a 30,000 query/month limit under their standard terms.

Canary Blair's sync pipeline uses a **change-hash delta approach** — it only fetches full bill details when a bill has actually changed, keeping API usage far below the monthly limit even during active legislative sessions.

Historical photo attribution for Blair Mountain imagery is included in the About page.

---

## Privacy Policy

Canary Blair collects no personal data. Period.

- No user accounts
- No cookies (beyond ephemeral session handling by SvelteKit)
- No analytics trackers
- No advertising networks
- No third-party scripts that phone home
- No logging of IP addresses or search queries

The Q&A feature (`/api/ask`) sends your typed question to the Anthropic API server-side. The question is not stored. No identifying information about you is included in the API call.

All data displayed on this site comes from public government records via LegiScan.

---

## License

Canary Blair is free and open source. Use it, fork it, run it for your own state.

The canary is still singing. Build accordingly.
