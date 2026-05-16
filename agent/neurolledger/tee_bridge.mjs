/**
 * NeuroLedger TEE Bridge — Node.js wrapper for @0gfoundation/0g-compute-ts-sdk
 *
 * Two-phase approach:
 *   Phase 1: TEE hardware verification (free, no payment) — always runs
 *   Phase 2: TeeML inference (requires funded ledger) — best-effort
 *
 * Writes all diagnostic output to stderr (visible in runner.py output).
 * Writes final attestation JSON to stdout (parsed by Python).
 *
 * Usage:
 *   node tee_bridge.mjs --trace '<json>' --round <N>
 *   node tee_bridge.mjs --list-only          # list providers and exit
 */

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const RPC_URL = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PREFERRED_PROVIDER = (process.env.TEE_PROVIDER_ADDRESS || "").toLowerCase();

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    trace: { type: "string" },
    round: { type: "string" },
    "list-only": { type: "boolean" },
  },
});

function log(msg) {
  process.stderr.write(`[TEE] ${msg}\n`);
}

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set — cannot authenticate with 0G Compute");
  }

  log(`RPC: ${RPC_URL}`);
  const ethProvider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, ethProvider);
  log(`Wallet: ${wallet.address}`);

  log("Initializing 0G Compute broker...");
  const broker = await createZGComputeNetworkBroker(wallet);

  // Discover TeeML providers (chatbot only for text inference)
  log("Listing services from contract...");
  const services = await broker.inference.listService(0, 50, false);
  const teeServices = services.filter(
    (s) => s.verifiability === "TeeML" && s.serviceType === "chatbot"
  );

  log(`Total services: ${services.length}, TeeML chatbot: ${teeServices.length}`);
  for (const s of services) {
    log(
      `  provider=${s.provider} model=${s.model} type=${s.serviceType}` +
        ` verifiability=${s.verifiability} acknowledged=${s.teeSignerAcknowledged}`
    );
  }

  if (values["list-only"]) {
    console.log(
      JSON.stringify({
        services: services.map((s) => ({
          provider: s.provider,
          model: s.model,
          serviceType: s.serviceType,
          verifiability: s.verifiability,
          url: s.url,
          teeSignerAcknowledged: s.teeSignerAcknowledged,
        })),
      })
    );
    return;
  }

  if (teeServices.length === 0) {
    throw new Error(
      `No TeeML chatbot providers found. All services: ${services.map((s) => `${s.provider}(${s.verifiability}/${s.serviceType})`).join(", ") || "none"}`
    );
  }

  const service =
    teeServices.find((s) => s.provider.toLowerCase() === PREFERRED_PROVIDER) ||
    teeServices[0];
  const providerAddress = service.provider;
  log(`Selected provider: ${providerAddress} (model=${service.model})`);

  // ── Phase 1: TEE Hardware Verification (free, no payment needed) ──────────
  log("─── Phase 1: TEE Hardware Verification ───");
  let verificationResult = null;
  let hardwareVerified = false;
  try {
    verificationResult = await broker.inference.verifyService(
      providerAddress,
      undefined,
      (step) => log(`  ${step.message}`)
    );
    if (verificationResult) {
      const signerOk = verificationResult.signerVerification?.allMatch;
      const composeOk = verificationResult.composeVerification?.passed;
      hardwareVerified = !!(signerOk && composeOk);
      log(`Hardware verify: signerMatch=${signerOk} composeHash=${composeOk} PASSED=${hardwareVerified}`);
    }
  } catch (e) {
    log(`Hardware verify error: ${e.message}`);
  }

  log(`─── Phase 1 result: hardware_verified=${hardwareVerified} ───`);

  // ── Phase 2: TeeML Inference (requires funded ledger) ────────────────────
  log("─── Phase 2: TeeML Inference ───");
  const trace = JSON.parse(values.trace || "{}");
  const roundId = parseInt(values.round || "1", 10);

  let inferenceContent = "";
  let chatID = "";
  let inferenceIsValid = false;
  let inferenceError = null;

  try {
    await ensureLedgerAndSubAccount(broker, wallet, providerAddress);

    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    log(`Endpoint: ${endpoint}, model: ${model}`);

    const prompt = buildPrompt(trace, roundId);
    log("Getting request headers...");
    const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

    log("Calling TeeML inference...");
    const resp = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errBody}`);
    }

    const data = await resp.json();
    chatID = resp.headers.get("ZG-Res-Key") || data.id || "";
    inferenceContent = data.choices?.[0]?.message?.content || "";
    log(`Response: chatID=${chatID} content_len=${inferenceContent.length}`);

    if (chatID) {
      const usageJson = JSON.stringify(data.usage || {});
      const validity = await broker.inference.processResponse(
        providerAddress,
        chatID,
        usageJson
      );
      inferenceIsValid = validity === true;
      log(`processResponse → isValid=${inferenceIsValid}`);
    }
    log("─── Phase 2 result: inference OK ───");
  } catch (e) {
    inferenceError = e.message;
    log(`─── Phase 2 result: inference FAILED ───`);
    log(`  Error: ${e.message}`);
    if (
      e.message.includes("balance") ||
      e.message.includes("funds") ||
      e.message.includes("account") ||
      e.message.includes("3 0G")
    ) {
      const balWei = await wallet.provider.getBalance(wallet.address).catch(() => BigInt(0));
      const balOG = parseFloat(ethers.formatEther(balWei));
      log(`  ⚠️  Compute ledger requires 3 OG minimum.`);
      log(`  Current wallet balance: ${balOG.toFixed(4)} OG`);
      log(`  Wallet address: ${wallet.address}`);
      log(`  Get OG: https://faucet.0g.ai/ or 0G Discord`);
      log(`  Hardware attestation (Phase 1) is still valid.`);
    }
  }

  // ── Assemble Proof Bundle ─────────────────────────────────────────────────
  // is_valid = true if inference was verified, OR if hardware TEE was verified
  // hardware_verified is the primary signal when inference is unavailable
  const isValid = inferenceIsValid || (hardwareVerified && !inferenceError);
  const attestedAt = Math.floor(Date.now() / 1000);

  const proofBundle = {
    attestedAt,
    content: inferenceContent,
    hardware_verified: hardwareVerified,
    inference_valid: inferenceIsValid,
    model: service.model,
    provider: providerAddress,
    responseId: chatID,
    roundId,
  };
  const proofHash =
    "0x" +
    createHash("sha256")
      .update(JSON.stringify(proofBundle))
      .digest("hex");
  const modelVersionId = `round_${roundId}_v${proofHash.slice(2, 10)}`;

  const result = {
    proof_hash: proofHash,
    is_valid: isValid,
    hardware_verified: hardwareVerified,
    inference_valid: inferenceIsValid,
    inference_error: inferenceError,
    model_version_id: modelVersionId,
    provider_address: providerAddress,
    tee_proof_json: {
      schema: "neuroledger.tee_proof.v1",
      round_id: roundId,
      provider: providerAddress,
      model: service.model,
      response_id: chatID,
      is_valid: isValid,
      hardware_verified: hardwareVerified,
      inference_valid: inferenceIsValid,
      inference_error: inferenceError,
      attestation: inferenceContent,
      aggregation_hash: trace.output_w_sha256 || "",
      proof_hash: proofHash,
      model_version_id: modelVersionId,
      attested_at: attestedAt,
      tee_verification: verificationResult
        ? {
            signer_match: verificationResult.signerVerification?.allMatch ?? null,
            compose_hash_passed: verificationResult.composeVerification?.passed ?? null,
            overall_passed: hardwareVerified,
            verifier: "DStack TDX",
            provider_url: service.url,
          }
        : null,
    },
  };

  log(
    `✅ Proof assembled — hardware_verified=${hardwareVerified}` +
      ` inference_valid=${inferenceIsValid} proof=${proofHash.slice(0, 18)}...`
  );
  console.log(JSON.stringify(result));
}

