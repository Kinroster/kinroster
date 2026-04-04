# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

This is a **documentation-only repository** — there is no source code. It contains the complete product specification, business strategy, and technical build plan for **CareNote**, a Claude-powered documentation tool for small elder-care providers (6–20 bed residential care homes).

CareNote transforms raw caregiver observations into structured shift logs, incident reports, family-friendly email updates, and weekly care summaries using Claude AI.

## Document Structure

The repository consists of 12 numbered Markdown documents plus a README index:

- **01–04**: Business & strategy (executive summary, market analysis, GTM, roadmap)
- **05–06**: Product (PRD with feature specs F1–F10, user flows with wireframes)
- **07–10**: Technical (architecture, data model, prompt engineering, compliance/security)
- **11**: 30-day build plan with daily tasks
- **12**: Competitive intelligence and pricing rationale

## Key Context for Working With These Docs

- **Reading order**: Start with 01 (vision), then 05 (what to build), then 11 (how to build it). Reference 07–10 during implementation.
- **Project status**: Pre-build, specification complete. Next step is the 30-day MVP build.
- **Target tech stack**: Next.js 15 (App Router), Supabase (PostgreSQL + Auth + RLS), Claude API (Sonnet 4.6 for note structuring, Haiku 4.5 for incident classification), Resend (email), Stripe (billing), Vercel (hosting), OpenAI Whisper API (voice transcription).
- **Package manager**: pnpm (specified in build plan prerequisites).
- **Two user roles in MVP**: Admin (owner/manager, full access) and Caregiver (enters notes, limited access). Family members receive emails but have no login in V1.
- **HIPAA-adjacent**: The app handles elder care data. Docs 10 and 07 cover compliance requirements, BAA obligations, and security hardening. PHI must never be logged or stored outside the encrypted database.
- **Business model**: $149/month flat rate per facility, 14-day free trial, ~$9–17/month API cost per facility.

## Important Architectural Decisions

- All data is organization-scoped via Supabase Row Level Security (RLS). Every table with user data requires RLS policies.
- Claude prompts are versioned and defined in `09-PROMPT-ENGINEERING.md`. Each prompt includes the resident's `care_notes_context` field for personalized output.
- Voice input records audio via MediaRecorder API → sends to Whisper API → transcript populates text input. Audio is never stored.
- Claude API failures are handled gracefully: save raw note, queue for background retry, show user-friendly message.
- The data model (doc 08) is designed from day one to support future analytics (Phase 2), but no analytics features are built in MVP.

## When Editing These Documents

- Keep cross-references between documents consistent (e.g., feature IDs like F2.14 are referenced across PRD, user flows, and build plan).
- Pricing figures ($149/month, API cost projections) appear in multiple docs — update all occurrences if changed.
- The build plan (doc 11) maps directly to PRD features — changes to feature scope should be reflected in both.
