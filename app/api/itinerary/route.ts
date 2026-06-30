import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server.js";
import { generateItinerary, normalizeTripInput } from "../../../lib/itinerary.ts";
import type { ItineraryAction, ItineraryRequest } from "../../../lib/types.ts";

const allowedActions: ItineraryAction[] = ["generate", "regenerate-day", "swap-activity"];

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ItineraryRequest;
    const input = normalizeTripInput(payload.tripInput);
    const action = allowedActions.includes(payload.action as ItineraryAction)
      ? (payload.action as ItineraryAction)
      : "generate";

    const result = await generateItinerary({
      input,
      action,
      existingItinerary: payload.existingItinerary || null,
      target: payload.target || {},
    });

    return NextResponse.json({
      itinerary: result.itinerary,
      tripInput: input,
      token: payload.token || randomBytes(6).toString("base64url"),
      generatedBy: result.generatedBy,
      model: result.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate itinerary.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
