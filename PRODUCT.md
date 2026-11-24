# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students** in a university course. They open Cobble to learn a course's concepts, ask questions about the course material, follow a study plan, and take the tests their professor publishes. Sessions can be long (studying before a test).
- **Professors / instructors.** They create a course, upload slides, notes and lecture recordings, build the concept map, publish tests, review AI-drafted grades, and read insights about where students struggle.
- **Researchers** (secondary) run the evaluation harness from the command line; they do not use the web UI as a primary tool.

## Product Purpose

Cobble AI is a locally hosted AI tutor for university courses. It turns course materials (PDF, DOCX, PPTX) and lecture recordings into a concept map, a cited tutor, quizzes and instructor insights. Success: students get answers grounded in their own course material, and instructors see what students do not understand.

## Positioning

- Runs entirely on campus hardware (language model, speech-to-text, OCR); course content and student activity never leave it.
- The tutor cites or declines: every answer points to the page, slide or lecture moment it came from, and says so when the materials do not cover a question.
- Instructors set the tutor's limits (hint ladder, assessment mode).

## Operating Context

Students study at a desk or on a laptop, often for long stretches, reading text and citations. Instructors work through setup (upload, build map, invite code) and review queues. Roles: student and professor; there is no admin role.

## Capabilities and Constraints

- Courses with invite codes; concept map per course (3D map and study mode with Teach/Review); course tutor (Ask) with citations and a hint ladder; study plans; tests with confidence check-ins and results; lecture view with transcript and chapters.
- Professor: course setup checklist, tutor policy, tests and grading, AI grade review queue with CSV export, insights (question clusters, coverage gaps, confusion timeline), analytics.
- Stack: React 19 + Vite + Tailwind v4 frontend, FastAPI backend.
- Navigation (2026-11-23): `/courses` home; course shell `/courses/:id` with tabs (student: Overview, Learn, Plan, Tests, Ask; professor: Overview, Map, Tests, Review, Insights; the student Learn view is reachable as "Preview as student" from Overview); top bar student Courses/Assignments/Tutor, professor Courses/Students/Analytics.

## Brand Commitments

- Name: **Cobble AI** (wordmark "cobble").
- Logo: the user's own two-figure "people" mark (two block figures, round heads, one reaching down to help the other). The user confirmed they own it.
- Palette (binding, from the user's brand kit): Sol Blue `#073dea` with tints `#4f75f7 #6a8ff0 #8fadeb #b0c8ee #d4e1f4`; Charcoal Black `#000000` with shades `#151515 #282828 #404040 #6a6a6a #959595`; White Smoke `#f9f9f9`.
- Type (binding): Space Grotesk for headings and sub-headings; SF Pro Display for body text (system UI stack as the web fallback).
- Visual reference the user chose: plastichuman.org (drenched blue fields, small type pinned to corners, mono annotations).
- Theme decision: landing and sign-in drenched in Sol Blue; the app itself is light (White Smoke) with blue as the single accent.

## Evidence on Hand

No testimonials, customer logos, usage numbers or benchmarks exist. Do not invent them. Real facts that can be shown: supported file types, the cite-or-decline behaviour, local hosting, hint ladder, the student and professor feature lists above.

## Product Principles

1. Grounded over clever: every AI answer shows where it came from.
2. One obvious next step on every screen.
3. Calm for long study sessions; expression lives in type and composition, not noise.
4. Same navigation everywhere; never strand the user.

## Accessibility & Inclusion

WCAG AA contrast for text; full keyboard use; respect reduced motion.
