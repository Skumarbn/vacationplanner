# Vacation Planner Agent TODOs

This file is written so separate agents can pick one item, implement it, and leave the rest alone.

Before starting an item:

- Read `README.md`, `app/page.tsx`, `app/globals.css`, `app/api/itinerary/route.ts`, `lib/itinerary.ts`, and `lib/types.ts`.
- Do not edit `ui-prototype.html`; it is the visual reference.
- Keep the warm visual style unless the task explicitly changes UI design.
- Update this file with progress notes when you complete an item.
- Add verification notes: command run, endpoint checked, or browser behavior verified.

## Current Stack

- Backend: Next.js App Router API route.
- Frontend: Next.js + React + TypeScript.
- AI: OpenAI Responses API when `OPENAI_API_KEY` is set.
- Demo fallback: local itinerary generator in `lib/itinerary.ts`.
- Storage: browser `localStorage`.
- Maps: simple Google Maps search links only. No Maps or Places API for V1.
- Database: intentionally skipped for V1.

## V1 Product Decision

We are intentionally skipping Google Maps API, Google Places API, Geoapify, and other place-data APIs for V1.

Reason:

- Users can open Google Maps themselves from search links.
- Avoid billing/API complexity.
- Focus V1 on strong AI itinerary quality and exact place names.

Agents should not add map/places provider integrations unless explicitly reassigned.

## Roadmap Snapshot

- P0: Verify exact-place OpenAI output and provider-error behavior on real credentials, then close any remaining specificity gaps without adding external place-data APIs.
- P1: Finish itinerary quality guardrails for duplicates, geography, pacing, and repair behavior now that regeneration controls and enriched activity fields are already visible in the UI.
- P1: Add the remaining V1 hardening work in backend safety and release coverage after the real-credential verification pass is complete.
- P2: Add mobile polish plus print/export follow-through on top of the shipped local save/share flow.

## Current Agent Handoff

- AI + Backend: Run item 1 acceptance verification with a real `OPENAI_API_KEY`, then use the findings to finish item 2, item 10, and item 12 quality/repair gaps without changing the no-database and no-Places-API V1 scope.
- Frontend + UX: Start item 17 mobile polish against the now-stable planner UI, then move item 19 from partial to complete by adding print/export surfaces that reuse the existing local itinerary data.
- Testing + Release: Re-run `npm test` and `npm run build` after the next merged implementation change, then extend verification coverage toward the real-credential/provider path and upcoming mobile/export behavior.
- Mainline Manager: Keep `main` synced to `origin`, maintain `TODO.md` status accuracy from merged evidence, and prioritize item 1 verification plus item 2/10/12 backend hardening before lower-priority net-new features.

## 1. Exact Place Generation With OpenAI

Status: Partial
Priority: P0
Agent owner: AI + Backend

Goal: Make OpenAI generate exact, recognizable place names for any destination without using a Maps/Places API.

Deliverables:

- Strengthen the OpenAI prompt in `lib/itinerary.ts`.
- Require exact place names, named neighborhoods, named museums, named parks, named restaurants/cafes/markets when appropriate.
- Forbid generic activity titles like `Main landmark area`, `Central breakfast`, or `Museum stop` in OpenAI mode.
- Return `mapQuery` for each activity as a plain Google Maps search query.
- Keep the “verify hours, tickets, and travel times” disclaimer.
- Add destination-specific fallback catalogs for popular demo destinations as needed.

Acceptance checks:

- San Francisco returns exact places like Ferry Building Marketplace, Exploratorium, Pier 39, Alcatraz Island, etc.
- Other common destinations produce exact place names in OpenAI mode.
- No Maps/Places API key is required.
- Activities still include Google Maps search links.

Dependencies:

- Needs `OPENAI_API_KEY` for real AI behavior.

Progress notes:

- Strengthened the OpenAI prompt to require exact place names, named areas, and Google-Maps-ready `mapQuery` values.
- Added stronger destination-specific demo catalogs for San Francisco, New York City, and Paris instead of generic placeholder activities.
- Full OpenAI acceptance verification is still blocked until `OPENAI_API_KEY` is available.

## 2. AI Itinerary Quality Pipeline

Status: Partial
Priority: P0
Agent owner: AI + Backend

Goal: Improve the `/api/itinerary` generation flow so AI output is specific, practical, and consistent.