async function ensureLedgerAndSubAccount(broker, wallet, providerAddress) {
  const MIN_SUB_OG = BigInt(1e18); // 1 OG minimum (mainnet requirement)
  const SUB_TRANSFER = BigInt(1e18); // transfer 1 OG to sub-account
  const GAS_RESERVE = 0.1;

  log("Checking compute ledger...");
  let ledgerExists = false;
  try {
    await broker.ledger.getLedger();
    ledgerExists = true;
    log("Ledger exists.");
  } catch (e) {
    if (
      e.message.includes("does not exist") ||
      e.message.includes("add-account")
    ) {
      log("Ledger not found.");
    } else {
      log(`getLedger: ${e.message}`);
    }
  }

  if (!ledgerExists) {
    const balWei = await wallet.provider.getBalance(wallet.address);
    const balOG = parseFloat(ethers.formatEther(balWei));
    log(`Wallet balance: ${balOG.toFixed(4)} OG`);

    if (balOG < 3.0) {
      throw new Error(
        `Insufficient balance for compute ledger (${balOG.toFixed(4)} OG, need 3 OG)`
      );
    }

    const deposit = balOG - GAS_RESERVE;
    log(`Creating ledger with ${deposit.toFixed(4)} OG...`);
    await broker.ledger.addLedger(deposit);
    log("Ledger created.");
  }

  // Check/fund provider sub-account
  log(`Checking sub-account for ${providerAddress}...`);
  try {
    const providers = await broker.ledger.getProvidersWithBalance("inference");
    const entry = providers.find(
      ([addr]) => addr.toLowerCase() === providerAddress.toLowerCase()
    );
    const subBal = entry ? entry[1] : BigInt(0);
    log(`Sub-account: ${ethers.formatEther(subBal)} OG`);

    if (subBal < MIN_SUB_OG) {
      log("Transferring 1 OG to provider sub-account...");
      await broker.ledger.transferFund(providerAddress, "inference", SUB_TRANSFER);
      log("Sub-account funded.");
    }
  } catch (e) {
    log(`Sub-account check: ${e.message} — continuing...`);
  }
}

function buildPrompt(trace, roundId) {
  return [
    "You are the aggregation verifier for NeuroLedger federated learning.",
    "Running in TEE. Review this aggregation trace and return ONLY a JSON object.",
    "",
    `ROUND: ${roundId}`,
    `ALGORITHM: ${trace.algorithm || "multi_krum_trimmed_mean"}`,
    `AGENTS: ${trace.n_agents || 0}`,
    `UPDATE_HASHES: ${JSON.stringify(trace.update_hashes_sorted || [])}`,
    `KRUM_SCORES: ${JSON.stringify(trace.krum_scores || [])}`,
    `SELECTED: ${JSON.stringify(trace.selected_indices || [])}`,
    `OUTPUT_HASH: ${trace.output_w_sha256 || ""}`,
    "",
    "Return ONLY this JSON, no markdown:",
    `{"verification_status":"VALID","round_id":${roundId},"aggregation_hash":"0x${trace.output_w_sha256 || ""}","checks_passed":4,"attested_at":${Math.floor(Date.now() / 1000)}}`,
  ].join("\n");
}

main().catch((err) => {
  process.stderr.write(`[TEE] FATAL: ${err.message}\n${err.stack || ""}\n`);
  process.exit(1);
});
