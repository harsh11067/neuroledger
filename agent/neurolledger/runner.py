"""
NeuroLedger end-to-end round orchestrator.

Usage:
  python -m agent.neurolledger.runner \
    --hospitals manipal,srenivas,dfl \
    --round 1

Environment variables (from .env):
  AGENT_A_KEY, AGENT_B_KEY, AGENT_C_KEY, AGENT_D_KEY, AGENT_E_KEY
  CONTRACT_ADDRESS, OG_RPC_URL, COMPUTE_API_URL
"""
import argparse
import hashlib
import os
import json
import sys

# Load .env from project root
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
    load_dotenv(dotenv_path=_env_path, override=False)
except ImportError:
    pass

# Support running as script or as module
try:
    from .data_loader import load_hospital, get_hospital_cfg, _HOSPITAL_MAP, load_uploaded_dataset, delete_uploaded_dataset
    from .model import FederatedLogisticRegression
    from .dp import DPMechanism
    from .hashing import hash_gradient, hash_model
    from .storage import upload_gradient, upload_bytes
    from .aggregator import aggregate
    from .tee_verifier import TEEAggregationVerifier
except ImportError:
    from data_loader import load_hospital, get_hospital_cfg, _HOSPITAL_MAP, load_uploaded_dataset, delete_uploaded_dataset
    from model import FederatedLogisticRegression
    from dp import DPMechanism
    from hashing import hash_gradient, hash_model
    from storage import upload_gradient, upload_bytes
    from aggregator import aggregate
    from tee_verifier import TEEAggregationVerifier

import time as _time
import numpy as np

RPC_URL = os.environ.get("OG_RPC_URL", "https://evmrpc-testnet.0g.ai")
CHAIN_ID = 16602