Deliverables:

- Keep the existing structured JSON schema.
- Add validation for AI output:
  - correct number of days
  - no duplicate activity titles unless intentional
  - each activity has title, description, duration, cost, tags, and mapQuery
  - each title is specific enough for a map search
- Retry or repair once when AI output is malformed or too generic.
- Preserve unrelated sections when regenerating one day or swapping one activity.

Acceptance checks:

- Generated activities all include exact place names.
- Each activity has a useful Google Maps search link.
- Regenerate day and swap activity preserve unrelated itinerary sections.
- 1-day and 2-day itineraries stay concise.

Dependencies:

- Best after item 1.

Progress notes:

- Added itinerary inspection for day count, generic titles, duplicate places, and missing required activity fields.
- OpenAI generation now retries once with repair instructions when the first response is malformed or too generic.
- A repair pass now normalizes notes, day counts, and missing activity fields before returning API data.
- Current local `main` includes this pipeline work, but `origin/main` does not until a successful push/authenticated sync happens.

## 3. Local Trip Storage

Status: Completed
Priority: P1
Agent owner: Frontend + UX

Goal: Keep saved trips in browser `localStorage` for V1, but make it reliable and easy to understand.

Deliverables:

- Keep using `localStorage`; do not add SQLite, PostgreSQL, Prisma, or any database.
- Store trip input, itinerary JSON, share token, created date, updated date, and optional expiration date in browser storage.
- Add helper functions in `app/page.tsx` for save/load/delete/list if needed.
- Add friendly message that local links work only in the same browser.
- Avoid breaking existing `#trip=<token>` behavior.

Acceptance checks:

- Generated trip can be reloaded via `#trip=<token>` in the same browser.
- Browser refresh does not delete the current saved trip.
- Missing or deleted token shows a friendly message.
- No database package or database connection is added.

Dependencies:

- None, but coordinate with item 4.

Progress notes:

- Trips already save to `localStorage` and reload from `#trip=<token>` in the same browser.
- Current payload only stores `savedAt`; created/updated timestamps, delete/list helpers, and clearer local-only UX are still missing.
- Added `lib/local-trip.ts` helpers for save/load/delete/list operations with created/updated timestamps and optional expiry handling.
- Saving a generated trip now updates the URL hash to `#trip=<token>`, so refresh reopens the same locally saved trip in the same browser.

Verification notes:

- `npm test`
- `npm run build`
- Manual browser verification on July 6, 2026 at `http://127.0.0.1:3000`: generated trips update the URL to `#trip=<token>`, refresh preserves the loaded trip, and deleting the current local trip clears the active state without adding backend storage.

## 4. Local Share Links

Status: Completed
Priority: P1
Agent owner: Frontend + UX

Goal: Improve current browser-local share links without backend persistence.

Deliverables:

- Keep links like `/#trip=<token>`.
- Make copy-link behavior clear.
- Add UI copy explaining that local links reopen trips saved in this browser only.
- Optionally add “Copy itinerary text” as a more portable sharing option.
- Do not add `/trip/:token` backend route for V1.

Acceptance checks:

- Opening `/#trip=<token>` in the same browser loads the itinerary.
- Opening an unknown token shows a friendly local-only message.
- User can copy the itinerary text if they need to send it to someone.

Dependencies:

- Best after item 3.

Progress notes:

- Share links already use `/#trip=<token>`, support copy, and show a friendly unknown-token message.
- Portable sharing is still weak because there is no copy-itinerary-text option yet.
- Added a `Copy itinerary text` action and stronger local-only copy so users understand that browser-local links do not travel across devices or browsers.

Verification notes:

- `npm test`
- `npm run build`
- Manual browser verification on July 6, 2026 at `http://127.0.0.1:3000`: `Copy share link`, `Copy itinerary text`, and `Delete local trip` all render together with the browser-local sharing explanation.

## 5. Next.js + TypeScript Migration

Status: Completed
Priority: Completed baseline
Agent owner: Branch Manager

Goal: Move from plain HTML/CSS/JS to a maintainable app framework.

Deliverables:

- Scaffold Next.js with TypeScript.
- Preserve current visual design.
- Convert UI into components.
- Move `/api/itinerary` into framework API route or server action.
- Keep environment variable behavior.

Acceptance checks:

