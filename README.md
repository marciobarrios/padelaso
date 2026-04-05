# Padelaso

Padel match tracker with gamification for friends.

Built with **Next.js 16** | **React 19** | **TypeScript** | **Supabase** | **Tailwind CSS 4** | **shadcn/ui**

## Overview

Padelaso is a mobile-first web app for tracking padel matches among a group of friends. Record matches, log in-match events (MVPs, trick shots, epic falls...), and follow stats and leaderboards. The UI is in Spanish.

## Features

- **Groups/Clubs** — Multi-tenant match scoping: create or join groups via invite codes, admin/member roles, group switcher
- **Match creation wizard** — 5-step flow: select players, form teams, input set scores, log events, confirm
- **25 event types** — MVP, Ace, Víbora, Bandeja, Globo, Bajada de muro, Puntazo, Dejada imposible, Chiquita, Caída épica, and more — classified as positive, negative, or fun
- **Player management** — Create players with custom emoji avatars
- **Stats and leaderboards** — Win rates, current streaks, event-specific rankings (all scoped per group)
- **Google OAuth** — Authentication via Supabase Auth with account linking
- **Match sharing** — View and share match details via unique URLs
- **Dark theme** — Mobile-optimized dark UI with bottom navigation

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Language | TypeScript 5.9 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth) |
| Icons | Lucide React, Hugeicons |
| Fonts | Geist (via next/font) |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### Setup

```bash
# Install dependencies
npm install
```

Create a `.env.local` file with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Run

```bash
npm run dev     # Development server at http://localhost:3000
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                # Root layout (auth, fonts)
│   ├── page.tsx                  # Home dashboard
│   ├── login/page.tsx            # Google OAuth login
│   ├── groups/
│   │   ├── onboarding/page.tsx   # Create/join group on first login
│   │   └── [groupId]/page.tsx    # Group settings (admin)
│   ├── matches/
│   │   ├── page.tsx              # Match list
│   │   ├── new/page.tsx          # New match (wizard)
│   │   └── [matchId]/page.tsx    # Match details
│   ├── players/
│   │   ├── page.tsx              # Player list
│   │   └── [playerId]/page.tsx   # Player profile
│   ├── stats/page.tsx            # Leaderboards & stats
│   └── auth/callback/route.ts    # OAuth callback
├── components/
│   ├── auth/          # Auth provider & hooks
│   ├── group/         # Group provider, switcher
│   ├── layout/        # Mobile shell, page header
│   ├── match/         # Match wizard, cards, score input
│   ├── players/       # Player list, dialogs, avatar
│   ├── events/        # Event grid, buttons, feed
│   └── ui/            # shadcn/ui primitives
└── lib/
    ├── types.ts              # TypeScript interfaces
    ├── event-config.ts       # Event type definitions (25 types)
    ├── stats.ts              # Stats calculations
    ├── db-hooks.ts           # Database event hooks
    ├── utils.ts              # Utility functions
    ├── supabase.ts           # Client-side Supabase
    ├── supabase-server.ts    # Server-side Supabase
    ├── supabase-hooks.ts     # Data fetching hooks (group-scoped)
    └── supabase-mutations.ts # Create/update operations
supabase/
└── migrations/               # Database schema & migrations
```

## Database

| Table | Purpose |
|-------|---------|
| `groups` | Group/club profiles (name, emoji, invite code) |
| `group_members` | User-group memberships with roles (admin/member) |
| `players` | Player profiles scoped to a group (name, emoji avatar) |
| `matches` | Match records scoped to a group (teams, set scores, date) |
| `match_events` | In-match events linked to players |
| `profiles` | User accounts (synced from auth) |

All player and match data is isolated per group via Row-Level Security (RLS) policies.
