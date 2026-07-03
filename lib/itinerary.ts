import type {
  Activity,
  ActivitySetting,
  ApiErrorCode,
  Budget,
  FamilyFriendlyLevel,
  Itinerary,
  ItineraryAction,
  ItineraryTarget,
  Pace,
  TripInput,
} from "./types.ts";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const defaultInterests = ["Food", "Museums", "Kid-friendly"];
const genericTitlePatterns = [
  /central breakfast/i,
  /main landmark/i,
  /museum stop/i,
  /local museum/i,
  /market lunch/i,
  /park,? garden,? or viewpoint/i,
  /historic neighborhood walk/i,
  /neighborhood dinner/i,
  /dessert or evening viewpoint/i,
  /signature landmark/i,
];

type ValidationDetails = Record<string, string>;

type PlaceActivitySeed = {
  title: string;
  description: string;
  tags: string[];
  neighborhood?: string;
  bookingHint?: string;
};

type PlaceSet = {
  themes: string[];
  activities: PlaceActivitySeed[];
};

export class ItineraryError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: ValidationDetails;

  constructor(code: ApiErrorCode, message: string, status = 400, details?: ValidationDetails) {
    super(message);
    this.name = "ItineraryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

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
                neighborhood: { type: "string" },
                bookingHint: { type: "string" },
                setting: { type: "string" },
                familyFriendly: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function normalizeTripInput(input: Partial<TripInput> = {}): TripInput {
  const details: ValidationDetails = {};
  const destination = String(input.destination || "").trim();
  const days = parseCount(input.days, 3, 1, 10, "days", details);
  const adults = parseCount(input.adults, 1, 1, 20, "adults", details);
  const children = parseCount(input.children, 0, 0, 20, "children", details);

  if (!destination) {
    details.destination = "Destination is required.";
  }

  if (Object.keys(details).length > 0) {
    throw new ItineraryError(
      "validation_error",
      "Trip input is invalid.",
      400,
      details,
    );
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
        ? input.interests.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8)
        : defaultInterests,
  };
}

export function validateActionTarget(
  action: ItineraryAction,
  target: ItineraryTarget,
  existingItinerary: Itinerary | null,
) {
  if (action === "generate") {
    return;
  }

  if (!existingItinerary) {
    throw new ItineraryError(
      "validation_error",
      "This action requires an existing itinerary.",
      400,
      { existingItinerary: "Generate an itinerary before modifying a day or activity." },
    );
  }

  const dayIndex = target.dayIndex;
  const activityIndex = target.activityIndex;

  const requireDay = () => {
    if (!Number.isInteger(dayIndex)) {
      throw new ItineraryError("validation_error", "A valid day index is required.", 400, {
        dayIndex: "Choose a valid itinerary day.",
      });
    }
    if (dayIndex! < 0 || dayIndex! >= existingItinerary.days.length) {
      throw new ItineraryError("validation_error", "Day index is out of range.", 400, {
        dayIndex: "Day index is outside the itinerary range.",
      });
    }
  };

  const requireActivity = () => {
    requireDay();
    if (!Number.isInteger(activityIndex)) {
      throw new ItineraryError("validation_error", "A valid activity index is required.", 400, {
        activityIndex: "Choose a valid activity.",
      });
    }
    const activities = existingItinerary.days[dayIndex!].activities;
    if (activityIndex! < 0 || activityIndex! >= activities.length) {
      throw new ItineraryError("validation_error", "Activity index is out of range.", 400, {
        activityIndex: "Activity index is outside the day range.",
      });
    }
  };

  if (action === "regenerate-day" || action === "relax-day" || action === "cheaper-day") {
    requireDay();
    return;
  }

  if (
    action === "swap-activity" ||
    action === "kid-friendly-activity" ||
    action === "remove-activity"
  ) {
    requireActivity();
  }
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
  validateActionTarget(action, target, existingItinerary);

  if (process.env.OPENAI_API_KEY) {
    const itinerary = await callOpenAI(input, action, existingItinerary, target);
    return { itinerary, generatedBy: "openai", model: OPENAI_MODEL };
  }

  return {
    itinerary: repairItinerary(
      fallbackItinerary(input, action, existingItinerary, target),
      input,
      action,
      existingItinerary,
      target,
    ),
    generatedBy: "demo",
    model: "local-demo",
  };
}

