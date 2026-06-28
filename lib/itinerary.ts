import type {
  Activity,
  Budget,
  Itinerary,
  ItineraryAction,
  ItineraryTarget,
  Pace,
  TripInput,
} from "./types";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const itinerarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "destination", "days", "notes"],
  properties: {
    title: { type: "string" },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["pace", "budget", "bestFor", "activityCount"],
      properties: {
        pace: { type: "string" },
        budget: { type: "string" },
        bestFor: { type: "string" },
        activityCount: { type: "number" },
      },
    },
    destination: { type: "string" },
    notes: {
      type: "array",
      items: { type: "string" },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "meta", "activities"],
        properties: {
          title: { type: "string" },
          meta: { type: "string" },
          activities: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "time",
                "title",
                "description",
                "duration",
                "cost",
                "tags",
                "mapQuery",
              ],
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                duration: { type: "string" },
                cost: { type: "string" },
                tags: {
                  type: "array",
                  items: { type: "string" },
                },
                mapQuery: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function normalizeTripInput(input: Partial<TripInput> = {}): TripInput {
  const days = clamp(Number.parseInt(String(input.days), 10) || 3, 1, 10);
  const adults = clamp(Number.parseInt(String(input.adults), 10) || 1, 1, 20);
  const children = clamp(Number.parseInt(String(input.children), 10) || 0, 0, 20);
  const destination = String(input.destination || "").trim();

  if (!destination) {
    throw new Error("Destination is required.");
  }

  return {
    destination,
    startDate: String(input.startDate || ""),
    days,
    adults,
    children,
    budget: pick(input.budget, ["Budget", "Moderate", "Premium"], "Moderate"),
    pace: pick(input.pace, ["Relaxed", "Balanced", "Packed"], "Balanced"),
    interests:
      Array.isArray(input.interests) && input.interests.length
        ? input.interests.map(String).slice(0, 8)
        : ["Food", "Museums", "Kid-friendly"],
  };
}

export async function generateItinerary({
  input,
  action,
  existingItinerary,
  target,
}: {
  input: TripInput;
  action: ItineraryAction;
  existingItinerary: Itinerary | null;
  target: ItineraryTarget;
}): Promise<{ itinerary: Itinerary; generatedBy: "openai" | "demo"; model: string }> {
  if (process.env.OPENAI_API_KEY) {
    const itinerary = await callOpenAI(input, action, existingItinerary, target);
    return { itinerary, generatedBy: "openai", model: OPENAI_MODEL };
  }

  return {
    itinerary: fallbackItinerary(input, action, existingItinerary, target),
    generatedBy: "demo",
    model: "local-demo",
  };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildPrompt(
  input: TripInput,
  action: ItineraryAction,
  existingItinerary: Itinerary | null,
  target: ItineraryTarget,
) {
  return [
    {
      role: "developer",
      content:
        "You are an expert travel itinerary planner. Produce practical, geographically sensible itineraries with exact, visitable place names. Prefer real attractions, museums, parks, restaurants, neighborhoods, markets, and viewpoints in or near the requested destination. Do not use generic titles like 'signature landmark visit' or 'central breakfast' unless no exact place is reasonably known. Do not invent exact prices, opening hours, or availability. Keep descriptions concise and useful. Return only data matching the requested schema.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: action,
          target,
          tripInput: input,
          existingItinerary,
          requirements: [
            "Create exactly the requested number of days.",
            "Each day should have 2-4 activities depending on pace.",
            "For children, include breaks and family-friendly pacing.",
            "For budget, use cost labels $, $$, or $$$.",
            "Each activity title should be an exact place or a specific named area.",
            "Each activity must include a mapQuery with the place name and destination suitable for a Google Maps search URL.",
            "If regenerating a day or swapping an activity, preserve unrelated days and activities.",
          ],
        },
        null,
        2,
      ),
    },
  ];
}

async function callOpenAI(
  input: TripInput,
  action: ItineraryAction,
  existingItinerary: Itinerary | null,
  target: ItineraryTarget,
): Promise<Itinerary> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "low" },
      input: buildPrompt(input, action, existingItinerary, target),
      text: {
        format: {
          type: "json_schema",
          name: "vacation_itinerary",
          strict: true,
          schema: itinerarySchema,
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data?.error?.message === "string" ? data.error.message : "OpenAI request failed.";
    throw new Error(message);
  }

  const text = extractOutputText(data);
  if (!text) {
    throw new Error("OpenAI returned an empty itinerary.");
  }

  return JSON.parse(text) as Itinerary;
}

