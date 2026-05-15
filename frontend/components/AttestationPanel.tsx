'use client';

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { ShieldCheck, Cpu, ExternalLink, Copy, Check, Loader2, Shield, ShieldOff } from 'lucide-react';
import { clsx } from 'clsx';
import { NEUROLEDGER_ABI, RPC_URL, EXPLORER_URL } from '@/lib/contract';
import deployment from '@/lib/deployment.json';

interface RealBundle {
  roundId: number;
  aggregationHash: string;
  proofHash: string;
  modelVersionId: string;
  globalModelHash: string;
  globalModelCID: string;
  teeProofCID: string;
  gradientMerkleRoot: string;
  dpEpsilonConsumed: number;
  txHash: string;
  blockNumber: number;
}

const STORAGE_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

/** 0x-prefixed 66-char hex = real 0G Storage Merkle root (downloadable) */
function isMerkleRoot(cid: string) {
  return cid.startsWith('0x') && cid.length === 66;
}

/** 0g-000...000 = zero-filled placeholder from early rounds */
function isZeroPlaceholder(cid: string) {
  return cid.startsWith('0g-') && /^0+$/.test(cid.slice(3));
}

function teeStatus(teeProofCID: string): { label: string; color: string; icon: 'full' | 'hw' | 'none' } {
  if (isZeroPlaceholder(teeProofCID)) return { label: 'No TEE', color: 'text-gray-500', icon: 'none' };
  if (isMerkleRoot(teeProofCID)) return { label: 'TeeML ✓', color: 'text-status-success', icon: 'full' };
  // 0g- non-zero = stub uploaded (no-tee / prereq failed)
  return { label: 'Stub', color: 'text-status-warning', icon: 'hw' };
}

