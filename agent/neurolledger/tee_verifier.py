"""
NeuroLedger — TEE Attestation via 0G Compute SDK (tee_bridge.mjs subprocess)

Flow:
  verify_ready() → checks PRIVATE_KEY + Node.js + bridge script present
  attest()       → runs tee_bridge.mjs, streams stderr as live [TEE] log lines,
                   parses final JSON from stdout.

TEE proof is only skipped if verify_ready() returns False (prerequisites missing).
All errors are printed in full — no silent swallowing.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from typing import Optional, Tuple

_BRIDGE = os.path.join(os.path.dirname(__file__), "tee_bridge.mjs")


class TEEAggregationVerifier:
    """Calls the official @0gfoundation/0g-compute-ts-sdk via tee_bridge.mjs."""

    def __init__(self):
        self.provider_address: Optional[str] = None
        self.provider_model: Optional[str] = None

    def verify_ready(self) -> Tuple[bool, str]:
        """
        Precondition check — fast, no network calls.
        Returns (True, status_msg) if prerequisites are in place so attest() can try.
        Returns (False, reason) if something fundamental is missing.
        """
        if not os.path.exists(_BRIDGE):
            return (False, f"tee_bridge.mjs not found at {_BRIDGE}")

        private_key = os.environ.get("PRIVATE_KEY", "")
        if not private_key:
            return (False, "PRIVATE_KEY not set in environment")

        # Verify Node.js is available and can import the SDK
        try:
            check = subprocess.run(
                [
                    "node",
                    "--input-type=module",
                    "--eval",
                    "import('@0gfoundation/0g-compute-ts-sdk')"
                    ".then(()=>process.exit(0))"
                    ".catch(e=>{process.stderr.write(e.message+'\\n');process.exit(1)})",
                ],
                capture_output=True,
                text=True,
                timeout=20,
                env={**os.environ},
            )
            if check.returncode != 0:
                return (
                    False,
                    f"0g-compute-ts-sdk not importable: {check.stderr.strip()[:200]}",
                )
        except FileNotFoundError:
            return (False, "node executable not found in PATH")
        except subprocess.TimeoutExpired:
            return (False, "Node.js SDK import check timed out")
        except Exception as e:
            return (False, f"Node.js check failed: {e}")

        preferred = os.environ.get("TEE_PROVIDER_ADDRESS", "")
        status = (
            f"SDK ready — provider={preferred}"
            if preferred
            else "SDK ready — will auto-select first TeeML provider"
        )
        return (True, status)

    def list_providers(self) -> list:
        """List available 0G Compute services (for debugging/diagnostics)."""
        result = subprocess.run(
            ["node", _BRIDGE, "--list-only"],
            capture_output=True,
            text=True,
            timeout=30,
            env={**os.environ},
        )
        if result.stderr:
            for line in result.stderr.strip().split("\n"):
                print(f"  {line}", flush=True)
        if result.returncode != 0:
            raise RuntimeError(f"list_providers failed: {result.stderr[-300:]}")
        return json.loads(result.stdout).get("services", [])

    def attest(self, aggregation_trace: dict, round_id: int) -> dict:
        """
        Run TEE attestation via tee_bridge.mjs.

        All stderr lines from the bridge (provider discovery, TEE verification
        steps, processResponse result) are forwarded to stdout so they appear
        in the runner output.

        Returns the parsed result dict with:
          proof_hash, is_valid, model_version_id, provider_address, tee_proof_json
        """
        env = {**os.environ}

        print(f"[TEE] launching tee_bridge.mjs (0G Compute SDK)...", flush=True)
        proc = subprocess.Popen(
            [
                "node",
                _BRIDGE,
                "--trace",
                json.dumps(aggregation_trace),
                "--round",
                str(round_id),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

        # First run creates the compute ledger (blockchain TX) — allow up to 10 min.
        # Subsequent runs (ledger already exists) complete in ~2 min.
        stdout_data, stderr_data = proc.communicate(timeout=600)

        # Print all stderr lines (TEE diagnostic log)
        if stderr_data:
            for line in stderr_data.strip().split("\n"):
                if line.strip():
                    print(f"  {line}", flush=True)

        if proc.returncode != 0:
            raise RuntimeError(
                f"tee_bridge.mjs exited with code {proc.returncode}.\n"
                f"Last stderr: {stderr_data.strip()[-600:]}"
            )

        # The SDK may emit diagnostic lines before the JSON (e.g. "Detected testnet...")
        # Extract the last line that starts with '{' as the JSON payload.
        json_line = ""
        for line in stdout_data.splitlines():
            stripped = line.strip()
            if stripped.startswith("{"):
                json_line = stripped

        if not json_line:
            raise RuntimeError(
                "tee_bridge.mjs produced no JSON output on stdout.\n"
                f"stdout was: {stdout_data.strip()[-300:]}\n"
                f"stderr was: {stderr_data.strip()[-300:]}"
            )

        result = json.loads(json_line)
        self.provider_address = result.get("provider_address")
        self.provider_model = result.get("tee_proof_json", {}).get("model")
        return result

    # ── Legacy shims (runner.py uses these via attest_aggregation) ──────────

    def ensure_ready(self) -> bool:
        ok, _ = self.verify_ready()
        return ok

    def attest_aggregation(self, aggregation_trace: dict, round_id: int) -> dict:
        result = self.attest(aggregation_trace, round_id)
        return {
            "proof_hash": result["proof_hash"],
            "is_valid": result["is_valid"],
            "model_version_id": result["model_version_id"],
            "attestation_json": result["tee_proof_json"],
            "provider_address": result["provider_address"],
            "tee_proof_cid": "pending",
        }