function parseCount(
  rawValue: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
  details: ValidationDetails,
) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    details[field] = `${toLabel(field)} must be between ${min} and ${max}.`;
    return fallback;
  }

  return value;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function buildPrompt(
  input: TripInput,
  action: ItineraryAction,
  existingItinerary: Itinerary | null,
  target: ItineraryTarget,
  repairIssues: string[] = [],
) {
  return [
    {
      role: "developer",
      content:
        "You are an expert travel itinerary planner. Produce practical, geographically sensible itineraries with exact, visitable place names. Prefer real attractions, museums, parks, restaurants, neighborhoods, markets, viewpoints, ferry terminals, bakeries, and named areas in or near the destination. Do not use generic titles like 'main landmark area', 'central breakfast', or 'museum stop'. Do not invent exact prices, opening hours, or availability. Keep descriptions concise and useful. Return only data matching the requested schema.",
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
            "Each day should have 2-4 activities depending on pace, and family trips should stay lighter.",
            "Avoid duplicate places unless the user explicitly asked to revisit something.",
            "Group nearby places together and avoid unrealistic travel jumps across the destination.",
            "Use exact place names or precise named neighborhoods suitable for a Google Maps search.",
            "Every activity must include title, description, duration, cost, tags, mapQuery, neighborhood, bookingHint, setting, and familyFriendly.",
            "Use cost labels $, $$, or $$$ only.",
            "If regenerating or changing one day/activity, preserve unrelated itinerary sections.",
            "Include a note reminding the user to verify hours, tickets, and travel times.",
          ],
          repairIssues,
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
  let repairIssues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning: { effort: "low" },
        input: buildPrompt(input, action, existingItinerary, target, repairIssues),
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
      throw createProviderError(response.status, data);
    }

    const text = extractOutputText(data);
    if (!text) {
      throw new ItineraryError(
        "malformed_response",
        "The itinerary provider returned an empty response.",
        502,
      );
    }

    let parsed: Itinerary;
    try {
      parsed = JSON.parse(text) as Itinerary;
    } catch {
      if (attempt === 0) {
        repairIssues = ["Return valid JSON matching the itinerary schema with no extra text."];
        continue;
      }
      throw new ItineraryError(
        "malformed_response",
        "The itinerary provider returned malformed data.",
        502,
      );
    }

    const issues = inspectItinerary(parsed, input);
    if (issues.length > 0 && attempt === 0) {
      repairIssues = issues;
      continue;
    }

    return repairItinerary(parsed, input, action, existingItinerary, target);
  }

  throw new ItineraryError(
    "malformed_response",
    "The itinerary provider returned malformed data.",
    502,
  );
}

function createProviderError(status: number, data: unknown) {
  const providerMessage =
    isObject(data) && isObject(data.error) && typeof data.error.message === "string"
      ? data.error.message
      : "OpenAI request failed.";

  if (status === 429) {
    return new ItineraryError(
      "rate_limited",
      "OpenAI is rate-limiting itinerary generation. Try again shortly.",
      429,
    );
  }

  return new ItineraryError(
    "provider_error",
    sanitizeProviderMessage(providerMessage),
    status >= 500 ? 502 : 400,
  );
}

