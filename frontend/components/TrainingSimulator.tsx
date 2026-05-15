'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCw, Terminal, AlertTriangle, Check, X, RefreshCw, Cpu, ChevronRight, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { ethers } from 'ethers';
import { NEUROLEDGER_ABI, RPC_URL, EXPLORER_URL } from '@/lib/contract';
import deployment from '@/lib/deployment.json';
import { HospitalSelector, HospitalOption, STATIC_HOSPITALS } from './HospitalSelector';

// ─── Types ───────────────────────────────────────────────────────────────────

type Decision = 'ACCEPT' | 'RETRAIN' | 'REJECT';

type RoundPhase = 'IDLE' | 'TRAINING' | 'ENCRYPTING' | 'UPLOADING' | 'TEE_AGGREGATING' | 'PROVING' | 'EVALUATING' | 'DECIDING' | 'COMPLETE';

const PHASE_LABELS: Record<RoundPhase, string> = {
  IDLE: 'Idle', TRAINING: 'Local SGD Training', ENCRYPTING: 'Rényi DP Noise Injection',
  UPLOADING: 'Uploading to 0G Storage', TEE_AGGREGATING: 'Multi-Krum + Aggregation',
  PROVING: 'Generating Proof Bundle', EVALUATING: 'Evaluating Global Model',
  DECIDING: 'Agent Decision Phase', COMPLETE: 'Round Complete',
};

const PHASE_ORDER: RoundPhase[] = ['TRAINING', 'ENCRYPTING', 'UPLOADING', 'TEE_AGGREGATING', 'PROVING', 'EVALUATING', 'DECIDING', 'COMPLETE'];

// Map runner event phase names → PHASE_ORDER index
const RUNNER_PHASE_MAP: Record<string, number> = {
  TRAINING: 0, UPLOADING: 2, SUBMITTING: 3, TEE_AGGR: 3,
};

// Known UCI hospitals (for hasData determination)
const UCI_HOSPITALS = new Set(['manipal', 'srenivas', 'dfl', 'rusty', 'hospital5', 'medanta', 'Medanta']);

// ─── Chain data hooks ─────────────────────────────────────────────────────────

interface ChainDecision { agent: string; decision: Decision; globalAccBps: number; }

interface CompletedRound {
  roundId: number; globalModelCID: string; modelVersionId: string;
  dpEpsilon: number; blockNumber: number; txHash: string; decisions: ChainDecision[];
}

interface ChainRoundsState {
  completedRounds: CompletedRound[]; latestRound: CompletedRound | null;
  currentRound: number; loading: boolean;
}

function useChainRounds(): ChainRoundsState & { refresh: () => void } {
  const [state, setState] = useState<ChainRoundsState>({ completedRounds: [], latestRound: null, currentRound: 0, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(deployment.contractAddress, NEUROLEDGER_ABI, provider);

        const [aggLogs, decLogs, curRoundRaw] = await Promise.all([
          contract.queryFilter(contract.filters.AggregationComplete()),
          contract.queryFilter(contract.filters.AgentDecision()),
          contract.currentRound(),
        ]);

        const decisionsByRound = new Map<number, ChainDecision[]>();
        for (const log of decLogs) {
          const ev = log as ethers.EventLog;
          const roundId = Number(ev.args[0]);
          const agent = ev.args[1] as string;
          const decision = ev.args[2] as string;
          const globalAccBps = Number(ev.args[5]);
          if (!decisionsByRound.has(roundId)) decisionsByRound.set(roundId, []);
          decisionsByRound.get(roundId)!.push({
            agent: agent.slice(0, 6) + '...' + agent.slice(-4),
            decision: (['ACCEPT', 'RETRAIN', 'REJECT'].includes(decision) ? decision : 'ACCEPT') as Decision,
            globalAccBps,
          });
        }

        const completedRounds: CompletedRound[] = aggLogs.map(log => {
          const ev = log as ethers.EventLog;
          const roundId = Number(ev.args[0]);
          return {
            roundId,
            globalModelCID: ev.args[1] as string,
            modelVersionId: ev.args[5] as string,
            dpEpsilon: Number(ev.args[8]) / 1_000_000,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            decisions: decisionsByRound.get(roundId) || [],
          };
        }).sort((a, b) => a.roundId - b.roundId);

        if (!cancelled) {
          setState({
            completedRounds,
            latestRound: completedRounds.at(-1) ?? null,
            currentRound: Number(curRoundRaw),
            loading: false,
          });
        }
      } catch { if (!cancelled) setState(s => ({ ...s, loading: false })); }
    }
    load();
    return () => { cancelled = true; };
  }, [tick]);

  return { ...state, refresh: () => setTick(t => t + 1) };
}

