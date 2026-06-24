# CANARY BLAIR — Canary Score System Spec

## Overview

Every WV legislator gets a **Canary Score** from 0–100.

- **100** = breathing clean air. Votes for people, consistently.
- **0** = owned. Votes for capital, extraction, and corporate interest. Every time.

The score is calculated from real voting data, cross-referenced with the AI-generated
tags on every bill. It is not editorial. It is math applied to their own record.

The score determines the member's **Canary Tier** — a permanent public label displayed
on their profile and in the member directory.

---

## The Canary Tiers

| Score | Tier | Name | Tagline |
|-------|------|------|---------|
| 85–100 | ✨ Tier 1 | **Mountaineer** | *"Votes like they actually live here."* |
| 65–84  | 🌱 Tier 2 | **Friend of the Holler** | *"Not perfect, but they're trying."* |
| 45–64  | 🌫️ Tier 3 | **The Fence Sitter** | *"Which way is the wind blowing today?"* |
| 25–44  | 🪨 Tier 4 | **The Company Man** | *"Reliable — just not for you."* |
| 10–24  | 🐀 Tier 5 | **The Rat in the Capitol** | *"Actively working against the people who elected them."* |
| 0–9    | ☠️ Tier 6 | **Owned** | *"Congratulations to their donors on their investment."* |

---

## Scoring Algorithm

### Step 1: Categorize bills into FOR_PEOPLE and FOR_CAPITAL buckets

Using the `ai_tags` already on every bill, classify each bill as:

**FOR_PEOPLE tags** (bills that benefit ordinary residents):
```
workers, education, healthcare, environment, water, public-safety,
housing, civil-rights, children, elderly, voting-rights, agriculture
```

**FOR_CAPITAL tags** (bills that benefit extractive or corporate interests):
```
corporations, coal, energy
```

A bill can be in both buckets if it has tags from both lists — that's fine,
it will be scored in both contexts.

Bills with no tags in either list are **NEUTRAL** and excluded from scoring.
Bills tagged `taxes`, `budget`, `infrastructure`, `local-government`, `religion`,
`guns`, `criminal-justice`, `family` are **NEUTRAL** by default — too ambiguous
to score without deeper analysis.

### Step 2: Score each vote on a categorized bill

For each vote a member cast on a FOR_PEOPLE or FOR_CAPITAL bill:

```
FOR_PEOPLE bill:
  Voted Yea     → +2 points
  Voted Nay     → -2 points
  NV or Absent  → -0.5 points (soft penalty for not showing up)

FOR_CAPITAL bill:
  Voted Yea     → -2 points
  Voted Nay     → +2 points
  NV or Absent  → -0.5 points
```

### Step 3: Apply the ai_who_benefits / ai_who_is_hurt multiplier

If a bill has both `ai_who_benefits` and `ai_who_is_hurt` populated, apply a
weight multiplier to the vote score:

- If `ai_who_benefits` mentions corporations, industry, coal, gas, or energy companies → multiply FOR_CAPITAL score by 1.5
- If `ai_who_is_hurt` mentions workers, residents, children, elderly, environment → multiply FOR_PEOPLE score by 1.5

This rewards/penalizes votes on the most consequential bills more heavily.
Bills without this AI data use the base score only.

### Step 4: Calculate raw score

```
raw_score = sum of all scored votes for this member
max_possible = (total scored votes) × 2   // if they voted Yea on every FOR_PEOPLE bill and Nay on every FOR_CAPITAL bill
min_possible = (total scored votes) × -2
```

### Step 5: Normalize to 0–100

```
canary_score = ((raw_score - min_possible) / (max_possible - min_possible)) × 100
canary_score = Math.round(Math.min(100, Math.max(0, canary_score)))
```

### Step 6: Minimum vote threshold

A member must have at least **20 scored votes** (votes on FOR_PEOPLE or FOR_CAPITAL
bills) before they receive a score. Members below this threshold display:
- Score: `null`
- Tier: `🥚 Unscored` — *"Not enough data yet. Watch this space."*

---

## Badges

Badges are awarded in addition to the tier. A member can hold multiple badges.
Display them as small pills on the member profile and card.

### 🦅 "Lone Canary"
Voted against their own party's majority on a FOR_PEOPLE bill.
Must have done this at least 3 times.
*"Rare. Worth noting."*

### 👻 "Ghost"
NV or Absent on more than 25% of all votes.
*"Can't hurt you if they're never there. Can't help you either."*

### 📈 "Most Improved"
Canary Score increased by 15+ points compared to their score from the previous session.
*"Something changed. Keep watching."*

### 💰 "Never Met a Corporation They Didn't Like"
90%+ of their FOR_CAPITAL votes were Yea.
*"Consistent, at least."*

### 🔒 "Lockstep"
Voted with their party 95%+ of the time on scored bills.
No independent judgment detected.
*"A reliable vote. For someone."*

### 💧 "Water Protector"
Voted Yea on 80%+ of bills tagged `water` or `environment`.
*"Someone has to."*

### 👷 "Friend of the Worker"
Voted Yea on 80%+ of bills tagged `workers`.
*"Remembers who does the actual work."*

---

## Database changes required

Add these columns to the `members` table:

```sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_score INTEGER;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_tier INTEGER;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_badges TEXT[];
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_score_updated_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS canary_votes_scored INTEGER DEFAULT 0;
```

`canary_tier` stores the tier number (1–6) as an integer. Tier name and emoji
are derived in the frontend from the number — never stored as text.

---

## New file: `pipeline/score.js`

Create `pipeline/score.js` as a standalone Node.js ESM script.
It is run by the AI worker on a schedule (weekly, after member profiles refresh).
It can also be triggered manually.