function sanitizeProviderMessage(message: string) {
  if (/api key|authentication/i.test(message)) {
    return "The itinerary provider rejected the request configuration.";
  }
  if (/destination|location/i.test(message)) {
    return "The destination could not be planned with the current request.";
  }
  return message;
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

function inspectItinerary(itinerary: Itinerary, input: TripInput) {
  const issues: string[] = [];

  if (!Array.isArray(itinerary.days) || itinerary.days.length !== input.days) {
    issues.push(`Return exactly ${input.days} days.`);
  }

  const seenTitles = new Set<string>();
  for (const day of itinerary.days || []) {
    for (const activity of day.activities || []) {
      const normalizedTitle = String(activity.title || "").trim().toLowerCase();
      if (!normalizedTitle) {
        issues.push("Every activity needs a non-empty title.");
        continue;
      }
      if (isGenericTitle(normalizedTitle)) {
        issues.push(`Replace generic activity titles like "${activity.title}" with exact places.`);
      }
      if (seenTitles.has(normalizedTitle)) {
        issues.push(`Avoid duplicate places like "${activity.title}" unless explicitly necessary.`);
      }
      seenTitles.add(normalizedTitle);
      if (!String(activity.description || "").trim()) {
        issues.push(`Add a description for "${activity.title}".`);
      }
      if (!String(activity.duration || "").trim()) {
        issues.push(`Add a duration for "${activity.title}".`);
      }
      if (!["$", "$$", "$$$"].includes(String(activity.cost || "").trim())) {
        issues.push(`Use $, $$, or $$$ for "${activity.title}".`);
      }
      if (!Array.isArray(activity.tags) || activity.tags.length === 0) {
        issues.push(`Add tags for "${activity.title}".`);
      }
      if (!String(activity.mapQuery || "").trim()) {
        issues.push(`Add a mapQuery for "${activity.title}".`);
      }
    }
  }

  return Array.from(new Set(issues)).slice(0, 8);
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

  if (action === "swap-activity" && hasActivityTarget(target)) {
    const currentActivity = base.days[target.dayIndex!].activities[target.activityIndex!];
    base.days[target.dayIndex!].activities[target.activityIndex!] = createAlternativeActivity(
      input,
      target.dayIndex!,
      target.activityIndex!,
      currentActivity?.title,
    );
  }

  if (action === "relax-day" && Number.isInteger(target.dayIndex)) {
    const relaxedInput = { ...input, pace: "Relaxed" as Pace };
    base.days[target.dayIndex!] = createFallbackDay(relaxedInput, target.dayIndex!, Date.now());
  }

  if (action === "cheaper-day" && Number.isInteger(target.dayIndex)) {
    base.days[target.dayIndex!].activities = base.days[target.dayIndex!].activities.map((activity) =>
      enrichActivity(
        {
          ...activity,
          cost: "$",
          bookingHint: "Good flexible option for keeping the day cheaper.",
        },
        input,
      ),
    );
    base.summary.budget = "Budget";
  }

  if (action === "kid-friendly-activity" && hasActivityTarget(target)) {
    base.days[target.dayIndex!].activities[target.activityIndex!] = createKidFriendlyActivity(
      input,
      target.dayIndex!,
      target.activityIndex!,
    );
  }

  if (action === "remove-activity" && hasActivityTarget(target)) {
    base.days[target.dayIndex!].activities.splice(target.activityIndex!, 1);
    if (base.days[target.dayIndex!].activities.length === 0) {
      base.days[target.dayIndex!].activities.push(createFallbackActivity(input, target.dayIndex!, 0, Date.now()));
    }
  }

  base.summary.activityCount = countActivities(base);
  return base;
}

function hasActivityTarget(target: ItineraryTarget) {
  return Number.isInteger(target.dayIndex) && Number.isInteger(target.activityIndex);
}

function repairItinerary(
  itinerary: Itinerary,
  input: TripInput,
  action: ItineraryAction,
  existingItinerary: Itinerary | null,
  target: ItineraryTarget,
) {
  const repaired = structuredClone(itinerary);

  repaired.destination = repaired.destination?.trim() || input.destination.split(",")[0].trim();
  repaired.title = repaired.title?.trim() || `${repaired.destination} trip`;
  repaired.summary = {
    pace: repaired.summary?.pace || input.pace,
    budget: repaired.summary?.budget || input.budget,
    bestFor:
      repaired.summary?.bestFor ||
      (input.children > 0 ? "Families" : input.adults >= 5 ? "Groups" : "Couples"),
    activityCount: 0,
  };
  repaired.notes = normalizeNotes(repaired.notes || []);
  repaired.days = Array.isArray(repaired.days) ? repaired.days.slice(0, input.days) : [];

  while (repaired.days.length < input.days) {
    repaired.days.push(createFallbackDay(input, repaired.days.length, Date.now()));
  }

  const seenTitles = new Set<string>();
  repaired.days = repaired.days.map((day, dayIndex) => {
    const maxActivities = maxActivitiesForInput(input);
    const minActivities = input.pace === "Relaxed" ? 2 : 2;
    const seedActivities = Array.isArray(day.activities) ? day.activities : [];
    const normalizedActivities = seedActivities
      .slice(0, maxActivities)
      .map((activity, activityIndex) =>
        repairActivity(activity, input, dayIndex, activityIndex, seenTitles),
      );

    while (normalizedActivities.length < minActivities) {
      normalizedActivities.push(
        repairActivity(
          createFallbackActivity(input, dayIndex, normalizedActivities.length, Date.now()),
          input,
          dayIndex,
          normalizedActivities.length,
          seenTitles,
        ),
      );
    }

    return {
      title: String(day.title || `Day ${dayIndex + 1}`).trim(),
      meta:
        String(day.meta || "").trim() ||
        (input.children > 0
          ? "Family-aware pacing · breaks built in"
          : `${input.pace} pace · nearby stops grouped together`),
      activities: normalizedActivities,
    };
  });

  if (
    existingItinerary &&
    action !== "generate" &&
    action !== "regenerate-day" &&
    action !== "swap-activity" &&
    action !== "relax-day" &&
    action !== "cheaper-day" &&
    action !== "kid-friendly-activity" &&
    action !== "remove-activity"
  ) {
    return existingItinerary;
  }

  repaired.summary.activityCount = countActivities(repaired);
  return repaired;
}

function normalizeNotes(notes: string[]) {
  const normalized = notes
    .map((note) => String(note || "").trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!normalized.some((note) => /verify .*hours|tickets|travel times/i.test(note))) {
    normalized.push("Verify hours, tickets, and travel times before going.");
  }

  return Array.from(new Set(normalized));
}

function repairActivity(
  activity: Partial<Activity>,
  input: TripInput,
  dayIndex: number,
  activityIndex: number,
  seenTitles: Set<string>,
): Activity {
  const fallback = createFallbackActivity(input, dayIndex, activityIndex, Date.now() + activityIndex);
  let candidate = enrichActivity(
    {
      ...fallback,
      ...activity,
      title: String(activity.title || fallback.title).trim(),
      description: String(activity.description || fallback.description).trim(),
      duration: String(activity.duration || fallback.duration).trim(),
      cost: normalizeCost(activity.cost, fallback.cost),
      tags: Array.isArray(activity.tags)
        ? activity.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4)
        : fallback.tags,
      mapQuery: String(activity.mapQuery || "").trim() || `${String(activity.title || fallback.title).trim()} ${input.destination}`,
      neighborhood: String(activity.neighborhood || "").trim() || fallback.neighborhood,
      bookingHint: String(activity.bookingHint || "").trim() || fallback.bookingHint,
      setting: normalizeSetting(activity.setting, fallback.setting),
      familyFriendly: normalizeFamilyFriendly(activity.familyFriendly, fallback.familyFriendly),
    },
    input,
  );

  if (isGenericTitle(candidate.title.toLowerCase()) || seenTitles.has(candidate.title.toLowerCase())) {
    candidate = enrichActivity(
      {
        ...fallback,
        mapQuery: `${fallback.title} ${input.destination}`,
      },
      input,
    );
  }

  seenTitles.add(candidate.title.toLowerCase());
  return candidate;
}