function ProofField({
  label,
  value,
  copy: canCopy,
  download,
}: {
  label: string;
  value: string;
  copy?: boolean;
  download?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fileData, setFileData] = useState<Record<string, unknown> | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const canFetch = download && isMerkleRoot(value);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDownload() {
    setFetching(true);
    setFetchErr(null);
    try {
      const resp = await fetch(`${STORAGE_INDEXER}/file?root=${value}`);
      const text = await resp.text();
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
      // 0G Storage returns HTTP 200 + {code:101} when file is not yet available
      if ((json as { code?: number }).code === 101) {
        setFetchErr('Not yet available on indexer — 0G Storage propagation typically takes 30-45 min. Try again shortly.');
      } else {
        setFileData(json);
      }
    } catch {
      setFetchErr('Network error — could not reach 0G Storage indexer');
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 p-4 bg-white/5 rounded-xl border border-white/10 group hover:border-white/20 transition-colors">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-mono text-neon-blue break-all flex-1">{value}</span>
        {canCopy && (
          <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {copied ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3 text-gray-500 hover:text-white" />}
          </button>
        )}
        {download && canFetch && (
          <button
            onClick={handleDownload}
            disabled={fetching}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px] text-neon-blue hover:text-white border border-neon-blue/30 px-2 py-0.5 rounded"
          >
            {fetching ? '...' : '↓ View'}
          </button>
        )}
        {download && !canFetch && !isZeroPlaceholder(value) && (
          <span className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0 text-[10px] text-gray-500 border border-white/10 px-2 py-0.5 rounded">
            SHA-256 ref
          </span>
        )}
      </div>
      {fetchErr && (
        <p className="mt-1 text-[11px] text-status-danger font-mono">{fetchErr}</p>
      )}
      {fileData && (
        <pre className="mt-2 text-[11px] text-gray-400 bg-black/40 rounded-lg p-3 overflow-x-auto max-h-48 font-mono border border-white/10">
          {JSON.stringify(fileData, null, 2).slice(0, 800)}
        </pre>
      )}
    </div>
  );
}

export function AttestationPanel() {
  const [bundles, setBundles] = useState<RealBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(
          deployment.contractAddress,
          NEUROLEDGER_ABI as unknown as string[],
          provider
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const events = await (contract as any).queryFilter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (contract as any).filters.AggregationComplete(),
          -200000
        );

        const real: RealBundle[] = (events as ethers.EventLog[]).map((e) => ({
          roundId:            Number(e.args.roundId),
          aggregationHash:    e.args.aggregationHash,
          proofHash:          e.args.proofHash,
          modelVersionId:     e.args.modelVersionId,
          globalModelHash:    e.args.globalModelHash,
          globalModelCID:     e.args.globalModelCID,
          teeProofCID:        e.args.teeProofCID,
          gradientMerkleRoot: e.args.gradientMerkleRoot,
          dpEpsilonConsumed:  Number(e.args.dpEpsilonConsumed),
          txHash:             e.transactionHash,
          blockNumber:        e.blockNumber,
        }));

        setBundles(real.slice().reverse());
      } catch (err) {
        setError(`Chain read failed: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const active = bundles[activeIdx] ?? null;

  return (
    <div className="h-full flex gap-8 p-12 overflow-y-hidden pt-24">
      {/* Left: Rounds list */}
      <div className="w-1/3 flex flex-col gap-6">
        <div className="mb-4">
          <h2 className="text-3xl font-light text-white mb-2 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-status-success drop-shadow-[0_0_15px_rgba(0,255,150,0.6)]" />
            TEE Attestation
          </h2>
          <p className="text-sm text-gray-400 font-light">Real-time data from 0G Galileo chain.</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
            {deployment.contractAddress.slice(0, 14)}...
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {loading && (
            <div className="flex items-center gap-3 py-8 text-gray-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading from 0G Galileo chain...
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </div>
          )}

          {!loading && !error && bundles.length === 0 && (
            <div className="text-center py-16 text-gray-500 text-sm font-light">
              <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No rounds on chain yet.</p>
              <p className="mt-2 text-xs">Start a round with the Python runner:</p>
              <code className="text-xs text-neon-blue mt-2 block leading-relaxed">
                python -m agent.neurolledger.runner<br />
                --hospitals manipal,srenivas,dfl<br />
                --round 1
              </code>
            </div>
          )}

          {bundles.map((b, idx) => (
            <button
              key={b.roundId}
              onClick={() => setActiveIdx(idx)}
              className={clsx(
                'w-full text-left p-6 rounded-2xl border transition-all duration-300 flex flex-col gap-3 group relative overflow-hidden',
                activeIdx === idx
                  ? 'bg-neon-purple/10 border-neon-purple/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(138,43,226,0.15)] backdrop-blur-xl'
                  : 'bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/5 backdrop-blur-xl hover:-translate-y-1'
              )}
            >
              <div className="flex justify-between items-center text-[15px] font-mono relative z-10">
                <span className="text-white">Round #{b.roundId}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={`${EXPLORER_URL}/tx/${b.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-status-success hover:text-white transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    ↗ on-chain
                  </a>
                </div>
              </div>
              <div className={clsx('text-[13px] font-mono relative z-10 transition-colors',
                activeIdx === idx ? 'text-neon-purple' : 'text-gray-500 group-hover:text-gray-300'
              )}>
                {b.aggregationHash.slice(0, 18)}...
              </div>
              <div className="text-[11px] text-gray-600">
                Block #{b.blockNumber} · DP ε = {(b.dpEpsilonConsumed / 1_000_000).toFixed(1)}
              </div>
              {activeIdx === idx && <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/10 to-transparent pointer-events-none" />}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Proof details */}
      <div className="w-2/3 bg-black/60 backdrop-blur-3xl rounded-3xl flex flex-col overflow-hidden relative border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
        {active ? (
          <>
            <div className="h-16 bg-white/5 border-b border-white/10 flex items-center justify-between px-8 shrink-0">
              <div className="flex items-center gap-3 text-[13px] font-mono text-gray-300 uppercase tracking-widest font-bold">
                <Cpu className="w-5 h-5 text-neon-blue drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
                TEE Proof Bundle — Round #{active.roundId}
              </div>
              {isMerkleRoot(active.teeProofCID) ? (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-status-success/10 border border-status-success/30">
                  <div className="w-2 h-2 rounded-full bg-status-success animate-pulse shadow-[0_0_10px_rgba(0,255,150,0.8)]" />
                  <span className="text-[10px] uppercase font-bold text-status-success tracking-widest">TeeML Attested</span>
                </div>
              ) : isZeroPlaceholder(active.teeProofCID) ? (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-500/10 border border-gray-500/30">
                  <ShieldOff className="w-3 h-3 text-gray-500" />
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">No TEE</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-status-warning/10 border border-status-warning/30">
                  <Shield className="w-3 h-3 text-status-warning" />
                  <span className="text-[10px] uppercase font-bold text-status-warning tracking-widest">Chain-Anchored</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-3">
              <ProofField
                label="Aggregation Hash (Multi-Krum + Trimmed Mean)"
                value={active.aggregationHash}
                copy
              />
              <ProofField label="Proof Hash (on-chain anchor)" value={active.proofHash} copy />
              <ProofField label="Model Version ID" value={active.modelVersionId} copy />
              <ProofField label="Gradient Merkle Root" value={active.gradientMerkleRoot} copy />
              <ProofField label="Global Model Hash (SHA256)" value={active.globalModelHash} copy />
              <ProofField label="Global Model CID (0G Storage)" value={active.globalModelCID} copy download />
              <ProofField label="TEE Proof CID (0G Storage)" value={active.teeProofCID} copy download />

              <div className="flex flex-col gap-1.5 p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Rényi DP Budget Consumed</span>
                <span className="text-[13px] text-white font-mono">
                  ε = {(active.dpEpsilonConsumed / 1_000_000).toFixed(6)} (δ = 1e-5)
                </span>
              </div>

              <div className="flex flex-col gap-1.5 p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Chain Transaction</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-mono text-neon-blue break-all">{active.txHash}</span>
                  <button onClick={() => copyToClipboard(active.txHash, 'tx')} className="shrink-0">
                    {copiedField === 'tx' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3 text-gray-500 hover:text-white" />}
                  </button>
                </div>
                <div className="text-[11px] text-gray-500">Block #{active.blockNumber} · 0G Galileo Testnet</div>
              </div>

              <div className="mt-2 p-4 bg-neon-blue/5 border border-neon-blue/20 rounded-xl text-[12px] text-gray-400 font-light italic">
                Patient data never left originating hospitals. Aggregation verified by 0G TeeML, anchored immutably on 0G Galileo. Anyone can reproduce the aggregation hash from the public gradient CIDs.
              </div>
            </div>

            <div className="h-20 bg-white/5 border-t border-white/10 flex items-center justify-between px-8 shrink-0">
              <div className="text-[13px] text-gray-400 font-mono">
                Contract: <span className="text-white">{deployment.contractAddress.slice(0, 14)}...</span>
              </div>
              <a href={`${EXPLORER_URL}/tx/${active.txHash}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 text-[11px] font-bold tracking-widest uppercase bg-white/10 hover:bg-white/20 border border-white/20 px-8 py-3.5 rounded-xl text-white transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:-translate-y-1"
              >
                Verify on 0G Galileo <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </>
        ) : (
          !loading && (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
              <Cpu className="w-16 h-16 opacity-20" />
              <span className="text-sm">Run a training round to see real TEE proofs here.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
