import { NextResponse } from "next/server";
import { readSnapshot } from "@/server/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readSnapshot();
  return NextResponse.json(result.body);
}
