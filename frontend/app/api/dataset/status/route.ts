import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const TEMP_BASE = path.join(process.cwd(), "..", "tmp", "neuroledger_uploads");

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ hasDataset: false });

  const safeAddress = wallet.toLowerCase().replace(/[^a-f0-9x]/g, "");
  const metaPath = path.join(TEMP_BASE, safeAddress, "meta.json");

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf-8"));
    return NextResponse.json({ hasDataset: true, meta });
  } catch {
    return NextResponse.json({ hasDataset: false });
  }
}
