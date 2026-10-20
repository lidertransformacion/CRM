import { NextResponse } from "next/server";
import type { TargetType } from "@/lib/legal/access";
import { linksForTarget } from "@/lib/legal/contracts";
import { legalContext, legalError } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as TargetType;
    const key = url.searchParams.get("key") ?? "";
    return NextResponse.json({ contracts: await linksForTarget(db, actor, type, key) });
  } catch (error) {
    return legalError(error);
  }
}