function normalizeCost(value: unknown, fallback: string) {
  const cost = String(value || "").trim();
  return ["$", "$$", "$$$"].includes(cost) ? cost : fallback;
}

function normalizeSetting(value: unknown, fallback?: ActivitySetting): ActivitySetting {
  const setting = String(value || "").trim();
  if (setting === "Indoor" || setting === "Outdoor" || setting === "Mixed") {
    return setting;
  }
  return fallback || "Mixed";
}

function normalizeFamilyFriendly(
  value: unknown,
  fallback?: FamilyFriendlyLevel,
): FamilyFriendlyLevel {
  const level = String(value || "").trim();
  if (level === "High" || level === "Medium" || level === "Low") {
    return level;
  }
  return fallback || "Medium";
}

function enrichActivity(activity: Activity, input: TripInput): Activity {
  const tags = Array.from(new Set(activity.tags.filter(Boolean))).slice(0, 4);
  const setting = normalizeSetting(
    activity.setting ||
      (tags.some((tag) => /Indoor|Museums|Aquarium/i.test(tag))
        ? "Indoor"
        : tags.some((tag) => /Outdoors|Coast|Views|Park|Walking/i.test(tag))
          ? "Outdoor"
          : "Mixed"),
  );
  const familyFriendly = normalizeFamilyFriendly(
    activity.familyFriendly ||
      (tags.some((tag) => /Kid-friendly|Family/i.test(tag))
        ? "High"
        : input.children > 0
          ? "Medium"
          : "Low"),
  );

  return {
    ...activity,
    description: activity.description.trim(),
    duration: activity.duration.trim(),
    cost: normalizeCost(activity.cost, "$$"),
    tags,
    mapQuery: activity.mapQuery.trim() || `${activity.title} ${input.destination}`,
    neighborhood: activity.neighborhood?.trim() || inferNeighborhood(activity.title, input.destination),
    bookingHint:
      activity.bookingHint?.trim() ||
      (tags.some((tag) => /Reserve|Popular|Must-see/i.test(tag))
        ? "Book ahead if this is a priority stop."
        : "Check same-day availability before heading over."),
    setting,
    familyFriendly,
  };
}

