import { NextResponse } from "next/server";
import { directory, searchTargets } from "@/lib/legal/contracts";
import { legalContext, legalError } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const url = new URL(request.url);
    if (url.searchParams.get("directory") === "1") {
      return NextResponse.json({ users: await directory(db, actor) });
    }
    return NextResponse.json(await searchTargets(db, actor, url.searchParams.get("q") ?? ""));
  } catch (error) {
    return legalError(error);
  }
}
