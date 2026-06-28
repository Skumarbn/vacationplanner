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

## 1. Exact Place Generation With OpenAI

Status: Not started

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

## 2. AI Itinerary Quality Pipeline

Status: Not started

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

## 3. Local Trip Storage

Status: Not started

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

## 4. Local Share Links

Status: Not started

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

## 5. Next.js + TypeScript Migration

Status: Completed

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

Status: Not started

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

## 7. Better Loading And Error States

Status: Not started

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

## 8. Advanced Regeneration Controls

Status: Not started

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

## 9. Google Maps Search Link Polish

Status: Not started

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

## 10. Itinerary Quality Rules

Status: Not started

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

## 11. Activity Details Enrichment Without Places API

Status: Not started

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

## 12. Provider Error Handling

Status: Not started

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

## 13. Environment And Config

Status: Not started

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

## 14. Testing

Status: Not started

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

## 15. Deployment

Status: Not started

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

## 16. Security And Rate Limits

Status: Not started

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

## 17. Mobile Polish

Status: Not started

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

## 18. User Feedback Loop

Status: Not started

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

Status: Not started

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

## 20. Future Accounts

Status: Not started

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