- App runs locally.
- Form generation works.
- Existing UI vibe is preserved.
- No regression for 1-day and 2-day trips.

Dependencies:

- Completed before agent handoff.

Completion notes:

- Migrated UI to `app/page.tsx`.
- Migrated styling to `app/globals.css`.
- Migrated `/api/itinerary` to `app/api/itinerary/route.ts`.
- Moved shared itinerary logic to `lib/itinerary.ts`.
- Added shared types in `lib/types.ts`.
- Deleted old `server.js` and vanilla `app/index.html`, `app/app.js`, `app/styles.css`.
- Dependency installation was blocked by the environment approval limit; run `npm install` locally before verification.

## 6. Form Validation

Status: Completed
Priority: P1
Agent owner: AI + Backend

Goal: Add friendly client and server validation.

Deliverables:

- Validate destination is non-empty.
- Days must be 1-10.
- Adults must be 1-20.
- Children must be 0-20.
- At least one interest should be selected, or default safely.
- Show inline UI errors.
- Server returns structured validation errors.

Acceptance checks:

- Invalid inputs do not submit.
- Server rejects invalid API requests.
- UI shows readable messages.

Dependencies:

- None.

Progress notes:

- Server now rejects invalid destination, days, adults, and children values with structured field errors instead of silently clamping them.
- The planner form now runs client-side validation before submitting, maps server-side `validation_error` details back to inline field errors, and highlights invalid inputs in place.
- Empty interest selections now fall back safely to the default interest set with an explicit UI message instead of silently drifting from the server payload.

Verification notes:

- `npm test`
- `npm run build`
- Reverified on July 6, 2026: invalid destination/count inputs are blocked in the client before fetch, server-side validation still returns structured field details, and empty interest selections restore default interests before generation.

## 7. Better Loading And Error States

Status: Partial
Priority: P1
Agent owner: Frontend + UX

Goal: Improve UX while generation is running or fails.

Deliverables:

- Add itinerary skeleton cards.
- Add progress messages.
- Disable relevant controls while generating.
- Add retry UI for failed generation.
- Improve provider error messages.

Acceptance checks:

- Slow requests feel intentional.
- OpenAI/Google failure produces helpful UI.
- User can retry without refreshing.

Dependencies:

- None.

Progress notes:

- Generation buttons already disable while requests are in flight and now pair with action-specific loading banners.
- Added itinerary skeleton cards for initial loads so the results area stays intentional while the first trip is generating.
- Replaced transient status text with action-specific loading banners and persistent retryable error cards for provider, rate-limit, malformed-response, and validation failures.
- Existing itinerary cards now dim during refresh actions so regenerate/swap requests still preserve context for 1-day and 2-day trips.

Verification notes:

- `npm run build` passed on July 2, 2026 after adding skeleton states, retry UI, and structured provider error messaging.
- Manual behavior note: the page now shows skeleton day cards before the first itinerary arrives, keeps prior itinerary content visible during regenerate/swap requests, and exposes a Retry button for recoverable API failures without requiring a refresh.

## 8. Advanced Regeneration Controls

Status: Completed
Priority: P1
Agent owner: AI + Backend

Goal: Let users steer itinerary changes more precisely.

Deliverables:

- Existing: regenerate all, regenerate day, swap activity.
- Add controls:
  - make day more relaxed
  - make day cheaper
  - make activity more kid-friendly
  - remove activity
- API should accept action and target.

Acceptance checks:

- Action only changes intended day/activity.
- UI clearly shows available actions.
- Backend validates action names and target indexes.

Dependencies:

- Best after item 2 for AI quality.

Progress notes:

- Backend action support now includes `relax-day`, `cheaper-day`, `kid-friendly-activity`, and `remove-activity`.
- API now validates supported action names plus day/activity targets before applying changes.
- The itinerary UI now exposes day-level Relax day / Lower cost controls plus activity-level More kid-friendly / Remove controls on top of the existing regenerate and swap actions.
- Manual browser verification on July 6, 2026 confirmed the new controls stay visible after trip generation and that switching between 1-day and 2-day trips still renders the correct number of day cards.

Verification notes:

- `npm test`
- `npm run build`
- Reverified on July 6, 2026: backend action validation still passes, the production build includes the new day/activity steering controls, and browser checks confirmed 1-day and 2-day trip updates still render correctly.

## 9. Google Maps Search Link Polish

