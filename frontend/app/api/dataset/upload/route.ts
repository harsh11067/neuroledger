import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const TEMP_BASE = path.join(process.cwd(), "..", "tmp", "neuroledger_uploads");

function parseCSVStats(csvText: string) {
  const lines = csvText.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return { rows: 0, cols: 0, columns: [], labelColumn: "", classDistribution: {}, featureCount: 0, missingValues: 0, hasHeader: false, labelColumnIndex: 0 };

  const firstLine = lines[0].split(",");
  const hasHeader = firstLine.some(v => isNaN(Number(v.trim().replace(/"/g, ""))));
  const headers = hasHeader ? firstLine.map(h => h.trim().replace(/"/g, "")) : firstLine.map((_, i) => `col_${i}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.length;
  const cols = headers.length;

  const labelKeywords = ["label", "target", "class", "diagnosis", "output", "y", "result", "outcome"];
  let labelIdx = headers.length - 1;
  for (let i = 0; i < headers.length; i++) {
    if (labelKeywords.some(kw => headers[i].toLowerCase().includes(kw))) {
      labelIdx = i;
      break;
    }
  }

  const classCounts: Record<string, number> = {};
  for (const line of dataLines.slice(0, 500)) {
    const vals = line.split(",");
    if (vals[labelIdx] !== undefined) {
      const v = vals[labelIdx].trim().replace(/"/g, "");
      classCounts[v] = (classCounts[v] || 0) + 1;
    }
  }

  let missingCount = 0;
  for (const line of dataLines.slice(0, 200)) {
    const vals = line.split(",");
    for (const v of vals) {
      if (v.trim() === "" || v.trim() === "?" || v.trim().toLowerCase() === "na") missingCount++;
    }
  }

  return {
    rows,
    cols,
    columns: headers,
    labelColumn: headers[labelIdx],
    labelColumnIndex: labelIdx,
    classDistribution: classCounts,
    missingValues: missingCount,
    hasHeader,
    featureCount: cols - 1,
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const walletAddress = formData.get("wallet") as string;
    const hospitalName = formData.get("hospitalName") as string;

    if (!file || !walletAddress) {
      return NextResponse.json({ error: "file and wallet required" }, { status: 400 });
    }
    if (!file.name.endsWith(".csv") && !file.type.includes("csv")) {
      return NextResponse.json({ error: "Only CSV files accepted" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const csvText = buffer.toString("utf-8");
    const stats = parseCSVStats(csvText);

    if (stats.rows < 10) {
      return NextResponse.json({ error: "Need at least 10 rows" }, { status: 400 });
    }

    const safeAddress = walletAddress.toLowerCase().replace(/[^a-f0-9x]/g, "");
    const uploadDir = path.join(TEMP_BASE, safeAddress);
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, "dataset.csv");
    await writeFile(filePath, buffer);

    const meta = {
      hospitalName,
      walletAddress,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      stats,
      filePath,
    };
    await writeFile(path.join(uploadDir, "meta.json"), JSON.stringify(meta, null, 2));

    return NextResponse.json({
      success: true,
      stats,
      uploadPath: filePath,
      message: `${stats.rows} patient records ready for training. Data stays local.`,
    });
  } catch (err) {
    console.error("[dataset/upload]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