function extractOutputText(data: unknown): string {
  if (isObject(data) && typeof data.output_text === "string") {
    return data.output_text;
  }

  const chunks: string[] = [];
  if (isObject(data) && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!isObject(item) || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (isObject(content) && typeof content.text === "string") {
          chunks.push(content.text);
        }
      }
    }
  }
  return chunks.join("").trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fallbackItinerary(
  input: TripInput,
  action: ItineraryAction,
  existingItinerary: Itinerary | null,
  target: ItineraryTarget,
): Itinerary {
  const base =
    existingItinerary && action !== "generate"
      ? structuredClone(existingItinerary)
      : createFallbackTrip(input);

  if (action === "regenerate-day" && Number.isInteger(target.dayIndex)) {
    base.days[target.dayIndex!] = createFallbackDay(input, target.dayIndex!, Date.now());
  }

  if (
    action === "swap-activity" &&
    Number.isInteger(target.dayIndex) &&
    Number.isInteger(target.activityIndex)
  ) {
    base.days[target.dayIndex!].activities[target.activityIndex!] = createFallbackActivity(
      input,
      target.dayIndex!,
      target.activityIndex!,
      Date.now(),
    );
    base.summary.activityCount = countActivities(base);
  }

  return base;
}

function createFallbackTrip(input: TripInput): Itinerary {
  const destination = input.destination.split(",")[0].trim();
  const titleAudience = input.children > 0 ? "family" : input.adults >= 5 ? "group" : "couples";
  const trip: Itinerary = {
    title: `${destination} ${titleAudience} trip`,
    destination,
    summary: {
      pace: input.pace,
      budget: input.budget,
      bestFor: input.children > 0 ? "Families" : input.adults >= 5 ? "Groups" : "Couples",
      activityCount: 0,
    },
    notes: [
      "Demo mode is using local sample generation because OPENAI_API_KEY is not set.",
      "Verify tickets, opening hours, and seasonal closures before booking.",
    ],
    days: Array.from({ length: input.days }, (_, index) => createFallbackDay(input, index)),
  };
  trip.summary.activityCount = countActivities(trip);
  return trip;
}

function createFallbackDay(input: TripInput, dayIndex: number, variant = 0) {
  const placeSet = getPlaceSet(input.destination);
  const activityCount = { Relaxed: 2, Balanced: 3, Packed: 4 }[input.pace] || 3;
  const theme = placeSet.themes[(dayIndex + variant) % placeSet.themes.length];

  return {
    title: `Day ${dayIndex + 1} · ${toTitleCase(theme)}`,
    meta:
      input.children > 0
        ? "Family-aware pacing · breaks built in"
        : `${input.pace} pace · nearby stops grouped together`,
    activities: Array.from({ length: activityCount }, (_, activityIndex) =>
      createFallbackActivity(input, dayIndex, activityIndex, variant),
    ),
  };
}

function createFallbackActivity(
  input: TripInput,
  dayIndex: number,
  activityIndex: number,
  variant = 0,
): Activity {
  const times: Record<Pace, string[]> = {
    Relaxed: ["10:00 AM", "2:00 PM"],
    Balanced: ["9:30 AM", "12:30 PM", "3:30 PM"],
    Packed: ["8:30 AM", "11:00 AM", "2:00 PM", "5:30 PM"],
  };
  const placeSet = getPlaceSet(input.destination);
  const selected =
    placeSet.activities[(dayIndex * 3 + activityIndex + variant) % placeSet.activities.length];
  const cost = input.budget === "Budget" ? "$" : input.budget === "Premium" ? "$$$" : "$$";

  return {
    time: times[input.pace][activityIndex],
    title: selected.title,
    description: selected.description,
    duration: activityIndex === 0 ? "45-60 min" : "1-2 hrs",
    cost,
    tags: Array.from(new Set([...selected.tags, cost])).slice(0, 3),
    mapQuery: `${selected.title} ${input.destination}`,
  };
}