function useRegisteredHospitals(): HospitalOption[] {
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(deployment.contractAddress, NEUROLEDGER_ABI, provider);

        const logs = await contract.queryFilter(contract.filters.AgentRegistered());
        const seen = new Set<string>();
        const options: HospitalOption[] = [];

        for (const log of logs) {
          const ev = log as ethers.EventLog;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const addr = (ev.args as any).agent as string;
          const hospitalName = (ev.args as any).hospitalName as string;
          if (!addr || !hospitalName || seen.has(addr.toLowerCase())) continue;
          seen.add(addr.toLowerCase());

          // Check if uploaded CSV exists
          let hasUploadedCSV = false;
          try {
            const res = await fetch(`/api/dataset/status?wallet=${addr}`);
            if (res.ok) {
              const data = await res.json();
              hasUploadedCSV = data.hasDataset === true;
            }
          } catch { /* ignore */ }

          const hasUCIData = UCI_HOSPITALS.has(hospitalName) || UCI_HOSPITALS.has(hospitalName.toLowerCase());

          options.push({
            name: hospitalName,
            address: addr,
            disease: getDisease(hospitalName),
            dataset: getDataset(hospitalName),
            samples: getSamples(hospitalName),
            hasData: hasUCIData || hasUploadedCSV,
            hasUploadedCSV,
          });
        }

        if (!cancelled && options.length > 0) setHospitals(options);
      } catch { /* fallback to static */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return hospitals;
}

function getDisease(name: string): string {
  const map: Record<string, string> = {
    manipal: 'Cardiovascular Disease', srenivas: 'Type 2 Diabetes', dfl: 'Breast Cancer',
    rusty: 'Chronic Kidney Disease', medanta: 'Chronic Kidney Disease', Medanta: 'Chronic Kidney Disease',
    hospital5: 'Liver Disorders',
  };
  return map[name] || map[name.toLowerCase()] || 'General Medicine';
}
function getDataset(name: string): string {
  const map: Record<string, string> = {
    manipal: 'UCI Heart', srenivas: 'Pima', dfl: 'Wisconsin',
    rusty: 'UCI Kidney', medanta: 'UCI Kidney', Medanta: 'UCI Kidney', hospital5: 'UCI Liver',
  };
  return map[name] || map[name.toLowerCase()] || 'Uploaded CSV';
}
function getSamples(name: string): number {
  const map: Record<string, number> = {
    manipal: 297, srenivas: 768, dfl: 569, rusty: 400, medanta: 400, Medanta: 400, hospital5: 345,
  };
  return map[name] || map[name.toLowerCase()] || 0;
}

// ─── Decision Badge ───────────────────────────────────────────────────────────

function DecisionBadge({ decision, name, globalAccBps }: { decision: Decision; name: string; globalAccBps: number }) {
  const config = {
    ACCEPT: { bg: 'bg-status-success/15', border: 'border-status-success/40', text: 'text-status-success', icon: <Check className="w-4 h-4" />, shadow: 'shadow-[0_0_20px_rgba(0,255,102,0.3)]' },
    RETRAIN: { bg: 'bg-status-warning/15', border: 'border-status-warning/40', text: 'text-status-warning', icon: <RefreshCw className="w-4 h-4" />, shadow: 'shadow-[0_0_20px_rgba(255,184,0,0.3)]' },
    REJECT: { bg: 'bg-status-danger/15', border: 'border-status-danger/40', text: 'text-status-danger', icon: <X className="w-4 h-4" />, shadow: 'shadow-[0_0_20px_rgba(255,0,60,0.3)]' },
  }[decision];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.4 }}
      className={clsx('flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-md', config.bg, config.border, config.shadow)}>
      <span className={config.text}>{config.icon}</span>
      <div className="flex flex-col">
        <span className="text-white text-sm font-medium">{name}</span>
        <span className={clsx('text-xs font-mono font-bold', config.text)}>
          {decision} — {(globalAccBps / 100).toFixed(1)}% global acc
        </span>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ActivityLog { id: number; time: string; action: string; status: string; txHash?: string; }