def submit_gradient_onchain(w3, contract, account, round_id: int, cid: str,
                             update_hash: str, dp_proof_hash: str):
    """Submit a single gradient to the contract."""
    update_hash_bytes = bytes.fromhex(update_hash[2:]) if update_hash.startswith("0x") else bytes.fromhex(update_hash)
    dp_hash_bytes = bytes.fromhex(dp_proof_hash[2:]) if dp_proof_hash.startswith("0x") else bytes.fromhex(dp_proof_hash)

    tx = contract.functions.submitGradient(
        round_id, cid, update_hash_bytes, dp_hash_bytes
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 400_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": CHAIN_ID,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt["status"] != 1:
        raise RuntimeError(f"submitGradient reverted (gasUsed: {receipt['gasUsed']})")
    return receipt


def ensure_agent_registered(w3, contract, account, hospital_name: str, chain_id: int):
    """Register agent if not already registered. Requires 0.01 OG stake."""
    info = contract.functions.agents(account.address).call()
    # info[12] = registered bool (index depends on struct order)
    # Use hospitalName field — if non-empty, already registered
    if info[1]:  # hospitalName field
        print(f"  ✓ {hospital_name} already registered as '{info[1]}'")
        return
    print(f"  → Registering {hospital_name} on 0G Galileo (stake: 0.01 OG)...")
    tx = contract.functions.registerAgent(
        hospital_name, "APAC", "Medical AI", 7500, 5000
    ).build_transaction({
        "from": account.address,
        "value": w3.to_wei(0.01, "ether"),
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 500_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt["status"] != 1:
        raise RuntimeError(f"registerAgent reverted (TX: 0x{receipt['transactionHash'].hex()}, gasUsed: {receipt['gasUsed']})")
    print(f"  ✅ Registered TX: 0x{receipt['transactionHash'].hex()}")


def start_round_onchain(w3, contract, account, chain_id: int) -> int:
    """Call startRound() and return the new round ID from the RoundStarted event."""
    tx = contract.functions.startRound().build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 500_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt["status"] != 1:
        raise RuntimeError(f"startRound reverted — TX: 0x{receipt['transactionHash'].hex()}, gasUsed: {receipt['gasUsed']}")

    # Parse the actual new round ID from the RoundStarted event in the receipt.
    # Do NOT use currentRound() — the RPC may return the old value if the node
    # hasn't fully indexed the block yet, causing submitGradient to target a
    # completed round and revert.
    new_round_id = None
    for log in receipt["logs"]:
        try:
            decoded = contract.events.RoundStarted().process_log(log)
            new_round_id = int(decoded["args"]["roundId"])
            break
        except Exception:
            continue

    if new_round_id is None:
        # Last-resort fallback only — should not be needed in practice
        new_round_id = contract.functions.currentRound().call()

    print(f"  ✅ Round #{new_round_id} started — TX: 0x{receipt['transactionHash'].hex()}")
    return new_round_id


def publish_aggregation_onchain(w3, contract, account, round_id: int,
                                global_model_cid: str, agg_hash: str,
                                proof_hash: str, model_hash: str,
                                tee_proof_cid: str, dp_epsilon: float,
                                model_version_id: str):
    """Publish aggregation result to the contract."""
    def to_bytes32(h: str) -> bytes:
        h = h[2:] if h.startswith("0x") else h
        return bytes.fromhex(h.ljust(64, "0")[:64])

    # Compute a simple gradient Merkle root placeholder (SHA256 of sorted hashes)
    import hashlib, json as _json
    merkle_input = _json.dumps(sorted([agg_hash]), sort_keys=True).encode()
    merkle_root = bytes.fromhex(hashlib.sha256(merkle_input).hexdigest())

    tx = contract.functions.publishAggregation(
        round_id,
        global_model_cid,
        to_bytes32(agg_hash),
        to_bytes32(proof_hash),
        merkle_root,
        to_bytes32(model_hash),
        tee_proof_cid,
        int(dp_epsilon * 1_000_000),
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 500_000,
        "gasPrice": w3.eth.gas_price,
        "chainId": CHAIN_ID,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    return receipt


def main():
    parser = argparse.ArgumentParser(description="NeuroLedger round runner")
    parser.add_argument("--hospitals", required=True, help="comma-separated hospital names")
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--contract", default=os.environ.get("CONTRACT_ADDRESS",
                        "0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD"))
    parser.add_argument("--no-chain", action="store_true", help="skip on-chain submission (dry run)")
    parser.add_argument("--no-tee", action="store_true", help="skip TeeML attestation (dry run)")
    parser.add_argument("--wallets", default="", help="comma-separated wallet addresses (one per hospital, for MetaMask signing)")
    args = parser.parse_args()

    hospital_names = [h.strip() for h in args.hospitals.split(",")]
    assert len(hospital_names) >= 2, "Need at least 2 hospitals"

    print(f"\n{'='*60}")
    print(f"  NeuroLedger Round {args.round} — {len(hospital_names)} hospitals")
    print(f"  Contract: {args.contract}")
    print(f"{'='*60}")

    # Load agent keys — look up via hospital_map.json wallet_env field first, else AGENT_A/B/C...
    agents = []
    explicit_wallets = [w.strip() for w in args.wallets.split(",") if w.strip()]
    for i, name in enumerate(hospital_names):
        # Case-insensitive hospital_map lookup
        hcfg = _HOSPITAL_MAP.get(name) or _HOSPITAL_MAP.get(name.lower()) or {}
        wallet_env = hcfg.get("wallet_env", f"AGENT_{chr(65+i)}_KEY")
        key = os.environ.get(wallet_env) or os.environ.get(f"AGENT_{chr(65+i)}_KEY")
        explicit_wallet = explicit_wallets[i] if i < len(explicit_wallets) else None
        # MetaMask signing: hospital has no .env key but frontend provided a wallet address
        use_metamask = (not key) and bool(explicit_wallet) and (not args.no_chain)
        if not key and not explicit_wallet and not args.no_chain:
            print(f"[!] {name}: no key in .env and no wallet provided — on-chain submission skipped for this hospital.")
        agents.append({"name": name, "key": key, "wallet": explicit_wallet, "metamask": use_metamask})

    # Optional: connect to chain
    w3 = None
    contract_obj = None
    accounts = []
    if not args.no_chain:
        try:
            from web3 import Web3
            from eth_account import Account

            w3 = Web3(Web3.HTTPProvider(RPC_URL))
            assert w3.is_connected(), "RPC not reachable"
            print(f"\n[chain] connected to {RPC_URL}")

            # Load contract ABI from deployment.json
            abi_path = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts", "contracts", "NeuroLedger.sol", "NeuroLedger.json")
            with open(abi_path) as f:
                abi = json.load(f)["abi"]
            contract_obj = w3.eth.contract(address=Web3.to_checksum_address(args.contract), abi=abi)

            for ag in agents:
                if ag["key"]:
                    accounts.append(Account.from_key(ag["key"]))
                else:
                    accounts.append(None)

            # ── Phase 0: Register agents + start round ──────────
            print(f"\n{'─'*40}")
            print(f"  PHASE 0: Agent Registration + Round Start")
            print(f"{'─'*40}")
            for i, (ag, acc) in enumerate(zip(agents, accounts)):
                if acc:
                    try:
                        ensure_agent_registered(w3, contract_obj, acc, ag["name"], CHAIN_ID)
                    except Exception as e:
                        print(f"  ⚠️  Registration check failed for {ag['name']}: {e}")

            # Start the round (deployer = accounts[0]) — abort hard on failure
            if accounts and accounts[0]:
                try:
                    on_chain_round = start_round_onchain(w3, contract_obj, accounts[0], CHAIN_ID)
                    if on_chain_round != args.round:
                        print(f"  ⚠️  On-chain round is #{on_chain_round}, but --round={args.round}")
                        print(f"     Using on-chain round ID #{on_chain_round} for submissions.")
                        args.round = on_chain_round
                except Exception as start_err:
                    print(json.dumps({"event": "error", "phase": "start_round", "message": str(start_err)}), flush=True)
                    sys.exit(1)

        except SystemExit:
            raise
        except Exception as e:
            print(f"[chain] connection failed: {e}. Running in dry-run mode.")
            args.no_chain = True

    # ── Phase 1: Local training + DP + Upload ────────────────────
    print(f"\n{'─'*40}")
    print(f"  PHASE 1: Local Training + DP Noise + Upload")
    print(f"{'─'*40}")
    print(json.dumps({"event": "phase", "name": "TRAINING"}), flush=True)

    dp = DPMechanism(epsilon=1.0, delta=1e-5, clip_norm=1.0)
    submissions = []

    for i, ag in enumerate(agents):
        # Wallet address: env-derived account > explicit --wallets arg > zero address
        if accounts and accounts[i]:
            wallet_addr = accounts[i].address
        elif ag.get("wallet"):
            wallet_addr = ag["wallet"]
        else:
            wallet_addr = None

        native_dim = None
        uploaded_wallet = None

        # 1) Try uploaded dataset (hospital uploaded CSV via Node Network panel)
        check_wallets = [wallet_addr, ag.get("wallet")] if wallet_addr != ag.get("wallet") else [wallet_addr]
        for w_addr in check_wallets:
            if w_addr and native_dim is None:
                try:
                    X_full, y_full, data_info = load_uploaded_dataset(w_addr)
                    n_val = max(1, len(X_full) // 5)
                    X_val, y_val = X_full[-n_val:], y_full[-n_val:]
                    X_train, y_train = X_full[:-n_val], y_full[:-n_val]
                    native_dim = X_train.shape[1]
                    uploaded_wallet = w_addr
                    print(f"\n[{ag['name']}] using UPLOADED dataset: {data_info['file_name']}")
                    print(f"  {data_info['n_samples']} samples · {native_dim} features · label: {data_info['label_column']}")
                except FileNotFoundError:
                    pass

        # 2) Fall through to UCI / hospital_map (case-insensitive)
        if native_dim is None:
            hcfg_key = ag["name"] if _HOSPITAL_MAP.get(ag["name"]) else ag["name"].lower()
            hcfg = _HOSPITAL_MAP.get(hcfg_key)
            if hcfg:
                try:
                    print(f"\n[{ag['name']}] loading {hcfg['dataset_id']}...")
                    X_train, y_train, X_val, y_val = load_hospital(hcfg_key)
                    native_dim = hcfg["native_dim"]
                except FileNotFoundError as _ds_err:
                    print(f"\n[{ag['name']}] ⚠️ dataset file missing ({_ds_err}) — using sklearn breast_cancer fallback")
            if native_dim is None:
                # 3) Universal fallback: sklearn breast_cancer
                print(f"\n[{ag['name']}] ⚠️ not in hospital_map or dataset missing — using sklearn breast_cancer fallback")
                from sklearn.datasets import load_breast_cancer as _lbc
                from sklearn.preprocessing import StandardScaler as _SS
                _bc = _lbc()
                X_all = _SS().fit_transform(_bc.data.astype(float))
                y_all = _bc.target.astype(float)
                n_val = max(1, len(X_all) // 5)
                X_train, y_train = X_all[:-n_val], y_all[:-n_val]
                X_val, y_val = X_all[-n_val:], y_all[-n_val:]
                native_dim = 30

        model = FederatedLogisticRegression(ag["name"], native_dim)

        print(f"[{ag['name']}] training {args.epochs} epochs on {len(X_train)} samples...")
        try:
            result = model.train_local(X_train, y_train, epochs=args.epochs)
        finally:
            if uploaded_wallet:
                delete_uploaded_dataset(uploaded_wallet)
                uploaded_wallet = None

        # Apply Rényi DP noise
        noised_dw, sigma, orig_norm = dp.clip_and_noise(result["delta_w"], len(X_train))
        print(f"[{ag['name']}] DP: ε={dp.epsilon}, δ={dp.delta}, σ={sigma:.4f}, orig_norm={orig_norm:.4f}")

        update_hash = hash_gradient(noised_dw, result["delta_b"])
        nonce = os.urandom(32)
        account_addr = wallet_addr or "0x0000000000000000000000000000000000000000"
        dp_proof_hash = dp.dp_proof_hash(account_addr, args.round, sigma, nonce)
        print(json.dumps({"event": "hospital_trained", "hospital": ag["name"], "hash": update_hash[:18]}), flush=True)

        print(json.dumps({"event": "phase", "name": "UPLOADING"}), flush=True)
        _upload_key = accounts[i].key.hex() if (accounts and accounts[i]) else None
        cid, content_hash, stats = upload_gradient(
            noised_dw, result["delta_b"], ag["name"], args.round,
            dp_metadata={
                "epsilon": dp.epsilon, "delta": dp.delta, "sigma": sigma,
                "clip_norm": dp.clip_norm, "original_norm": orig_norm,
            },
            private_key=_upload_key,
        )
        print(f"  ✅ update_hash: {update_hash[:18]}...")
        print(f"  ✅ CID: {cid[:24]}...")
        print(f"  ✅ L2={stats['l2_norm']:.4f} mean={stats['mean']:.4f} std={stats['std']:.4f}")
        print(json.dumps({"event": "uploaded", "hospital": ag["name"], "cid": cid[:20]}), flush=True)

        # Submit gradient on-chain — Python signing (has .env key)
        if not args.no_chain and contract_obj and accounts and accounts[i]:
            print(json.dumps({"event": "phase", "name": "SUBMITTING"}), flush=True)
            print(f"  → Submitting to 0G Galileo...")
            receipt = submit_gradient_onchain(w3, contract_obj, accounts[i], args.round, cid, update_hash, dp_proof_hash)
            tx_hex = receipt['transactionHash'].hex()
            print(f"  ✅ On-chain TX: 0x{tx_hex}")
            print(json.dumps({"event": "gradient_submitted", "hospital": ag["name"], "txHash": f"0x{tx_hex}"}), flush=True)

        # Submit gradient on-chain — MetaMask signing (no .env key, wallet from frontend)
        elif not args.no_chain and contract_obj and ag.get("metamask") and ag.get("wallet"):
            try:
                from web3 import Web3 as _W3
                mm_addr = _W3.to_checksum_address(ag["wallet"])
                uh_bytes = bytes.fromhex(update_hash[2:]) if update_hash.startswith("0x") else bytes.fromhex(update_hash)
                dp_bytes = bytes.fromhex(dp_proof_hash[2:]) if dp_proof_hash.startswith("0x") else bytes.fromhex(dp_proof_hash)
                tx_build = contract_obj.functions.submitGradient(
                    args.round, cid, uh_bytes, dp_bytes
                ).build_transaction({
                    "from": mm_addr,
                    "gas": 400_000,
                    "gasPrice": w3.eth.gas_price,
                    "nonce": w3.eth.get_transaction_count(mm_addr),
                    "chainId": CHAIN_ID,
                })
                sign_payload = {
                    "event": "sign_request",
                    "hospital": ag["name"],
                    "wallet": ag["wallet"],
                    "tx": {
                        "to": tx_build["to"],
                        "from": tx_build["from"],
                        "data": tx_build["data"],
                        "gas": hex(tx_build["gas"]),
                        "gasPrice": hex(int(tx_build["gasPrice"])),
                        "nonce": hex(tx_build["nonce"]),
                        "chainId": hex(CHAIN_ID),
                        "value": "0x0",
                    }
                }
                print(json.dumps(sign_payload), flush=True)
                # Poll for /tmp/neuroledger_resume_ROUND_HOSPITAL.txt (written by /api/run-round/resume)
                resume_file = f"/tmp/neuroledger_resume_{args.round}_{ag['name']}.txt"
                tx_hash_mm = None
                for _ in range(60):  # 120s timeout
                    if os.path.exists(resume_file):
                        with open(resume_file) as _f:
                            tx_hash_mm = _f.read().strip()
                        try: os.remove(resume_file)
                        except: pass
                        break
                    _time.sleep(2)
                if tx_hash_mm:
                    print(f"  ✅ MetaMask TX: {tx_hash_mm}")
                    print(json.dumps({"event": "gradient_submitted", "hospital": ag["name"], "txHash": tx_hash_mm}), flush=True)
                else:
                    print(f"  ⚠️  MetaMask signing timed out for {ag['name']} (120s)")
            except Exception as e_mm:
                print(f"  ❌ MetaMask TX build failed for {ag['name']}: {e_mm}")

        submissions.append({
            "agent": ag,
            "delta_w": noised_dw,
            "delta_b": result["delta_b"],
            "update_hash": update_hash,
            "cid": cid,
            "dp_proof_hash": dp_proof_hash,
            "stats": stats,
            "accuracy": float(model.accuracy(X_val, y_val)),
        })

    # Write CID → hospital mapping so verify_aggregation.py can resolve 0x- Merkle roots
    _cids_dir = os.path.join("0g_storage_e2e", "gradients", f"round_{args.round:03d}")
    os.makedirs(_cids_dir, exist_ok=True)
    with open(os.path.join(_cids_dir, ".cids.json"), "w") as _cf:
        json.dump({s["agent"]["name"]: s["cid"] for s in submissions}, _cf)

    # ── Phase 2: Aggregation ─────────────────────────────────────
    print(f"\n{'─'*40}")
    print(f"  PHASE 2: Multi-Krum + Trimmed Mean Aggregation")
    print(f"{'─'*40}")

    agg = aggregate(
        update_hashes=[s["update_hash"] for s in submissions],
        delta_ws=[s["delta_w"] for s in submissions],
        delta_bs=[s["delta_b"] for s in submissions],
    )
    print(f"  aggregation_hash: {agg['aggregation_hash'][:18]}...")
    print(f"  selected indices: {agg['selected_indices']}")
    print(f"  krum scores:      {[round(s, 4) for s in agg['krum_scores']]}")

    # Build global model hash + upload to 0G Storage
    global_model_hash = hash_model(agg["new_delta_w"], agg["new_delta_b"])
    print(f"  global_model_hash: {global_model_hash[:18]}...")
    owner_key = next((acc.key.hex() for acc in accounts if acc), None)
    global_model_payload = json.dumps({
        "schema": "neuroledger.global_model.v1",
        "round_id": args.round,
        "delta_w": [float(x) for x in agg["new_delta_w"]],
        "delta_b": float(agg["new_delta_b"]),
        "aggregation_hash": agg["aggregation_hash"],
    }, sort_keys=True).encode()
    global_model_cid = upload_bytes(global_model_payload, f"global_model_r{args.round}.json", owner_key) if owner_key else "0g-" + hashlib.sha256(global_model_payload).hexdigest()
    print(f"  global_model_cid:  {global_model_cid[:24]}...")

    # ── Phase 3: TEE Attestation ─────────────────────────────────
    print(f"\n{'─'*40}")
    print(f"  PHASE 3: TeeML Attestation")
    print(f"{'─'*40}")

    import time as _ttime

    def _upload_stub(reason: str, extra: dict = {}) -> tuple:
        """Build a tee_proof stub JSON and upload it. Returns (cid, proof_hash)."""
        stub = {
            "schema": "neuroledger.tee_proof.v1",
            "tee_attested": False,
            "round_id": args.round,
            "reason": reason,
            "aggregation_hash": agg["aggregation_hash"],
            "timestamp": int(_ttime.time()),
            **extra,
        }
        stub_bytes = json.dumps(stub, sort_keys=True, separators=(',', ':')).encode()
        ph = "0x" + hashlib.sha256(stub_bytes).hexdigest()
        cid = upload_bytes(stub_bytes, f"tee_proof_r{args.round}.json", owner_key) if owner_key else "0g-" + hashlib.sha256(stub_bytes).hexdigest()
        return cid, ph

    tee_attested = False
    proof_hash = None
    tee_proof_cid = None
    model_version_id = None

    if args.no_tee:
        print(f"[TEE] skipped — --no-tee flag set")
        tee_proof_cid, proof_hash = _upload_stub("no_tee_flag")
        model_version_id = f"round_{args.round}_v{proof_hash[2:10]}"
        print(f"[TEE] stub uploaded — CID={tee_proof_cid[:24]}...")
    else:
        verifier = TEEAggregationVerifier()
        tee_ready, tee_msg = verifier.verify_ready()

        if tee_ready:
            print(f"[TEE] {tee_msg}")
            try:
                tee_result = verifier.attest(agg["trace"], args.round)
                proof_hash = tee_result["proof_hash"]
                model_version_id = tee_result["model_version_id"]
                tee_attested = True

                tee_proof_bytes = json.dumps(tee_result["tee_proof_json"]).encode()
                tee_proof_cid = upload_bytes(
                    tee_proof_bytes,
                    f"tee_proof_r{args.round}.json",
                    owner_key,
                ) if owner_key else "0g-" + hashlib.sha256(tee_proof_bytes).hexdigest()
                hw = tee_result.get("hardware_verified", False)
                inf = tee_result.get("inference_valid", False)
                inf_err = tee_result.get("inference_error")
                print(
                    f"[TEE] ✅ hardware_verified={hw}  inference_valid={inf}"
                    f"  provider={tee_result.get('provider_address', 'unknown')}"
                    f"  proof={proof_hash[:18]}..."
                    f"  CID={tee_proof_cid[:24]}..."
                )
                if inf_err:
                    print(f"[TEE]    inference note: {inf_err}")
            except Exception as tee_err:
                print(f"[TEE] ❌ attestation FAILED: {tee_err}", flush=True)
                tee_proof_cid, proof_hash = _upload_stub("tee_error", {"error": str(tee_err)[:200]})
                model_version_id = f"round_{args.round}_v{proof_hash[2:10]}"
                print(f"[TEE]    stub uploaded — CID={tee_proof_cid[:24]}...", flush=True)
        else:
            print(f"[TEE] ⚠️  prerequisites not met: {tee_msg}", flush=True)
            tee_proof_cid, proof_hash = _upload_stub("tee_prereq_failed", {"detail": tee_msg})
            model_version_id = f"round_{args.round}_v{proof_hash[2:10]}"
            print(f"[TEE]    stub uploaded — CID={tee_proof_cid[:24]}...", flush=True)

    print(f"[TEE] tee_attested={tee_attested}  proof_hash={proof_hash[:18]}...")

    # ── Phase 4: Publish Aggregation On-Chain ────────────────────
    print(f"\n{'─'*40}")
    print(f"  PHASE 4: On-Chain Publication")
    print(f"{'─'*40}")
    print(json.dumps({"event": "phase", "name": "TEE_AGGR"}), flush=True)

    if not args.no_chain and contract_obj and accounts and accounts[0]:
        try:
            receipt = publish_aggregation_onchain(
                w3, contract_obj, accounts[0], args.round,
                global_model_cid, agg["aggregation_hash"],
                proof_hash, global_model_hash,
                tee_proof_cid, dp.epsilon, model_version_id,
            )
            agg_tx = receipt['transactionHash'].hex()
            print(f"  ✅ AggregationComplete TX: 0x{agg_tx}")
            print(json.dumps({"event": "complete", "roundId": args.round, "aggHash": agg["aggregation_hash"], "txHash": f"0x{agg_tx}"}), flush=True)
        except Exception as e:
            print(f"  ❌ publishAggregation failed: {e}")
    else:
        print(f"  [skipped — dry run mode]")
        print(json.dumps({"event": "complete", "roundId": args.round, "aggHash": agg["aggregation_hash"], "txHash": ""}), flush=True)

    # ── Summary ──────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Round {args.round} Summary")
    print(f"{'='*60}")
    print(f"  Aggregation hash:  {agg['aggregation_hash']}")
    print(f"  TEE proof hash:    {proof_hash}")
    print(f"  Model version:     {model_version_id}")
    print(f"  Global model CID:  {global_model_cid}")
    print(f"\n  Gradient CIDs (for reproducibility verification):")
    for s in submissions:
        print(f"    {s['agent']['name']}: {s['cid']}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
