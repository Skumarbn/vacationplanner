import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server.js";
import { generateItinerary, ItineraryError, normalizeTripInput } from "../../../lib/itinerary.ts";
import type { ApiError, ItineraryAction, ItineraryRequest } from "../../../lib/types.ts";

const allowedActions: ItineraryAction[] = [
  "generate",
  "regenerate-day",
  "swap-activity",
  "relax-day",
  "cheaper-day",
  "kid-friendly-activity",
  "remove-activity",
];

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ItineraryRequest;
    const requestedAction = payload.action || "generate";
    if (!allowedActions.includes(requestedAction)) {
      throw new ItineraryError("validation_error", "Unsupported itinerary action.", 400, {
        action: `Supported actions: ${allowedActions.join(", ")}`,
      });
    }

    const input = normalizeTripInput(payload.tripInput);
    const action = requestedAction as ItineraryAction;

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
    const apiError = serializeError(error);
    return NextResponse.json(apiError.body, { status: apiError.status });
  }
}

function serializeError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof ItineraryError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  return {
    status: 400,
    body: {
      error: error instanceof Error ? error.message : "Unable to generate itinerary.",
      code: "validation_error",
    },
  };
}
