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
export OPENAI_MODEL="gpt-5.4-mini"
```

Without `OPENAI_API_KEY`, the app still runs in demo mode with a local fallback itinerary generator.