function maxActivitiesForInput(input: TripInput) {
  if (input.children > 0 && input.pace === "Packed") {
    return 3;
  }
  return { Relaxed: 2, Balanced: 3, Packed: 4 }[input.pace] || 3;
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
  const activityCount = maxActivitiesForInput(input);
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

  return enrichActivity(
    {
      time: times[input.pace][activityIndex] || times.Balanced[Math.min(activityIndex, 2)],
      title: selected.title,
      description: selected.description,
      duration: activityIndex === 0 ? "45-60 min" : "1-2 hrs",
      cost,
      tags: Array.from(new Set([...selected.tags, cost])).slice(0, 4),
      mapQuery: `${selected.title} ${input.destination}`,
      neighborhood: selected.neighborhood,
      bookingHint: selected.bookingHint,
    },
    input,
  );
}

function createAlternativeActivity(
  input: TripInput,
  dayIndex: number,
  activityIndex: number,
  currentTitle?: string,
): Activity {
  const placeSet = getPlaceSet(input.destination);

  for (let offset = 1; offset <= placeSet.activities.length; offset += 1) {
    const candidate = createFallbackActivity(input, dayIndex, activityIndex, offset);
    if (!currentTitle || candidate.title !== currentTitle) {
      return candidate;
    }
  }

  return createFallbackActivity(input, dayIndex, activityIndex, 1);
}

