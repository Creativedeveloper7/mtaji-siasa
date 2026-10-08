import { NextResponse } from "next/server";
import { readSnapshot } from "@/server/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const result = readSnapshot();
  return NextResponse.json(result.body);
}
