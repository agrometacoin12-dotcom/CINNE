# @cinnetemple/web

Next.js + React + TypeScript + Tailwind + Framer Motion web app, hosted on AWS
Amplify Hosting behind CloudFront.

Design: **Netflix-style + Liquid Glass** (see [`docs/UI_DESIGN.md`](../../docs/UI_DESIGN.md)) —
dark/light themes, glassmorphism on every surface, cinematic hero + content
rows, accessible, SEO-optimized, lazy-loaded.

## Phase 1 scope (next build increment)

Landing · Register · Verify email · Login · Forgot/Reset password · Profile ·
Settings · Session management — all wired to `@cinnetemple/backend` via
`@cinnetemple/sdk`, using `@cinnetemple/shared` contracts and the
`@cinnetemple/config` Tailwind preset.

> This folder is scaffolded with its README and place in the workspace; the
> Next.js app is generated in the next increment so it ships complete (auth
> pages + glass component usage + tests) rather than as empty boilerplate.
