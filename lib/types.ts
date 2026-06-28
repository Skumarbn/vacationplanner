export type Budget = "Budget" | "Moderate" | "Premium";
export type Pace = "Relaxed" | "Balanced" | "Packed";
export type ItineraryAction = "generate" | "regenerate-day" | "swap-activity";

export type TripInput = {
  destination: string;
  startDate: string;
  days: number;
  adults: number;
  children: number;
  budget: Budget;
  pace: Pace;
  interests: string[];
};

export type Activity = {
  time: string;
  title: string;
  description: string;
  duration: string;
  cost: string;
  tags: string[];
  mapQuery: string;
};

export type ItineraryDay = {
  title: string;
  meta: string;
  activities: Activity[];
};

export type Itinerary = {
  title: string;
  summary: {
    pace: string;
    budget: string;
    bestFor: string;
    activityCount: number;
  };
  destination: string;
  days: ItineraryDay[];
  notes: string[];
};

export type ItineraryTarget = {
  dayIndex?: number;
  activityIndex?: number;
};

export type ItineraryRequest = {
  action?: ItineraryAction;
  target?: ItineraryTarget;
  token?: string;
  tripInput?: Partial<TripInput>;
  existingItinerary?: Itinerary | null;
};

export type ItineraryResponse = {
  itinerary: Itinerary;
  tripInput: TripInput;
  token: string;
  generatedBy: "openai" | "demo";
  model: string;
};

export type ApiError = {
  error: string;
};