Status: Completed
Priority: P2
Agent owner: Frontend + UX

Goal: Keep map support simple with useful external search links, not embedded map APIs.

Deliverables:

- Improve Google Maps search URL generation.
- Add clear “Open in Google Maps” links for every activity.
- Consider one “Open day in Google Maps search” helper if useful.
- Keep the sidebar as a route/search summary, not an embedded map.

Acceptance checks:

- Each activity opens a sensible Google Maps search.
- No Google Maps API key is required.
- Mobile layout remains usable.

Dependencies:

- None.

Progress notes:

- Every activity already links to a Google Maps search using `mapQuery`.
- Activity links now use explicit `Open in Google Maps` labeling instead of generic map copy.
- Added a day-level `Open day in Google Maps` helper that bundles the strongest stop queries for quicker handoff to Google Maps without adding any map provider SDK.

Verification notes:

- `npm run build`
- Manual browser check on July 6, 2026 at `http://127.0.0.1:3000`: per-activity `Open in Google Maps` links remained visible and each day now exposes an `Open day in Google Maps` helper in the day header.

## 10. Itinerary Quality Rules

Status: Partial
Priority: P1
Agent owner: AI + Backend

Goal: Prevent low-quality or impractical plans.

Deliverables:

- Avoid duplicate places.
- Limit activities based on pace and children.
- Group places by rough geography.
- Avoid impossible travel jumps.
- Keep meal/activity balance reasonable.

Acceptance checks:

- Same place does not appear repeatedly unless intentionally reused.
- 1-day trip is not overloaded.
- Family trips include breaks.

Dependencies:

- Can start now.

Progress notes:

- Added repair rules to avoid generic duplicate places and cap family packed days at 3 activities.
- Demo generation now keeps family trips lighter and preserves the verify-before-going disclaimer.

## 11. Activity Details Enrichment Without Places API

Status: Completed
Priority: P2
Agent owner: Frontend + UX

Goal: Show richer AI-generated activity details while avoiding provider/API dependence.

Deliverables:

- Add fields to activity schema:
  - neighborhood or area
  - booking hint
  - indoor/outdoor
  - family friendliness
  - estimated duration
  - cost label
- Do not add ratings, exact hours, exact prices, or exact addresses unless we add a verified data provider later.
- Add “verify before going” disclaimer.

Acceptance checks:

- Activity cards show real useful details.
- Missing fields degrade gracefully.
- No exact hours/prices are invented.

Dependencies:

- Best after item 2.

Progress notes:

- Added backend/schema support for `neighborhood`, `bookingHint`, `setting`, and `familyFriendly` activity fields.
- Demo generation now fills these fields without inventing exact hours, prices, or addresses.
- Activity cards now render neighborhood chips, indoor/outdoor setting, family-fit labels, and booking hints while keeping the verify-before-going guidance visible.
- Manual browser verification on July 6, 2026 confirmed `Setting`, `Kid fit`, and `Booking hint` details render in generated cards and optional fields still omit cleanly when absent.

Verification notes:

- `npm test`
- `npm run build`
- Reverified on July 6, 2026 at `http://127.0.0.1:3000`: enriched activity fields render in itinerary cards, `Open in Google Maps` labeling is visible, and optional values continue to degrade gracefully when absent.

## 12. Provider Error Handling

Status: Partial
Priority: P1
Agent owner: AI + Backend

Goal: Make external service failures understandable.

Deliverables:

- Distinguish invalid destination, OpenAI failure, rate limit, malformed response, and demo fallback.
- Add structured server error format.
- Add UI-specific messages.

Acceptance checks:

- Each provider failure has a clear message.
- App remains usable after failure.
- Sensitive provider details are not shown to users.

Dependencies:

- Best after item 2.

Progress notes:

- API errors now return structured `code` and `details` fields for validation, provider, rate-limit, and malformed-response cases.
- Provider messages are sanitized before returning them to the browser.
- The current UI also shows persistent retryable error cards for provider, rate-limit, malformed-response, and validation failures; remaining acceptance risk is real-credential verification of the OpenAI-specific path.

## 13. Environment And Config

Status: Completed
Priority: P2
Agent owner: Testing + Release

Goal: Make local setup clear and predictable.

Deliverables:

