# LaunchUp

A startup assessment and readiness platform: it manages qualification, tracks
readiness across multiple assessment types, and surfaces AI-generated
recommendations, roadblocks, and initiatives.

Two independent apps, installed and run separately — see `CLAUDE.md` for
commands and architecture, `PROJECT_OVERVIEW.md` for known gaps.

## Tech stack

**Backend** — NestJS, TypeScript, MikroORM, PostgreSQL, Google Gemini.
**Frontend** — SvelteKit 2 (Svelte 5), TypeScript, TailwindCSS.

File storage is S3-compatible and configured through `S3_*` env vars. It is
unset by default, so uploads return 503 until a provider is configured.

## Features

- **Assessments** — multi-type, with customizable fields
- **Readiness levels** — scored per dimension, with tiers and gap analysis
- **AI insights** — Gemini-generated recommendations, grounded in a verified
  RAG corpus
- **Qualification** — PENDING / QUALIFIED / DISQUALIFIED / WAITLISTED
- **Roadblocks and initiatives** — obstacles and action items per startup
- **OCR intake** — handwritten and PDF capsule proposals
- **Admin** — user management, startup editing, assessment config, activity log

## Assessment types

RNA, RNS, calculator-based, and custom types.