function createKidFriendlyActivity(
  input: TripInput,
  dayIndex: number,
  activityIndex: number,
): Activity {
  const seed = createFallbackActivity(
    { ...input, children: Math.max(input.children, 1) },
    dayIndex,
    activityIndex,
    Date.now(),
  );

  return enrichActivity(
    {
      ...seed,
      description: `${seed.description} Keep this stop short enough to leave room for a snack or playground reset.`,
      familyFriendly: "High",
      bookingHint: "Good kid-friendly swap; check stroller access or restroom availability if needed.",
      tags: Array.from(new Set([...seed.tags, "Kid-friendly"])).slice(0, 4),
    },
    input,
  );
}

function inferNeighborhood(title: string, destination: string) {
  const text = `${title} ${destination}`;
  if (/Embarcadero|Ferry Building|Exploratorium/i.test(text)) return "Embarcadero";
  if (/Golden Gate|Crissy Field|Palace of Fine Arts/i.test(text)) return "Marina / Presidio";
  if (/Mission Dolores|Tartine|Balmy Alley/i.test(text)) return "Mission District";
  if (/Pier 39|Aquarium of the Bay|Ghirardelli|Alcatraz/i.test(text)) return "Fisherman's Wharf";
  if (/Metropolitan Museum|Central Park|American Museum of Natural History/i.test(text)) {
    return "Upper East / Upper West Side";
  }
  if (/Louvre|Musee d'Orsay|Tuileries/i.test(text)) return "1st arrondissement";
  return destination.split(",")[0].trim();
}

function getPlaceSet(destination: string): PlaceSet {
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
            "Start on the Embarcadero with coffee, pastries, and an easy waterfront first stop.",
          tags: ["Food", "Waterfront", "Easy start"],
          neighborhood: "Embarcadero",
        },
        {
          title: "Exploratorium",
          description:
            "A hands-on science museum on Pier 15 that works especially well for families and mixed-age groups.",
          tags: ["Museums", "Kid-friendly", "Indoor"],
          neighborhood: "Embarcadero",
          bookingHint: "Reserve timed entry on busy weekends.",
        },
        {
          title: "Pier 39",
          description:
            "A lively waterfront stop with sea lions, bay views, and casual food choices nearby.",
          tags: ["Waterfront", "Family", "Must-see"],
          neighborhood: "Fisherman's Wharf",
        },
        {
          title: "Golden Gate Bridge Welcome Center",
          description:
            "A simple base for bridge photos, short walks, and accessible Golden Gate views.",
          tags: ["Scenic", "Outdoors", "Must-see"],
          neighborhood: "Presidio",
        },
        {
          title: "Crissy Field",
          description:
            "A relaxed waterfront walk with bridge views, open space, and room for kids to reset.",
          tags: ["Outdoors", "Kid-friendly", "Views"],
          neighborhood: "Presidio",
        },
        {
          title: "Palace of Fine Arts",
          description:
            "A photogenic, low-stress stop near the Marina with beautiful architecture and easy walking paths.",
          tags: ["Architecture", "Scenic", "Relaxed"],
          neighborhood: "Marina District",
        },
        {
          title: "California Academy of Sciences",
          description:
            "A Golden Gate Park anchor with aquarium, rainforest, planetarium, and indoor flexibility.",
          tags: ["Museums", "Kid-friendly", "Indoor"],
          neighborhood: "Golden Gate Park",
          bookingHint: "Best with advance tickets on school breaks.",
        },
        {
          title: "de Young Museum",
          description:
            "Pair art galleries with the observation tower and nearby park space for a balanced culture stop.",
          tags: ["Museums", "Culture", "Views"],
          neighborhood: "Golden Gate Park",
        },
        {
          title: "Japanese Tea Garden",
          description:
            "A compact, calming Golden Gate Park stop with gardens, tea, and a slower pace.",
          tags: ["Outdoors", "Culture", "Relaxed"],
          neighborhood: "Golden Gate Park",
        },
        {
          title: "Chinatown Dragon Gate",
          description:
            "Begin a Chinatown walk at a clear landmark, then wander toward bakeries, shops, and Grant Avenue.",
          tags: ["Culture", "Shopping", "Walking"],
          neighborhood: "Chinatown",
        },
        {
          title: "City Lights Booksellers",
          description:
            "A specific North Beach stop with literary history and easy access to nearby cafes.",
          tags: ["Culture", "Shopping", "History"],
          neighborhood: "North Beach",
        },
        {
          title: "Coit Tower",
          description:
            "Add skyline views and murals, with a clear payoff if the group is up for the hill.",
          tags: ["Views", "History", "Scenic"],
          neighborhood: "Telegraph Hill",
        },
        {
          title: "Mission Dolores Park",
          description:
            "A local-feeling park break with skyline views and nearby food options in the Mission.",
          tags: ["Outdoors", "Views", "Relaxed"],
          neighborhood: "Mission District",
        },
        {
          title: "Balmy Alley Murals",
          description:
            "A specific Mission District art walk with colorful murals and a compact route.",
          tags: ["Art", "Culture", "Walking"],
          neighborhood: "Mission District",
        },
        {
          title: "Tartine Bakery",
          description:
            "A named food stop for pastries or a casual break near Mission Dolores Park.",
          tags: ["Food", "Bakery", "Popular"],
          neighborhood: "Mission District",
        },
        {
          title: "Alcatraz Island",
          description:
            "A memorable ferry-and-history outing; keep the rest of the day lighter.",
          tags: ["History", "Must-see", "Reserve"],
          neighborhood: "San Francisco Bay",
          bookingHint: "Book ferry tickets well ahead for popular dates.",
        },
        {
          title: "Aquarium of the Bay",
          description:
            "A compact indoor waterfront option that pairs well with Pier 39 or Fisherman's Wharf.",
          tags: ["Kid-friendly", "Indoor", "Waterfront"],
          neighborhood: "Fisherman's Wharf",
        },
        {
          title: "Ghirardelli Square",
          description:
            "A classic dessert stop near the waterfront with easy backup options nearby.",
          tags: ["Food", "Dessert", "Family"],
          neighborhood: "Fisherman's Wharf",
        },
        {
          title: "Lands End Lookout",
          description:
            "A scenic coastal stop with dramatic views, short trail options, and a quieter side of the city.",
          tags: ["Outdoors", "Coast", "Views"],
          neighborhood: "Outer Richmond",
        },
        {
          title: "Sutro Baths",
          description:
            "Explore the ruins and ocean views near Lands End without making the activity too long.",
          tags: ["History", "Coast", "Scenic"],
          neighborhood: "Outer Richmond",
        },
        {
          title: "Twin Peaks",
          description:
            "Use this as a big-view stop when visibility is good, especially near sunset.",
          tags: ["Views", "Scenic", "Sunset"],
          neighborhood: "Twin Peaks",
        },
      ],
    };
  }

  if (/new york|nyc|manhattan/i.test(destination)) {
    return {
      themes: [
        "midtown arrival and icons",
        "central park and museum mile",
        "west village and chelsea",
        "brooklyn bridge and dumbo",
        "soho and lower manhattan",
      ],
      activities: [
        {
          title: "Bryant Park",
          description: "An easy central start near Midtown with coffee, seating, and quick transit connections.",
          tags: ["Outdoors", "Easy start", "Midtown"],
          neighborhood: "Midtown",
        },
        {
          title: "Grand Central Terminal",
          description: "A named New York landmark with architecture, food options, and easy pacing.",
          tags: ["Architecture", "Must-see", "Indoor"],
          neighborhood: "Midtown East",
        },
        {
          title: "The Metropolitan Museum of Art",
          description: "A major museum anchor with flexible route choices for short or long visits.",
          tags: ["Museums", "Culture", "Indoor"],
          neighborhood: "Upper East Side",
          bookingHint: "Reserve tickets in advance if timing matters.",
        },
        {
          title: "Central Park",
          description: "Balance indoor stops with a named park segment and room for a lighter pace.",
          tags: ["Outdoors", "Kid-friendly", "Views"],
          neighborhood: "Manhattan",
        },
        {
          title: "Chelsea Market",
          description: "A reliable food hall stop with options for different tastes and budgets.",
          tags: ["Food", "Market", "Indoor"],
          neighborhood: "Chelsea",
        },
        {
          title: "Brooklyn Bridge Park",
          description: "A scenic waterfront payoff with skyline views and space to slow down.",
          tags: ["Outdoors", "Scenic", "Family"],
          neighborhood: "DUMBO",
        },
      ],
    };
  }

  if (/paris/i.test(destination)) {
    return {
      themes: [
        "river and landmark orientation",
        "louvre and tuileries",
        "left bank museums",
        "marais and market walks",
        "montmartre viewpoints",
      ],
      activities: [
        {
          title: "Jardin des Tuileries",
          description: "A low-friction first stop with open space, monuments, and easy transitions.",
          tags: ["Outdoors", "Scenic", "Relaxed"],
          neighborhood: "1st arrondissement",
        },
        {
          title: "Musee du Louvre",
          description: "A major museum stop best handled with a focused route instead of trying to see everything.",
          tags: ["Museums", "Culture", "Indoor"],
          neighborhood: "1st arrondissement",
          bookingHint: "Timed-entry tickets help avoid long waits.",
        },
        {
          title: "Sainte-Chapelle",
          description: "A specific historic stop with a strong visual payoff and manageable visit length.",
          tags: ["History", "Architecture", "Indoor"],
          neighborhood: "Ile de la Cite",
        },
        {
          title: "Le Marais",
          description: "A named neighborhood walk with shops, cafes, and flexible pacing.",
          tags: ["Shopping", "Walking", "Food"],
          neighborhood: "Le Marais",
        },
        {
          title: "Musee d'Orsay",
          description: "A museum stop with enough structure for art lovers and enough brevity for mixed groups.",
          tags: ["Museums", "Culture", "Indoor"],
          neighborhood: "7th arrondissement",
        },
        {
          title: "Square Louise-Michel",
          description: "A useful Montmartre base for Sacre-Coeur views and a lighter outdoor block.",
          tags: ["Views", "Outdoors", "Scenic"],
          neighborhood: "Montmartre",
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
        title: `${destination.split(",")[0].trim()} Old Town`,
        description: "Start in a named historic district or central quarter for orientation, food, and easy walking.",
        tags: ["History", "Walking", "Easy start"],
      },
      {
        title: `${destination.split(",")[0].trim()} Central Market`,
        description: "Use a specific market or food hall area for a flexible meal stop and local flavor.",
        tags: ["Food", "Market", "Group-friendly"],
      },
      {
        title: `${destination.split(",")[0].trim()} Museum Quarter`,
        description: "Keep one named culture block that can work even if the weather changes.",
        tags: ["Museums", "Culture", "Indoor"],
      },
      {
        title: `${destination.split(",")[0].trim()} Riverfront Promenade`,
        description: "Balance indoor time with a named promenade, waterfront, or scenic pedestrian area.",
        tags: ["Outdoors", "Scenic", "Relaxed"],
      },
      {
        title: `${destination.split(",")[0].trim()} Botanical Garden`,
        description: "Add a lower-pressure green space for breaks and slower pacing.",
        tags: ["Outdoors", "Family", "Views"],
      },
      {
        title: `${destination.split(",")[0].trim()} Arts District`,
        description: "Use a named district with cafes, galleries, and flexible walking instead of a generic neighborhood stop.",
        tags: ["Culture", "Shopping", "Walking"],
      },
    ],
  };
}

function isGenericTitle(title: string) {
  return genericTitlePatterns.some((pattern) => pattern.test(title));
}

function toLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
