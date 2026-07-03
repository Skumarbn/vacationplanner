import { NextResponse } from "next/server.js";
import { getHealthSnapshot } from "../../../lib/env.ts";

export function GET() {
  return NextResponse.json(getHealthSnapshot());
}
