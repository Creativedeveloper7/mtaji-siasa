import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await readRequestSession();
  return NextResponse.json({ user });
}