export function TrainingSimulator() {
  const chain = useChainRounds();
  const registeredHospitals = useRegisteredHospitals();

  const [selectedHospitals, setSelectedHospitals] = useState<string[]>(['manipal', 'srenivas', 'dfl']);
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([
    { id: 1, time: new Date().toLocaleTimeString(), action: 'SYSTEM INIT', status: 'READY' },
  ]);
  const [realRoundLogs, setRealRoundLogs] = useState<string[]>([]);
  const [isRealRound, setIsRealRound] = useState(false);
  const [runPhase, setRunPhase] = useState<RoundPhase>('IDLE');
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const addLog = useCallback((action: string, status: string, txHash?: string) => {
    setLogs(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString(), action, status, txHash }, ...prev].slice(0, 40));
  }, []);

  const addRealLog = useCallback((line: string) => {
    setRealRoundLogs(prev => [...prev, line].slice(-100));
  }, []);

  // Handle sign_request event — MetaMask popup for hospitals without .env keys
  const handleSignRequest = useCallback(async (event: Record<string, unknown>) => {
    const hospital = event.hospital as string;
    const wallet = event.wallet as string;
    const tx = event.tx as Record<string, string>;
    const roundNum = chain.currentRound + 1;

    addRealLog(`> 🦊 MetaMask signature required for ${hospital} (${wallet.slice(0, 8)}...)`);
    addLog(`MetaMask: awaiting signature for ${hospital}`, 'PENDING');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('MetaMask not found');

      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          to: tx.to,
          from: wallet,
          data: tx.data,
          gas: tx.gas,
          gasPrice: tx.gasPrice,
          nonce: tx.nonce,
          value: '0x0',
          chainId: tx.chainId,
        }],
      }) as string;

      addRealLog(`> ✅ ${hospital} signed: ${txHash}`);
      addLog(`${hospital}: gradient submitted via MetaMask`, 'OK', txHash);

      // Write txHash to resume file via API so runner can continue
      await fetch('/api/run-round/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: roundNum, hospital, txHash }),
      });
    } catch (err) {
      addRealLog(`> ❌ MetaMask rejected for ${hospital}: ${String(err)}`);
      addLog(`${hospital}: MetaMask rejected`, 'REJECT');
    }
  }, [chain.currentRound, addLog, addRealLog]);

  const handleRealRound = async () => {
    if (isRealRound) return;
    setIsRealRound(true);
    setRunPhase('TRAINING');
    const roundNum = (chain.currentRound || 0) + 1;

    setRealRoundLogs([
      `> Initiating on-chain round #${roundNum}...`,
      `> Hospitals: ${selectedHospitals.join(', ')}`,
    ]);
    addLog(`ROUND #${roundNum} INITIATED`, 'PENDING');

    try {
      const res = await fetch('/api/run-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitals: selectedHospitals,
          wallets: selectedWallets.length > 0 ? selectedWallets : undefined,
          round: roundNum,
        }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();

      // Chain sign_request handlers so they don't block the stream reader
      let signChain = Promise.resolve();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });

        for (const line of text.split('\n')) {
          const trimmed = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
          if (!trimmed) continue;

          // Try to parse as a structured runner event
          let parsed: Record<string, unknown> | null = null;
          try { parsed = JSON.parse(trimmed); } catch { /* plain text */ }

          if (parsed && typeof parsed.event === 'string') {
            const ev = parsed.event as string;

            if (ev === 'phase' && typeof parsed.name === 'string') {
              const idx = RUNNER_PHASE_MAP[parsed.name as string];
              if (idx !== undefined) setRunPhase(PHASE_ORDER[idx]);

            } else if (ev === 'hospital_trained') {
              addRealLog(`> [${parsed.hospital}] trained — ${parsed.hash}...`);

            } else if (ev === 'uploaded') {
              addRealLog(`> [${parsed.hospital}] uploaded — CID: ${(parsed.cid as string)?.slice(0, 20)}...`);

            } else if (ev === 'gradient_submitted') {
              const txHash = parsed.txHash as string;
              addLog(`GradientSubmitted — ${parsed.hospital}`, 'OK', txHash);
              if (txHash) addRealLog(`> ✅ ${parsed.hospital} → ${txHash.slice(0, 18)}...`);

            } else if (ev === 'sign_request') {
              // Queue MetaMask signing so it doesn't block stream reader
              signChain = signChain.then(() => handleSignRequest(parsed as Record<string, unknown>));

            } else if (ev === 'complete') {
              setRunPhase('COMPLETE');
              addLog(`ROUND #${parsed.roundId} COMPLETE`, 'SUCCESS');
              addRealLog(`> ✅ AggregationComplete — round #${parsed.roundId}`);
              if (parsed.txHash) addRealLog(`> TX: ${parsed.txHash}`);
              setTimeout(() => chain.refresh(), 3000);

            } else if (ev === 'done') {
              const code = parsed.exitCode as number;
              if (code !== 0 && runPhase !== 'COMPLETE') {
                addLog(`ROUND #${roundNum} FAILED (exit ${code})`, 'REJECT');
                addRealLog(`> ❌ Runner exited with code ${code}`);
              }
            }
          } else {
            // Plain text — show in real-round log
            addRealLog(trimmed);
          }
        }
      }
    } catch (err) {
      addRealLog(`> ❌ Stream error: ${String(err)}`);
      addLog(`ROUND #${roundNum} ERROR`, 'REJECT');
    } finally {
      setIsRealRound(false);
    }
  };

  const displayRound = chain.currentRound > 0 ? chain.currentRound : isRealRound ? '...' : '—';
  const hasRounds = chain.completedRounds.length > 0;
  const hospitalsToShow = registeredHospitals.length > 0 ? registeredHospitals : STATIC_HOSPITALS;

  return (
    <div className="h-full flex flex-col p-8 gap-6 overflow-y-auto w-full pt-20">
      {/* Header */}
      <div className="flex justify-between items-start bg-black/40 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)] gap-8">
        <div className="flex-1">
          <h2 className="text-2xl text-white flex items-center gap-4 mb-4">
            Global Round{' '}
            <span className="text-neon-purple font-mono font-bold">
              {chain.loading ? <span className="text-gray-500 text-lg">loading...</span> : `#${displayRound}`}
            </span>
          </h2>
          <HospitalSelector
            hospitals={hospitalsToShow}
            onChange={setSelectedHospitals}
            onWalletsChange={setSelectedWallets}
          />
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <p className="text-sm text-gray-400 font-light text-right">
            {isRealRound
              ? PHASE_LABELS[runPhase]
              : hasRounds
                ? `${chain.completedRounds.length} round${chain.completedRounds.length !== 1 ? 's' : ''} on chain`
                : `${selectedHospitals.length} hospitals selected`}
          </p>
          <button
            onClick={handleRealRound}
            disabled={isRealRound}
            title="Run federated learning round on 0G Galileo"
            className="bg-neon-purple/10 border border-neon-purple/30 backdrop-blur-md text-neon-purple px-8 py-4 rounded-xl text-xs font-bold tracking-widest flex items-center gap-3 hover:bg-neon-purple/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(112,0,255,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isRealRound ? <RotateCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRealRound ? 'RUNNING...' : 'RUN ON CHAIN'}
          </button>
        </div>
      </div>

      {/* Real-round logs */}
      {realRoundLogs.length > 0 && (
        <div className="bg-black/60 backdrop-blur-2xl border border-neon-purple/30 rounded-3xl p-6 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_30px_rgba(112,0,255,0.1)]">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-neon-purple" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-neon-purple font-bold">On-Chain Runner Output</span>
          </div>
          <div className="font-mono text-[12px] leading-relaxed max-h-40 overflow-y-auto space-y-0.5">
            {realRoundLogs.map((line, i) => (
              <div key={i} className={clsx(
                line.includes('✅') || line.includes('SUCCESS') ? 'text-status-success' :
                line.includes('❌') || line.includes('Error') ? 'text-red-400' :
                line.includes('⚠️') ? 'text-amber-400' :
                line.includes('🦊') ? 'text-orange-400' :
                line.startsWith('>') ? 'text-neon-blue' :
                'text-gray-400'
              )}>{line}</div>
            ))}
            {isRealRound && <div className="text-neon-blue"><span className="w-1.5 h-4 bg-neon-blue animate-pulse inline-block" /></div>}
          </div>
        </div>
      )}

      {/* Phase Progress — driven by runner events, no timer */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">Round Phase Progress</h3>
        <div className="flex items-center gap-1">
          {PHASE_ORDER.map((p, i) => {
            const runIdx = runPhase === 'IDLE' ? -1 : PHASE_ORDER.indexOf(runPhase);
            const done = runPhase === 'COMPLETE' || (isRealRound && i < runIdx);
            const active = isRealRound && p === runPhase && runPhase !== 'COMPLETE' && runPhase !== 'IDLE';
            return (
              <div key={p} className="flex-1 flex flex-col items-center gap-2">
                <div className={clsx('h-2 w-full rounded-full transition-all duration-500',
                  done ? 'bg-status-success shadow-[0_0_10px_rgba(0,255,150,0.5)]' :
                  active ? 'bg-gradient-to-r from-neon-purple to-neon-blue animate-pulse shadow-[0_0_15px_rgba(0,240,255,0.5)]' :
                  'bg-white/10'
                )} />
                <span className={clsx('text-[9px] font-mono uppercase tracking-wider',
                  done ? 'text-status-success' : active ? 'text-neon-blue' : 'text-gray-600'
                )}>{p.replace('_', ' ').slice(0, 8)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decision Badges */}
      {hasRounds && chain.latestRound && chain.latestRound.decisions.length > 0 && (
        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Agent Decisions — Round #{chain.latestRound.roundId}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono">
              <ChevronRight className="w-3 h-3" /> live from 0G Galileo
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <AnimatePresence>
              {chain.latestRound.decisions.map((d, i) => (
                <DecisionBadge key={i} decision={d.decision} name={d.agent} globalAccBps={d.globalAccBps} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Activity Log + Completed Rounds */}
      <div className="flex gap-6 flex-1 min-h-[400px] mb-12">
        {/* Activity Log */}
        <div className="w-1/2 flex flex-col bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/5">
            <Terminal className="w-4 h-4 text-neon-blue" />
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-white">Activity Log</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-black/20">
            <table className="w-full text-left border-collapse">
              <tbody className="text-[13px] font-mono">
                <AnimatePresence>
                  {logs.map((log) => (
                    <motion.tr key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="border-b border-white/5 last:border-0 hover:bg-white/10 text-gray-300 align-top transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-gray-500 w-28">[{log.time}]</td>
                      <td className="py-3 px-4 text-gray-300">
                        {log.txHash ? (
                          <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="hover:text-neon-blue transition-colors flex items-center gap-1">
                            {log.action} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : log.action}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={clsx('px-2.5 py-1 rounded-sm text-[10px] font-bold tracking-wider',
                          log.status === 'OK' || log.status === 'SUCCESS' || log.status === 'ACCEPT' ? 'bg-status-success/10 text-status-success border border-status-success/30' :
                          log.status === 'RETRAIN' ? 'bg-status-warning/10 text-status-warning border border-status-warning/30' :
                          log.status === 'REJECT' ? 'bg-status-danger/10 text-status-danger border border-status-danger/30' :
                          'bg-white/5 text-gray-400 border border-white/10'
                        )}>{log.status}</span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Completed Rounds from AggregationComplete events */}
        <div className="w-1/2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 flex flex-col shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
          <div className="mb-6 flex justify-between items-start shrink-0">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Completed Rounds</h3>
              <div className="text-4xl font-mono text-white mt-3">
                {chain.loading
                  ? <span className="text-gray-500 text-2xl">loading...</span>
                  : hasRounds
                    ? chain.completedRounds.length
                    : <span className="text-gray-500 text-xl">—</span>
                }
              </div>
            </div>
            <div className="text-[11px] text-neon-blue font-mono border border-neon-blue/30 bg-neon-blue/10 px-3 py-1.5 rounded uppercase tracking-widest font-bold">
              0G GALILEO
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chain.loading && <div className="h-full flex items-center justify-center text-gray-500 text-sm font-mono">Reading chain...</div>}
            {!chain.loading && !hasRounds && (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle className="w-8 h-8 text-gray-600" />
                <p className="text-gray-500 text-sm font-mono">No rounds completed yet</p>
                <p className="text-gray-600 text-xs">Run a round on chain to populate this list</p>
              </div>
            )}
            {!chain.loading && hasRounds && (
              <div className="flex flex-col gap-3">
                {chain.completedRounds.map(r => (
                  <motion.div key={r.roundId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2 hover:border-neon-blue/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-mono font-bold text-sm">Round #{r.roundId}</span>
                      <a href={`${EXPLORER_URL}/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-mono text-neon-blue hover:text-white transition-colors">
                        Block #{r.blockNumber} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="text-[11px] font-mono text-gray-400 truncate">
                      {r.modelVersionId || r.globalModelCID.slice(0, 24) + '...'}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                      <span className="text-status-success font-bold">✓ AGGREGATED</span>
                      {r.dpEpsilon > 0 && <span>ε={r.dpEpsilon.toFixed(1)}</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