### What it does

1. Loads all bills with `ai_tags`, `ai_who_benefits`, `ai_who_is_hurt` from Supabase
2. Classifies each bill into FOR_PEOPLE / FOR_CAPITAL / NEUTRAL buckets
3. Loads all votes joined to their bill's tags
4. For each member: calculates raw score, normalizes to 0–100, assigns tier
5. Calculates badges
6. Writes `canary_score`, `canary_tier`, `canary_badges`, `canary_votes_scored`,
   `canary_score_updated_at` back to the `members` table

### Script structure

```js
import 'dotenv/config'

const FOR_PEOPLE_TAGS = [
  'workers', 'education', 'healthcare', 'environment', 'water',
  'public-safety', 'housing', 'civil-rights', 'children', 'elderly',
  'voting-rights', 'agriculture'
]

const FOR_CAPITAL_TAGS = [
  'corporations', 'coal', 'energy'
]

const TIER_THRESHOLDS = [
  { min: 85, tier: 1, name: 'Mountaineer',              emoji: '✨', tagline: 'Votes like they actually live here.' },
  { min: 65, tier: 2, name: 'Friend of the Holler',    emoji: '🌱', tagline: 'Not perfect, but they\'re trying.' },
  { min: 45, tier: 3, name: 'The Fence Sitter',        emoji: '🌫️', tagline: 'Which way is the wind blowing today?' },
  { min: 25, tier: 4, name: 'The Company Man',         emoji: '🪨', tagline: 'Reliable — just not for you.' },
  { min: 10, tier: 5, name: 'The Rat in the Capitol',  emoji: '🐀', tagline: 'Actively working against the people who elected them.' },
  { min: 0,  tier: 6, name: 'Owned',                   emoji: '☠️', tagline: 'Congratulations to their donors on their investment.' },
]

function getTier(score) {
  for (const t of TIER_THRESHOLDS) {
    if (score >= t.min) return t
  }
  return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]
}
```

### Supabase queries needed

```js
// 1. All bills with tags and AI benefit/hurt fields
// GET /rest/v1/bills?select=id,ai_tags,ai_who_benefits,ai_who_is_hurt&ai_tags=not.is.null

// 2. All votes joined to their bill
// GET /rest/v1/votes?select=member_id,vote_value,bill_id

// 3. All members
// GET /rest/v1/members?select=id,full_name,party,chamber

// 4. For badges: party vote patterns require roll_calls join
// GET /rest/v1/votes?select=member_id,vote_value,roll_call_id,roll_calls(passed)
```

### Running the scorer

```bash
node pipeline/score.js
```

Expected output:
```
🐦 Canary Score calculation starting...
📊 Loaded 1,847 bills — 412 FOR_PEOPLE, 287 FOR_CAPITAL, 1,148 NEUTRAL
🗳️  Loaded 48,291 votes
👥 Scoring 134 members...
✅ Scores written.

Top 5 Canary Scores:
  1. [Name] — 91 ✨ Mountaineer
  2. [Name] — 88 ✨ Mountaineer
  3. [Name] — 79 🌱 Friend of the Holler
  ...

Bottom 5 Canary Scores:
  130. [Name] — 8  ☠️  Owned
  131. [Name] — 6  ☠️  Owned
  132. [Name] — 4  ☠️  Owned
  ...
```

---

## Frontend changes required

### Member directory (`/members`)

- Add a **Canary Score leaderboard toggle**: default sort is by score DESC
- Each member card shows:
  - Canary Score as a number (large, prominent)
  - Tier emoji + tier name below the score
  - Badges as small pills if any
- Add a filter: filter by tier (dropdown: All / Tier 1 / Tier 2 / etc.)

### Member profile (`/members/[id]`)

- Prominent score display at the top of the profile:
  ```
  ☠️ OWNED
  Canary Score: 4 / 100
  "3Congratulations to their donors on their investment."
  ```
- Score breakdown section:
  - "Scored votes: 312"
  - "Bills benefiting people: voted Yea N times, Nay N times"
  - "Bills benefiting corporations: voted Yea N times, Nay N times"
- Badges section with description of each badge earned
- Small note at bottom: "Score calculated from AI-tagged bill votes. Updated weekly."

### Home page (`/`)

- Add a "Hall of Shame / Hall of Fame" section:
  - Top 3 scores (Friend of the Holler or above)
  - Bottom 3 scores (Rat in the Capitol or below)
  - Links to their profiles

---

## Scheduling

Add score recalculation to the AI worker cron schedule.
Run it every Sunday at 9am UTC — after member profiles refresh at 8am.

In `ai-worker.js`, add to the `scheduled` handler:
```js
// Score recalculation — every Sunday at 9am UTC
if (cron === '0 9 * * 0') {
  // POST to score worker or run inline
}
```

Alternatively, `score.js` can be imported into `ai-worker.js` and called directly.

---

## Important notes

- **This is not editorial.** The score is a direct mathematical product of the
  member's own voting record and the AI's bill classifications. We are not calling
  anyone corrupt — we are showing what their votes say about them.

- **Display the methodology.** The About page and the score breakdown section on
  each member profile must explain clearly how the score is calculated. Transparency
  is the whole point.

- **Scores will be imperfect.** The AI tag classification is good but not perfect.
  Some bills will be miscategorized. That's okay — across hundreds of votes, the
  pattern holds. A note on member profiles: "Score is based on AI bill classification
  and may not reflect every nuance."

- **Never hardcode a member's score.** It is always calculated fresh from live data.
  No editorial decisions. No exceptions.

- **The tier names are permanent public record.** Once a session ends and scores
  are finalized, archive them. A legislator cannot vote their way out of a past
  session's tier. We shall never forget.