- Expand `.env.example`.
- Document required and optional variables.
- Add startup validation for production mode.
- Support `APP_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT`.
- Do not add `DATABASE_URL` for V1.

Acceptance checks:

- New developer can run app from README.
- Missing optional keys use demo mode.
- Missing required production keys fail clearly.

Dependencies:

- Coordinate with item 3.

Completion notes:

- Expanded `.env.example` with `APP_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `PORT` plus required-vs-optional guidance.
- Added `lib/env.ts` and `instrumentation.ts` so production startup fails clearly when `APP_URL` is missing or invalid.
- Updated `README.md` with local setup, test, and deployment environment expectations.

Verification notes:

- `npm test`
- `npm run build`

## 14. Testing

Status: Completed
Priority: P1
Agent owner: Testing + Release

Goal: Add automated confidence.

Deliverables:

- Add test runner.
- Unit tests for validation.
- Unit tests for fallback itinerary generation.
- Integration tests for `/api/itinerary`.
- Tests for 1-day and 2-day trips.
- Tests for regeneration preserving unrelated sections.

Acceptance checks:

- `npm test` runs locally.
- Tests pass without external API keys.
- Provider calls are mocked.

Dependencies:

- None.

Verification notes:

- `npm run build` passed on June 29, 2026.
- `curl -sS -X POST http://127.0.0.1:3001/api/itinerary ...generate...` returned enriched demo itinerary data including `mapQuery`, `neighborhood`, `bookingHint`, `setting`, and `familyFriendly`.
- `curl -sS -X POST http://127.0.0.1:3001/api/itinerary ...invalid action...` returned `validation_error` with supported actions.
- `curl -sS -X POST http://127.0.0.1:3001/api/itinerary ...invalid tripInput...` returned field-level validation details for destination, days, adults, and children.

Completion notes:

- Added a built-in Node test runner via `npm test`.
- Added unit coverage for trip input validation, 1-day and 2-day fallback itinerary generation, and regeneration behavior in `tests/itinerary.test.ts`.
- Added integration coverage for `POST /api/itinerary` plus deployment health coverage for `GET /api/health` in `tests/routes.test.ts`.
- Added a mocked-provider route test so no real OpenAI call is required when exercising the provider path.

Additional verification notes:

- `npm test`
- `npm run build`
- Reverified on July 2, 2026 from `main`: `npm run build` passed, demo generation still returned exact San Francisco place names plus enriched activity fields, and invalid action/input requests still returned structured `validation_error` responses.
- Reverified on July 9, 2026 from synced `main`: `npm test` passed with added mocked-provider coverage for OpenAI retry/repair on generic first-pass output and sanitized authentication failures, and `npm run build` passed on Next.js 15.5.19.

## 15. Deployment

Status: Completed
Priority: P2
Agent owner: Testing + Release

Goal: Prepare app for hosting.

Deliverables:

- Choose target: Vercel, Render, Railway, or Fly.io.
- Add deployment docs.
- Add health check endpoint.
- Document environment variables.

Acceptance checks:

- App can be deployed from clean checkout.
- Health endpoint returns OK.
- No secrets committed.

Dependencies:

- Better after item 3 if persistent storage is required.

Completion notes:

- Chose Vercel as the initial deployment target in `README.md`.
- Added `/api/health` for deployment checks and mode visibility.
- Documented deployment environment variables and demo-mode behavior in `README.md`.

Verification notes:

- `npm test`
- `npm run build`
- `GET /api/health` covered in `tests/routes.test.ts`

## 16. Security And Rate Limits

Status: Completed
Priority: P2
Agent owner: AI + Backend

Goal: Protect API keys and avoid abuse.

Deliverables:

- Add server-side rate limiting.
- Keep request body limits.
- Sanitize logs.
- Avoid logging raw provider responses.
- Keep API keys server-side.

Acceptance checks:

- Repeated rapid requests get rate-limited.
- Logs do not include secrets.
- Browser never receives provider keys.

Dependencies:

- None.

Progress notes:

- Added per-client in-memory rate limiting for `POST /api/itinerary`, including `Retry-After` and rate-limit response headers.
- Added a server-side JSON request body cap so oversized itinerary payloads fail with a structured validation error before processing.
- Kept provider handling server-only; the API returns sanitized error payloads without exposing keys or raw provider responses.

Verification notes:

