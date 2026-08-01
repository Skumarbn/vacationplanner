export type Budget = "Budget" | "Moderate" | "Premium";
export type Pace = "Relaxed" | "Balanced" | "Packed";
export type ItineraryAction =
  | "generate"
  | "regenerate-day"
  | "swap-activity"
  | "relax-day"
  | "cheaper-day"
  | "kid-friendly-activity"
  | "remove-activity";

export type ActivitySetting = "Indoor" | "Outdoor" | "Mixed";
export type FamilyFriendlyLevel = "High" | "Medium" | "Low";
export type FeedbackSentiment = "like" | "avoid";

export type TripFeedbackEntry = {
  activityKey: string;
  title: string;
  mapQuery: string;
  tags: string[];
  sentiment: FeedbackSentiment;
  createdAt: string;
};

export type FeedbackRequestContext = {
  liked: TripFeedbackEntry[];
  avoided: TripFeedbackEntry[];
  replaceTarget?: {
    title: string;
    mapQuery: string;
    tags: string[];
  };
};

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
  neighborhood?: string;
  bookingHint?: string;
  setting?: ActivitySetting;
  familyFriendly?: FamilyFriendlyLevel;
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
  feedback?: FeedbackRequestContext;
};

export type ItineraryResponse = {
  itinerary: Itinerary;
  tripInput: TripInput;
  token: string;
  generatedBy: "openai" | "demo";
  model: string;
  warning?: ApiError;
};

export type ApiErrorCode =
  | "validation_error"
  | "invalid_destination"
  | "provider_error"
  | "rate_limited"
  | "malformed_response"
  | "demo_fallback";

export type ApiError = {
  error: string;
  code?: ApiErrorCode;
  details?: Record<string, string>;
};
