# Vacation Planner

A small Next.js + TypeScript AI-backed itinerary planner built from the `ui-prototype.html` direction.

The original prototype is intentionally left unchanged. The real app lives in:

- `app/page.tsx` - main planner UI
- `app/globals.css` - app styling
- `app/api/itinerary/route.ts` - itinerary API route
- `lib/itinerary.ts` - OpenAI and demo itinerary generation
- `lib/types.ts` - shared TypeScript types

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Enable Real AI Generation

Set an OpenAI API key before running:

```bash
export OPENAI_API_KEY="your_api_key_here"
npm run dev
```

Optional:

```bash
export APP_URL="http://127.0.0.1:3000"
export OPENAI_MODEL="gpt-5.4-mini"
export PORT=3000
```

Without `OPENAI_API_KEY`, the app still runs in demo mode with a local fallback itinerary generator.

Copy `.env.example` to `.env.local` for local work. In production, `APP_URL` must be set to a valid `http://` or `https://` URL. `OPENAI_API_KEY` remains optional and the app will stay in demo mode when it is absent.

## Test

```bash
npm test
```

The automated tests cover trip input validation, fallback itinerary generation, regeneration behavior, the itinerary API route, and the health check endpoint. They run without external API keys and do not call OpenAI.

## Deploy

Target: Vercel

1. Import the repo into Vercel.
2. Set `APP_URL` to the deployed site URL.
3. Optionally set `OPENAI_API_KEY` and `OPENAI_MODEL` for real AI generation.
4. Leave `OPENAI_API_KEY` unset if you want demo mode in preview or production.

Use `/api/health` as the deployment health check. A healthy response returns `{"ok":true,...}` plus the active `demo` or `openai` mode.