- `npm test`
- `npm run build`
- Automated route coverage now verifies repeated rapid requests return `429 rate_limited` and oversized JSON bodies return `413 validation_error`.

## 17. Mobile Polish

Status: Partial
Priority: P2
Agent owner: Frontend + UX

Goal: Improve small-screen trip planning.

Deliverables:

- Refine mobile spacing.
- Add sticky generate action if useful.
- Make day cards easier to scan.
- Consider collapsible day sections.
- Improve sidebar stacking.

Acceptance checks:

- App is comfortable at 375px width.
- Core actions are reachable without awkward scrolling.
- Footer and forms remain clean.

Dependencies:

- None.

Progress notes:

- Added collapsible day sections with stop-count summaries so longer itineraries are easier to scan before expanding the full activity list.
- Added a mobile-only sticky trip action bar with quick access to edit, calendar-copy, and print/save-PDF actions without forcing users back through the sidebar.
- Tightened small-screen spacing for results, day cards, share URLs, and sidebar cards while preserving the existing warm visual style.
- A legacy local-storage compatibility fix now normalizes older saved trips that only had `savedAt`, so existing browser-local trips still load after the new sidebar/export surfaces render.

Verification notes:

- `npm run build`
- Manual browser verification on July 9, 2026 at `http://localhost:3000/#trip=vs0mDYMU`: an older saved local trip loaded without crashing, day sections now collapse/expand in place, and the export card rendered alongside the existing local-share controls.

## 18. User Feedback Loop

Status: Not started
Priority: Later
Agent owner: Frontend + UX

Goal: Let users steer future generations.

Deliverables:

- Add “like”, “not interested”, or “replace with similar” controls.
- Send feedback context into regeneration calls.
- Store feedback with trip when persistence exists.

Acceptance checks:

- User can mark an activity as unwanted.
- Regeneration avoids unwanted activity type/place.
- Feedback does not affect unrelated trips unless accounts are added later.

Dependencies:

- Best after item 8.

## 19. Trip Export

Status: Partial
Priority: P2
Agent owner: Frontend + UX

Goal: Let users take the itinerary elsewhere.

Deliverables:

- Copy itinerary as text.
- Print-friendly view.
- Optional PDF export.
- Optional calendar-friendly text.

Acceptance checks:

- Export includes days, times, activity names, descriptions, and map links.
- Print view is readable.
- Export works without API keys.

Dependencies:

- None.

Progress notes:

- The `Copy itinerary text` action already shipped as part of the local share-link polish, so the remaining scope is print/export-specific presentation rather than basic text portability.
- Print-friendly layout, PDF export, and calendar-oriented export text are still open.
- Added a dedicated `Take it with you` export card plus a mobile sticky export action so travelers can print/save PDF or copy a calendar-oriented outline from the current local itinerary data.
- Added print-specific CSS that strips form/sidebar chrome, keeps day cards readable on paper, and exposes map URLs in the printed output.
- Calendar-oriented export text now includes day headers, times, activity names, descriptions, and map-search strings without requiring API keys.

Verification notes:

- `npm run build`
- Manual browser verification on July 9, 2026 at `http://localhost:3000/#trip=vs0mDYMU`: the new export card rendered with `Print / save PDF` and `Copy calendar outline`, and collapsed-day behavior still worked alongside the export controls.

## 20. Future Accounts

Status: Not started
Priority: Later
Agent owner: Product Owner / Branch Manager

Goal: Add user accounts later if needed.

Deliverables:

- Document account requirements.
- Choose auth provider.
- Add saved trip history.
- Add favorites.
- Add cross-device access.

Acceptance checks:

- Auth decision is documented before implementation.
- Anonymous share links continue to work.

Dependencies:

- Later-stage item. Do not start unless explicitly assigned.

## Branch Manager Notes

- 2026-06-29: Merged `agent/product-owner-20260628-requirements` into `main`.
- Verification: `npm run build` passed on `agent/product-owner-20260628-requirements` and again on merged `main`.
- Skipped `agent/frontend-ux-20260629-loading-states` because it had no diff from `origin/main`.
- 2026-07-09: Fetched `origin`; local `main` and `origin/main` both point to `cb2ad9a`, so the current roadmap baseline is fully shared.
- The highest-value unfinished work is now real-credential OpenAI verification plus the remaining itinerary quality/provider hardening tasks in items 1, 2, 10, and 12.
