# Canary Blair

> *The canary watched for poison so the miners could survive. We do the same — for democracy.*

[![CI](https://github.com/quetzal-hub/canary-blair/actions/workflows/ci.yml/badge.svg)](https://github.com/quetzal-hub/canary-blair/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![Built with SvelteKit](https://img.shields.io/badge/built%20with-SvelteKit-ff3e00.svg)](https://kit.svelte.dev/)

**Canary Blair** is a free, anonymous, open-source civic-accountability progressive web app (PWA) for West Virginia residents. It tracks every bill, every vote, and every legislator in the WV state legislature, summarizes them in plain language using AI, and makes that information radically accessible to ordinary people with no political or legal background — then scores each legislator on how they actually vote.

The name comes from two pieces of West Virginia history: **Blair Mountain** (site of the 1921 miners' uprising, the largest armed labor revolt in U.S. history) and the **coal-mine canary** (an early warning system for poison gas). Canary Blair is the spirit of that fight — still watching, still singing.

---

## Table of Contents

- [Features](#features)
- [The Canary Score](#the-canary-score)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Running the Pipeline Locally](#running-the-pipeline-locally)
- [Deployment](#deployment)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Schema](#database-schema)
- [Core Values](#core-values)
- [Data Sources & Accuracy](#data-sources--accuracy)
- [Privacy Policy](#privacy-policy)
- [Run It For Your Own State](#run-it-for-your-own-state)
- [Continuous Integration](#continuous-integration)
- [Contributing](#contributing)
- [License](#license)

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
- **"How we got this number"** — an expandable audit trail listing every scored vote with the exact points it added or subtracted, so anyone can verify the score is math, not opinion
- **Score-over-time chart** — a permanent history of the legislator's Canary Score; once a session adjourns, that score is locked and can never be revised away
- Complete sponsored bills list
- Paginated full vote history, filterable by Yea / Nay / NV / Absent
- Bills whose AI classification a human reviewed and corrected are marked with a ✏️ note

**RSS Feeds (`/feeds`)**
- Anonymous, account-free way to follow the legislature — the right alert channel for a no-tracking project
- Per-legislator feed (every vote as it happens), per-topic feed (`/feeds/tag/water.xml`), and a legislative-digest feed
- Auto-discoverable via `<link rel="alternate">` on member pages

**Session Digests**
- AI-generated summaries of legislative activity, displayed on the home page
- Generated daily, weekly, monthly, and yearly by the AI worker cron
- "What happened this week in the WV legislature" — written for humans, not lawyers

**Find My Rep (`/find`)**
- Enter a street address and get your exact House and Senate districts via the U.S. Census Bureau geocoder — no login, nothing stored
- Falls back to a city/ZIP approximation when no street address is given
- Returns your legislators' cards, Canary Scores and all

**About (`/about`)**
- Mission statement and the Blair Mountain history
- How the data is collected (LegiScan attribution)
- How the Canary Score is calculated, tier by tier and badge by badge
- Full privacy policy

---

## The Canary Score

Every WV legislator gets a **Canary Score** from 0–100, calculated mathematically from their own voting record. It is not editorial. There are no human judgment calls. It is math applied to their public record.

| Score | Tier | Name | Tagline |
|-------|------|------|---------|
| 80–100 | ✨ | Mountaineer | *"Votes like they actually live here."* |
| 60–79 | 🌱 | Friend of the Holler | *"Not perfect, but they're trying."* |
| 45–59 | 🌫️ | Weathervane | *"Blows whichever way the lobby goes."* |
| 35–44 | 🪨 | Company Man | *"Reliable — just not for you."* |
| 20–34 | 🐀 | Rat in the Capitol | *"Actively working against the people who elected them."* |
| 0–19 | ☠️ | Owned | *"Congratulations to their donors on their investment."* |

**How it works:** Every bill gets an AI-assigned alignment (`for_people`, `for_capital`, or `neutral`) and an impact tier from 1 (Landmark, weighted 5×) to 6 (Ceremonial, weighted 0.25×). Votes on aligned bills earn or lose points scaled by the bill's impact weight; skipping a vote costs a small penalty. Sponsorship counts even more than voting — primary sponsors get 3× weight, cosponsors 1.5× — because putting your name on a bill is a stronger signal than going along with a floor vote. The combined raw score is normalized to 0–100. Members need at least 20 scored votes before receiving a score, and scores are recalculated automatically whenever bills change and weekly on a full refresh.

**Every score is auditable and permanent.** Each member profile has a "How we got this number" breakdown listing every scored vote and the exact points it contributed — the score is math you can check, not an opinion. Scores are also snapshotted to a permanent history on every recalculation, so once a session adjourns a legislator's tier is locked and cannot be revised away. When the AI misclassifies a bill, a human can correct it with an audit-trailed, publicly-flagged override rather than silently re-running the model.

**Badges** are awarded in addition to the tier score, earned over a legislator's whole career (not one session):
- 🦅 **Lone Canary** — Voted against their party's majority on a people-first bill at least 3 times
- 👻 **Ghost** — NV or Absent on more than 25% of all votes
- 📈 **Most Improved** — Canary Score increased 15+ points vs. previous session
- 💰 **Never Met a Corporation They Didn't Like** — 90%+ of corporate-interest votes were Yea
- 🔒 **Lockstep** — Voted with their party 95%+ of the time on scored bills
- 💧 **Water Protector** — Consistently votes for water/environment bills and against the ones that weaken them
- 👷 **Friend of the Worker** — Consistently votes for worker-protection bills and against the ones that weaken them
- 🌞 **Renewables Champion** — Consistently votes for clean and renewable energy, and against fossil-fuel giveaways

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Database | [Supabase](https://supabase.com/) (PostgreSQL) | Free tier, generous limits, Postgres underneath, Row Level Security built in |
| Sync pipeline | [Cloudflare Workers](https://workers.cloudflare.com/) + cron trigger | Free tier, runs at edge, no server to manage |
| AI pipeline | Cloudflare Workers + [Anthropic API](https://anthropic.com/) | Same infrastructure; Claude Sonnet for bill classification, summaries, member profiles, and digests, with prompt caching on the static instructions. The model is a one-line setting in [pipeline/lib/ai-config.js](pipeline/lib/ai-config.js). |
| Frontend | [SvelteKit](https://kit.svelte.dev/) PWA | Lightweight, fast, excellent PWA support, SSR for SEO |
| Deployment | [Cloudflare Pages](https://pages.cloudflare.com/) | Free, global CDN, integrates with Workers |
| Data source | [LegiScan API](https://legiscan.com/) | Free tier, covers all 50 states, reliable legislative data |

---

## Prerequisites

You will need accounts and API keys from these services before you can run Canary Blair. All have free tiers sufficient for this project.

| Requirement | Where to get it | Notes |
|------------|----------------|-------|
| **Node.js 20+** | [nodejs.org/en/download](https://nodejs.org/en/download/) | Runs the frontend and pipeline scripts. **CI and the test runner use Node 22** — the scoring tests rely on the built-in test runner's glob support (Node ≥ 21), so use 22 if you'll run `npm test`. |
| **npm 9+** | Included with Node.js | — |
| **Wrangler CLI** | `npm install -g wrangler` | Cloudflare's CLI for deploying and testing Workers |
| **Supabase account** | [supabase.com](https://supabase.com/) | Free. Create a new project. You need the project URL and both the anon key and the service role key. |
| **LegiScan API key** | [legiscan.com/legiscan](https://legiscan.com/legiscan) | Free. Register, then get your API key from your account dashboard. The free tier gives 30,000 queries/month — more than enough. |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com/) | Powers AI bill summarization, member profiles, and session digests. |
| **Cloudflare account** | [cloudflare.com](https://cloudflare.com/) | Free. Required for deployment only — not needed to run locally. |

---

## Project Structure

```
canary-blair/
├── .env                          # Your secrets (never committed)
├── .env.example                  # Template — copy this to .env
├── .gitignore
├── LICENSE                       # GNU AGPL v3.0
├── package.json                  # Pipeline-level package (dotenv, etc.)
├── wrangler-sync.toml            # Cloudflare config for the sync worker
├── wrangler-ai.toml              # Cloudflare config for the AI worker
│
├── .github/
│   └── workflows/
│       └── ci.yml                # CI: scoring tests + app lint/build on every push
│
├── schema/
│   ├── 001_initial.sql           # Full database schema — apply this first
│   ├── 002_scoring_columns.sql   # Canary Score columns for members table
│   ├── 003_text_change_detection.sql
│   ├── 004_active_bills_view_archived.sql
│   ├── 005_refresh_passed_bills_view.sql
│   ├── 006_canary_score_rpc.sql  # Bulk score-write RPC
│   ├── 007_score_history.sql     # Permanent per-session score history
│   └── 008_ai_overrides.sql      # Human override columns for AI misclassifications
│
├── pipeline/
│   ├── lib/
│   │   ├── scoring.js            # Shared Canary Score engine (single source of truth)
│   │   ├── state-config.js       # Per-state config (name, industries, tier names) — fork here
│   │   └── ai-config.js          # Claude model choice (one line), shared by all AI scripts
│   ├── test/
│   │   └── scoring.test.js       # Unit tests locking down the scoring math
│   ├── sync.js                   # LegiScan → Supabase sync (Cloudflare Worker)
│   ├── ai-worker.js              # AI summarization worker (Cloudflare Worker)
│   ├── score.js                  # Canary Score CLI runner (uses lib/scoring.js)
│   ├── summarize.js              # Bill summarization logic
│   ├── profiles.js               # Member profile generation logic
│   ├── bootstrap.js              # One-time full data load
│   ├── test-sync.js              # Local test runner for the sync worker
│   └── test-ai.js                # Local test runner for the AI worker
│
└── canary-blair-app/             # SvelteKit PWA
    ├── svelte.config.js
    ├── vite.config.js            # Aliases $stateConfig → pipeline/lib/state-config.js
    ├── eslint.config.js
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
        │       ├── ScoreBreakdown.svelte   # "How we got this number" audit trail
        │       ├── ScoreHistory.svelte      # Score-over-time sparkline
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
            │   ├── +page.svelte      # Find my rep (address → Census geocoder → districts)
            │   └── +page.server.js
            ├── feeds/
            │   ├── +page.svelte              # Human-readable RSS index
            │   ├── digest.xml/+server.js     # Legislative digest feed
            │   ├── member/[id].xml/+server.js # Per-legislator vote feed
            │   └── tag/[tag].xml/+server.js   # Per-topic bill feed
            ├── digests/
            │   └── +page.svelte
            ├── about/
            │   └── +page.svelte
            └── api/
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
schema/006_canary_score_rpc.sql          # bulk score-write RPC
schema/007_score_history.sql             # permanent per-session score history
schema/008_ai_overrides.sql              # human override columns for AI misclassifications
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

Recalculates scores for all members based on the latest bill classifications and vote records. Run weekly, or any time you want fresh scores. The CLI and the deployed worker share the exact same engine ([pipeline/lib/scoring.js](pipeline/lib/scoring.js)), so local and production scores can never drift.

```bash
npm run score
```

### Scoring engine tests

The scoring algorithm is locked down by unit tests with hand-computed fixtures. Run them before touching anything in `pipeline/lib/scoring.js`:

```bash
npm test
```

### Cron schedule (production)

When deployed to Cloudflare, the pipeline runs on this schedule automatically:

| Time (UTC) | Job |
|-----------|-----|
| 6:00am daily | LegiScan sync |
| 7:00am daily | Sweep of unsummarized bills (retries failures/deferrals), then daily digest |
| 7:00am Monday | Weekly session digest |
| 7:00am 1st of month | Monthly session digest |
| 7:00am Jan 2 | Yearly session digest |
| 8:00am Sunday | Canary Score recalculation + member AI profile refresh |

Scores are also recalculated automatically whenever the sync worker hands new bills to the AI worker. Each AI worker invocation summarizes at most 25 bills; anything beyond that is picked up by the daily sweep, so a huge sync day can't blow past Cloudflare Worker limits.

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
- `ANTHROPIC_API_KEY` is only used in the AI worker (server-side). It is never sent to the browser.
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

## Data Sources & Accuracy

Legislative data is provided by **[LegiScan](https://legiscan.com/)**, a nonpartisan, non-governmental service that tracks legislation in all 50 U.S. states and the U.S. Congress. LegiScan provides a free API with a 30,000 query/month limit under their standard terms. Their attribution is displayed in the app footer, as their terms require.

Canary Blair's sync pipeline uses a **change-hash delta approach** — it only fetches full bill details when a bill has actually changed, keeping API usage far below the monthly limit even during active legislative sessions.

**On accuracy.** Vote and sponsorship records come straight from the public legislative record and are reproduced verbatim. The Canary Score is deterministic math on that record — but the *bill classification* it depends on (alignment and impact tier) is AI-generated and imperfect. The project is built to be honest about that: every score links to the votes behind it, the disclaimer appears on every surface a score does, and a human can override a misclassified bill through an audit-trailed mechanism that displays a "manually reviewed" note. Across hundreds of votes, the pattern holds even when an individual bill is miscategorized.

Historical photo attribution for the Blair Mountain imagery is included on the About page.

---

## Privacy Policy

Canary Blair collects no personal data. Period.

- No user accounts
- No cookies (beyond ephemeral session handling by SvelteKit)
- No analytics trackers
- No advertising networks
- No third-party scripts that phone home
- No logging of IP addresses or search queries

All data displayed on this site comes from public government records via LegiScan.

---

## Run It For Your Own State

Canary Blair is built to be forked. LegiScan covers all 50 states, and every
West-Virginia-specific value flows from a single file —
[pipeline/lib/state-config.js](pipeline/lib/state-config.js). The scoring engine, the
AI prompts, the sync worker, and the entire frontend all read from it, so retargeting
to another state is a config edit plus a rewrite of the editorial copy. You never touch
the scoring algorithm.

### Step 1 — Fork and edit the config

Fork the repo and open [pipeline/lib/state-config.js](pipeline/lib/state-config.js).
Every field below feeds real behavior:

| Field | What it drives | Example (Texas) |
|-------|---------------|-----------------|
| `code` | LegiScan state code — the sync + bootstrap query, and the address lookup | `'TX'` |
| `name` | Site copy and every AI prompt | `'Texas'` |
| `demonym` / `demonymSingular` | AI prompt phrasing ("ordinary Texans…") | `'Texans'` / `'Texas resident'` |
| `legislatureName`, `lowerChamber`, `upperChamber` | Labels | `'Texas Legislature'`, `'House of Representatives'`, `'Senate'` |
| `voterRegistrationUrl` | The "Register to Vote" link in the nav | your Secretary of State URL |
| `extractiveIndustries` | Injected into the alignment prompt so the AI knows which local sectors count as "capital" | `'oil and gas operators'` |
| `localStakesNote` | One clause in the "who is hurt" guidance that raises the weight on your state's known harms | your state's environmental/health context |
| `tiers` | The six Canary tier names, emoji, taglines, and score thresholds — shown on cards, profiles, and the About page, and written to the database | rename to your state's voice |

**On the tiers:** keep the six-tier structure (the color design and the score math assume
six ranks 1–6), but the names and taglines are your editorial voice — "Mountaineer" and
"Friend of the Holler" are West Virginia. You can also shift the `min` thresholds; the
frontend colors and the tier-boundary test both derive from them, so nothing else needs
to change.

### Step 2 — Rewrite the editorial content

The config can't write your state's story. These are intentional prose/imagery, not
config, so edit them by hand:

- **[about/+page.svelte](canary-blair-app/src/routes/about/+page.svelte)** — the Blair
  Mountain history, the canary metaphor, and the mission. Replace with your state's own
  labor/civic history.
- **[static/images/](canary-blair-app/static/images/)** — the Blair Mountain photos.
  Swap in your own (and update the `<figcaption>`s and `alt` text).
- **[+layout.svelte](canary-blair-app/src/routes/+layout.svelte)** — the footer tagline
  ("Named for the canary and the mountain") and, if you rename the project, the brand text.
- The project name "Canary Blair" itself appears in page `<title>`s and the AI prompts'
  persona line — rename if you want your own identity.

### Step 3 — Stand up your own infrastructure

Follow the [Local Setup](#local-setup) and [Deployment](#deployment) sections with your
own accounts: a new Supabase project (apply all migrations in [schema/](schema/)), your
own [LegiScan](https://legiscan.com/legiscan) key (the free tier covers any single state),
an Anthropic key, and your own Cloudflare project. Set the same environment variables —
nothing there is WV-specific.

### Step 4 — Bootstrap and verify

```bash
npm run bootstrap          # full initial load for your state (uses STATE_CONFIG.code)
node pipeline/test-ai.js   # summarize a few bills — check the AI names your state
npm run score              # calculate Canary Scores
npm test                   # tier-boundary + scoring tests (config-aware, should stay green)
```

If the AI summaries mention your state and your industries, and the scores populate,
you have an accountability tracker for your own legislature.

---

## Continuous Integration

Every push and pull request runs [.github/workflows/ci.yml](.github/workflows/ci.yml) on
GitHub Actions (Node 22), in two jobs:

- **Pipeline** — the scoring-engine unit tests (`npm test`). These are the guardrail on
  the math that assigns public labels to elected officials; they must stay green.
- **App** — the frontend lint (`npm run lint`) and a full production build.

The status badge at the top of this README reflects the latest run on `main`.

---

## Contributing

Contributions are welcome — this is civic infrastructure meant to be run and improved by
anyone.

1. **Fork and branch.** Work on a feature branch, not `main`.
2. **Keep the checks green.** Before opening a PR, run the same checks CI does:
   ```bash
   npm test                          # scoring engine
   cd canary-blair-app && npm run lint && npm run build
   ```
3. **Never weaken the scoring guarantees.** If you change anything in
   [pipeline/lib/scoring.js](pipeline/lib/scoring.js), add or update a test in
   [pipeline/test/scoring.test.js](pipeline/test/scoring.test.js) that pins the new
   behavior. The score labels real people; the math has to be defensible.
4. **Don't commit secrets.** `.env` is git-ignored — keep it that way. Report security
   issues privately rather than in a public issue.

If you're adapting the project for another state rather than contributing upstream, see
[Run It For Your Own State](#run-it-for-your-own-state).

---

## License

Canary Blair is licensed under the **GNU Affero General Public License v3.0**
([LICENSE](LICENSE)). AGPL was chosen deliberately: because the whole point is
transparency, any fork — including one run as a hosted service — must keep its source
open. Use it, fork it, run it for your own state; just keep it free for the people.

The canary is still singing. Build accordingly.
