"""
Reproducibility verifier — check.md Phase 8d.

Usage:
  python scripts/verify_aggregation.py --cids CID1,CID2,CID3 --expected 0x...

Downloads gradient JSON files from 0G Storage by CID, runs Multi-Krum + Trimmed Mean,
and compares the reproduced aggregation hash against the on-chain AggregationComplete event.

Anyone with the CIDs can run this to independently verify the aggregation.
"""
import argparse
import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent.neurolledger.storage import download_gradient, verify_cid
from agent.neurolledger.aggregator import aggregate
from agent.neurolledger.hashing import hash_gradient


def main():
    parser = argparse.ArgumentParser(description="Reproduce and verify aggregation hash")
    parser.add_argument("--cids", required=True, help="comma-separated gradient CIDs")
    parser.add_argument("--expected", help="expected aggregation hash from on-chain event (optional)")
    args = parser.parse_args()

    cids = [c.strip() for c in args.cids.split(",")]
    print(f"\nVerifying aggregation over {len(cids)} gradients...")

    gradients = []
    for cid in cids:
        print(f"  Downloading {cid[:24]}...")
        g = download_gradient(cid)
        print(f"    hospital: {g['hospital_name']}  round: {g['round_id']}")
        print(f"    L2 norm: {g['stats']['l2_norm']:.4f}  dp.epsilon: {g['dp']['epsilon']}")
        assert verify_cid(cid, g), f"CID mismatch for {cid}!"
        print(f"    ✅ CID verified")
        gradients.append(g)

    delta_ws = [np.array(g["delta_w"], dtype=np.float32) for g in gradients]
    delta_bs = [g["delta_b"] for g in gradients]
    update_hashes = [hash_gradient(dw, db) for dw, db in zip(delta_ws, delta_bs)]

    result = aggregate(update_hashes, delta_ws, delta_bs)

    print(f"\nReproduced aggregation hash:")
    print(f"  {result['aggregation_hash']}")

    if args.expected:
        match = result["aggregation_hash"].lower() == args.expected.lower()
        print(f"\nExpected (on-chain):")
        print(f"  {args.expected}")
        print(f"\nResult: {'✅ MATCH — aggregation is reproducible!' if match else '❌ MISMATCH'}")
        sys.exit(0 if match else 1)
    else:
        print(f"\nRun with --expected <on-chain-hash> to verify against chain.")


if __name__ == "__main__":
    main()
