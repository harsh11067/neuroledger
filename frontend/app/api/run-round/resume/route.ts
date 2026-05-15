import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { roundId, hospital, txHash } = await req.json() as {
      roundId: number;
      hospital: string;
      txHash: string;
    };

    if (!roundId || !hospital || !txHash) {
      return NextResponse.json({ error: "roundId, hospital, txHash required" }, { status: 400 });
    }

    // Sanitize hospital name for filesystem use
    const safeName = hospital.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join("/tmp", `neuroledger_resume_${roundId}_${safeName}.txt`);
    await writeFile(filePath, txHash.trim());

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
