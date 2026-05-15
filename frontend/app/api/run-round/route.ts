import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  let hospitals: string | string[];
  let wallets: string[] | undefined;
  let round: number;

  try {
    const body = await req.json();
    hospitals = body.hospitals;
    wallets = body.wallets;
    round = body.round;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  if (!hospitals || !round) {
    return new Response(JSON.stringify({ error: "hospitals and round required" }), { status: 400 });
  }

  const hospitalsStr = Array.isArray(hospitals) ? hospitals.join(",") : hospitals;
  const repoRoot = path.join(process.cwd(), "..");

  const args = [
    "-m", "agent.neurolledger.runner",
    "--hospitals", hospitalsStr,
    "--round", String(round),
  ];

  if (wallets && wallets.length > 0) {
    args.push("--wallets", wallets.join(","));
  }

  // Try TeeML if COMPUTE_API_URL is set, otherwise skip
  const computeUrl = process.env.COMPUTE_API_URL;
  if (!computeUrl) {
    args.push("--no-tee");
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn("python3", args, {
        cwd: repoRoot,
        env: { ...process.env },
      });

      const enqueue = (line: string) => {
        if (line.trim()) {
          controller.enqueue(encoder.encode(`data: ${line}\n\n`));
        }
      };

      // Buffer stdout to emit complete lines
      let stdoutBuf = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        lines.forEach(enqueue);
      });

      // stderr lines go through too (for warnings, tracebacks)
      let stderrBuf = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";
        lines.forEach(enqueue);
      });

      const timeout = setTimeout(() => {
        proc.kill();
        enqueue(JSON.stringify({ event: "done", exitCode: -1, error: "timeout after 300s" }));
        controller.close();
      }, 300_000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (stdoutBuf.trim()) enqueue(stdoutBuf);
        if (stderrBuf.trim()) enqueue(stderrBuf);
        enqueue(JSON.stringify({ event: "done", exitCode: code ?? 0 }));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