function getPlaceSet(destination: string) {
  if (/san francisco|sf bay|bay area/i.test(destination)) {
    return {
      themes: [
        "ferry building and waterfront",
        "golden gate views",
        "museums and golden gate park",
        "north beach and chinatown",
        "mission food and murals",
        "presidio and palace views",
        "alcatraz and fisherman's wharf",
        "twin peaks and castro",
        "exploratorium and embarcadero",
        "lands end and ocean beach",
      ],
      activities: [
        {
          title: "Ferry Building Marketplace",
          description:
            "Start with a specific, easy food stop on the Embarcadero with coffee, pastries, and bay views.",
          tags: ["Food", "Waterfront", "Easy start"],
        },
        {
          title: "Exploratorium",
          description:
            "A hands-on science museum on Pier 15 that works especially well for families and mixed-age groups.",
          tags: ["Museums", "Kid-friendly", "Indoor"],
        },
        {
          title: "Pier 39",
          description:
            "A lively waterfront stop with bay views, casual food, and classic first-trip San Francisco energy.",
          tags: ["Waterfront", "Family", "Must-see"],
        },
        {
          title: "Golden Gate Bridge Welcome Center",
          description:
            "Use this as a simple base for bridge photos, short walks, and accessible Golden Gate views.",
          tags: ["Scenic", "Outdoors", "Must-see"],
        },
        {
          title: "Crissy Field",
          description:
            "A relaxed waterfront walk with bridge views, open space, and room for kids to reset.",
          tags: ["Outdoors", "Kid-friendly", "Views"],
        },
        {
          title: "Palace of Fine Arts",
          description:
            "A photogenic, low-stress stop near the Marina with beautiful architecture and easy walking paths.",
          tags: ["Architecture", "Scenic", "Relaxed"],
        },
        {
          title: "California Academy of Sciences",
          description:
            "A strong Golden Gate Park anchor with aquarium, rainforest, planetarium, and indoor flexibility.",
          tags: ["Museums", "Kid-friendly", "Indoor"],
        },
        {
          title: "de Young Museum",
          description:
            "Pair art galleries with the observation tower and nearby park space for a balanced culture stop.",
          tags: ["Museums", "Culture", "Views"],
        },
        {
          title: "Japanese Tea Garden",
          description:
            "A compact, calming Golden Gate Park stop with gardens, tea, and a slower pace.",
          tags: ["Outdoors", "Culture", "Relaxed"],
        },
        {
          title: "Chinatown Dragon Gate",
          description:
            "Begin a Chinatown walk at a clear landmark, then wander toward bakeries, shops, and Grant Avenue.",
          tags: ["Culture", "Shopping", "Walking"],
        },
        {
          title: "City Lights Booksellers",
          description:
            "A specific North Beach stop with literary history and easy access to nearby cafes.",
          tags: ["Culture", "Shopping", "History"],
        },
        {
          title: "Coit Tower",
          description:
            "Add skyline views and murals, with a clear payoff if the group is up for the hill.",
          tags: ["Views", "History", "Scenic"],
        },
        {
          title: "Mission Dolores Park",
          description:
            "A local-feeling park break with skyline views and nearby food options in the Mission.",
          tags: ["Outdoors", "Views", "Relaxed"],
        },
        {
          title: "Balmy Alley Murals",
          description:
            "A specific Mission District art walk with colorful murals and a compact route.",
          tags: ["Art", "Culture", "Walking"],
        },
        {
          title: "Tartine Bakery",
          description:
            "A named food stop for pastries or a casual break near Mission Dolores Park.",
          tags: ["Food", "Bakery", "Popular"],
        },
        {
          title: "Alcatraz Island",
          description:
            "A memorable ferry-and-history outing; book ahead and keep the rest of the day lighter.",
          tags: ["History", "Must-see", "Reserve"],
        },
        {
          title: "Aquarium of the Bay",
          description:
            "A compact indoor waterfront option that is easy to pair with Pier 39 or Fisherman's Wharf.",
          tags: ["Kid-friendly", "Indoor", "Waterfront"],
        },
        {
          title: "Ghirardelli Square",
          description:
            "A classic dessert stop near the waterfront with easy backup options nearby.",
          tags: ["Food", "Dessert", "Family"],
        },
        {
          title: "Lands End Lookout",
          description:
            "A scenic coastal stop with dramatic views, short trail options, and a quieter side of the city.",
          tags: ["Outdoors", "Coast", "Views"],
        },
        {
          title: "Sutro Baths",
          description:
            "Explore the ruins and ocean views near Lands End without making the activity too long.",
          tags: ["History", "Coast", "Scenic"],
        },
        {
          title: "Twin Peaks",
          description:
            "Use this as a big-view stop when visibility is good, especially near sunset.",
          tags: ["Views", "Scenic", "Sunset"],
        },
      ],
    };
  }

  return {
    themes: [
      "arrival and local flavor",
      "landmarks and scenic views",
      "museums and culture",
      "parks and neighborhoods",
      "food, markets, and sunset",
      "hidden gems and easy wandering",
      "signature sights and final favorites",
      "coast, viewpoints, and slow moments",
      "history, shopping, and cafes",
      "open-air adventures",
    ],
    activities: [
      {
        title: "Central breakfast and orientation",
        description: "Start in an easy central area so the group can settle in and calibrate the day.",
        tags: ["Food", "Easy start"],
      },
      {
        title: "Main landmark area",
        description: "See a major local highlight with enough time for photos and a flexible break afterward.",
        tags: ["Must-see", "Maps link"],
      },
      {
        title: "Local museum or cultural center",
        description: "Add context with an indoor activity that works well if weather or energy changes.",
        tags: ["Museums", "Culture"],
      },
      {
        title: "Market lunch or food hall",
        description: "Use a flexible meal stop with choices for different tastes and budgets.",
        tags: ["Food", "Group-friendly"],
      },
      {
        title: "Park, garden, or viewpoint",
        description: "Balance sightseeing with open space and a slower block before dinner.",
        tags: ["Outdoors", "Scenic"],
      },
      {
        title: "Historic neighborhood walk",
        description: "Explore smaller streets, shops, and cafes without making the schedule too rigid.",
        tags: ["History", "Shopping"],
      },
      {
        title: "Neighborhood dinner area",
        description: "End near a restaurant area with backup options in case the group changes its mind.",
        tags: ["Food", "Dinner"],
      },
      {
        title: "Dessert or evening viewpoint",
        description: "Keep the evening optional and light for travelers who still have energy.",
        tags: ["Nightlife", "Optional"],
      },
    ],
  };
}

function toTitleCase(text: string) {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function countActivities(itinerary: Itinerary) {
  return itinerary.days.reduce((total, day) => total + day.activities.length, 0);
}
