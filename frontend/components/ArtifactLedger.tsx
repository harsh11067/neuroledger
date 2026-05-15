'use client';

import { useState, useMemo, useEffect } from 'react';
import { Database, FileJson, Layers, Link as LinkIcon, Download, CheckCircle, Filter, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { clsx } from 'clsx';
import { NEUROLEDGER_ABI, EXPLORER_URL, RPC_URL } from '@/lib/contract';
import deployment from '@/lib/deployment.json';

const EVENT_COLORS: Record<string, string> = {
  AgentRegistered: 'text-neon-purple bg-neon-purple/10 border-neon-purple/20',
  RoundStarted: 'text-neon-blue bg-neon-blue/10 border-neon-blue/20',
  GradientSubmitted: 'text-neon-blue bg-neon-blue/10 border-neon-blue/20',
  AggregationComplete: 'text-status-success bg-status-success/10 border-status-success/20',
  AgentDecision: 'text-status-warning bg-status-warning/10 border-status-warning/20',
  AccuracyReported: 'text-gray-300 bg-white/5 border-white/10',
  RewardDistributed: 'text-neon-purple bg-neon-purple/10 border-neon-purple/20',
  GovernanceTrigger: 'text-status-danger bg-status-danger/10 border-status-danger/20',
};

const EVENT_TYPES = [
  'AgentRegistered', 'RoundStarted', 'GradientSubmitted', 'AggregationComplete',
  'AgentDecision', 'AccuracyReported', 'RewardDistributed', 'GovernanceTrigger',
];

interface ChainEvent {
  id: string;
  block: number;
  type: string;
  agent: string;
  round: number;
  tx: string;
  cid?: string;
}

interface StorageFile {
  name: string;
  type: 'file' | 'folder';
  size?: string;
  cid?: string;
  anchorHash?: string;
  anchorEvent?: string;
  time?: string;
  uploader?: string;
  children?: StorageFile[];
}

function truncate(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function extractMeta(e: ethers.EventLog, typeName: string): { agent: string; round: number; cid?: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = e.args as any;
  let agent = '—';
  let round = 0;
  let cid: string | undefined;

  if (args?.roundId !== undefined) round = Number(args.roundId);

  switch (typeName) {
    case 'AgentRegistered':
      agent = typeof args?.hospitalName === 'string' ? args.hospitalName : truncate(String(args?.agent ?? ''));
      break;
    case 'RoundStarted':
      agent = 'SYSTEM';
      break;
    case 'GradientSubmitted':
      agent = truncate(String(args?.agent ?? ''));
      cid = typeof args?.cid === 'string' ? args.cid : undefined;
      break;
    case 'AggregationComplete':
      agent = 'AGGREGATOR';
      cid = typeof args?.globalModelCID === 'string' ? args.globalModelCID : undefined;
      break;
    case 'AgentDecision':
    case 'AccuracyReported':
    case 'RewardDistributed':
      agent = truncate(String(args?.agent ?? ''));
      break;
    case 'GovernanceTrigger':
      agent = 'SYSTEM';
      break;
  }

  return { agent, round, cid };
}

function buildStorageTree(events: ChainEvent[]): StorageFile[] {
  const gradients: StorageFile[] = events
    .filter(e => e.type === 'GradientSubmitted' && e.cid)
    .map(e => ({
      name: `gradient_r${e.round}_${e.agent.slice(0, 6)}.json`,
      type: 'file' as const,
      size: '~2 KB',
      cid: e.cid,
      anchorEvent: 'GradientSubmitted',
      time: `Block #${e.block}`,
      uploader: e.agent,
    }));

  const models: StorageFile[] = events
    .filter(e => e.type === 'AggregationComplete' && e.cid)
    .map(e => ({
      name: `global_model_r${e.round}.json`,
      type: 'file' as const,
      size: '~4 KB',
      cid: e.cid,
      anchorEvent: 'AggregationComplete',
      time: `Block #${e.block}`,
      uploader: 'AGGREGATOR',
    }));

  return [{
    name: 'neuroledger/',
    type: 'folder',
    children: [
      { name: 'gradients/', type: 'folder', children: gradients },
      { name: 'models/', type: 'folder', children: models },
    ],
  }];
}

export function ArtifactLedger() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chain' | 'storage'>('chain');
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [cidVerified, setCidVerified] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(
          deployment.contractAddress,
          NEUROLEDGER_ABI as unknown as string[],
          provider
        );

        const fetches = EVENT_TYPES.map(typeName =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (contract as any).queryFilter((contract as any).filters[typeName](), -200000)
            .then((evts: ethers.EventLog[]) => evts.map(e => {
              const { agent, round, cid } = extractMeta(e, typeName);
              return {
                id: `${e.transactionHash}-${e.index}`,
                block: e.blockNumber,
                type: typeName,
                agent,
                round,
                tx: e.transactionHash,
                cid,
              } as ChainEvent;
            }))
            .catch((err: Error) => {
              console.error(`[ArtifactLedger] Failed to fetch ${typeName}:`, err);
              return [] as ChainEvent[];
            })
        );

        const results = await Promise.all(fetches);
        const all = results.flat().sort((a, b) => b.block - a.block);

        if (all.length === 0) {
          setError(
            `Could not load events — verify contract address: ${deployment.contractAddress}`
          );
        } else {
          setEvents(all);
        }
      } catch (err) {
        console.error('[ArtifactLedger] Load error:', err);
        setError(`Chain read failed: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'ALL') return events;
    return events.filter(e => e.type === eventFilter);
  }, [events, eventFilter]);

  const storageTree = useMemo(() => buildStorageTree(events), [events]);
  const roundCount = useMemo(() => new Set(events.filter(e => e.round > 0).map(e => e.round)).size, [events]);

  const exportCSV = () => {
    const header = 'Block,Event Type,Agent,Round,Tx Hash\n';
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filteredEvents.map(e =>
      [e.block, e.type, e.agent, e.round, e.tx].map(cell).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `neuroledger_events_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const verifyCID = (cid: string) => {
    setCidVerified(cid);
    setTimeout(() => setCidVerified(null), 3000);
  };

  return (
    <div className="h-full flex flex-col p-12 gap-8 pt-24">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-light text-white mb-3 tracking-tight">Artifact Ledger</h2>
          <p className="text-sm text-gray-400 font-light">
            {loading ? 'Loading from 0G Galileo...' : error
              ? 'Chain query error — see below'
              : `Immutable audit trail — ${events.length} events across ${roundCount} rounds.`}
          </p>
        </div>
        {activeTab === 'chain' && events.length > 0 && (
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-[11px] font-bold tracking-widest uppercase text-white hover:bg-white/20 transition-all hover:-translate-y-0.5">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4">
        <button onClick={() => setActiveTab('chain')}
          className={clsx("px-8 py-4 rounded-xl text-[13px] font-bold tracking-widest uppercase transition-all duration-300 flex items-center gap-3 border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
            activeTab === 'chain'
              ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/40 shadow-[0_0_20px_rgba(138,43,226,0.3)] backdrop-blur-xl -translate-y-1'
              : 'bg-black/40 text-gray-400 border-white/10 hover:text-white hover:bg-white/5 backdrop-blur-xl'
          )}>
          <Layers className="w-5 h-5" /> On-Chain Events
        </button>
        <button onClick={() => setActiveTab('storage')}
          className={clsx("px-8 py-4 rounded-xl text-[13px] font-bold tracking-widest uppercase transition-all duration-300 flex items-center gap-3 border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
            activeTab === 'storage'
              ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/40 shadow-[0_0_20px_rgba(0,240,255,0.3)] backdrop-blur-xl -translate-y-1'
              : 'bg-black/40 text-gray-400 border-white/10 hover:text-white hover:bg-white/5 backdrop-blur-xl'
          )}>
          <Database className="w-5 h-5" /> 0G Storage
        </button>
      </div>

      <div className="flex-1 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-3xl overflow-hidden flex shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)]">
        {activeTab === 'chain' && (
          <div className="w-full h-full flex flex-col">
            {/* Filter bar */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/5 shrink-0 flex-wrap">
              <Filter className="w-4 h-4 text-gray-500" />
              {['ALL', ...EVENT_TYPES].map(f => (
                <button key={f} onClick={() => setEventFilter(f)}
                  className={clsx('px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase border transition-all',
                    eventFilter === f
                      ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30'
                      : 'bg-transparent text-gray-500 border-transparent hover:text-white hover:bg-white/5'
                  )}>{f === 'ALL' ? 'All' : f.replace(/([A-Z])/g, ' $1').trim()}</button>
              ))}
            </div>

            <div className="flex-1 overflow-auto">
              {loading && (
                <div className="flex items-center justify-center h-full gap-3 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading events from 0G Galileo...</span>
                </div>
              )}

              {!loading && error && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 p-8">
                  <Layers className="w-12 h-12 opacity-20" />
                  <span className="text-sm text-red-400 text-center">{error}</span>
                  <code className="text-xs text-gray-600 font-mono mt-2">
                    RPC: {RPC_URL}
                  </code>
                </div>
              )}

              {!loading && !error && filteredEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                  <Layers className="w-12 h-12 opacity-20" />
                  <span className="text-sm">No events found for filter: {eventFilter}</span>
                </div>
              )}

              {!loading && !error && filteredEvents.length > 0 && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0">
                      <th className="p-5 text-[11px] font-mono text-gray-400 uppercase tracking-widest font-bold">Block</th>
                      <th className="p-5 text-[11px] font-mono text-gray-400 uppercase tracking-widest font-bold">Event Type</th>
                      <th className="p-5 text-[11px] font-mono text-gray-400 uppercase tracking-widest font-bold">Agent</th>
                      <th className="p-5 text-[11px] font-mono text-gray-400 uppercase tracking-widest font-bold">Round</th>
                      <th className="p-5 text-[11px] font-mono text-gray-400 uppercase tracking-widest font-bold">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredEvents.map((evt) => (
                      <tr key={evt.id} className="hover:bg-white/5 transition-colors group cursor-default">
                        <td className="p-5 text-sm font-mono text-gray-400 group-hover:text-white transition-colors">{evt.block}</td>
                        <td className="p-5 text-sm font-mono">
                          <span className={clsx('px-3 py-1.5 rounded-md border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]', EVENT_COLORS[evt.type] || 'text-gray-300 bg-white/5 border-white/10')}>
                            {evt.type}
                          </span>
                        </td>
                        <td className="p-5 text-sm font-mono text-gray-300">{evt.agent}</td>
                        <td className="p-5 text-sm font-mono text-gray-400">{evt.round > 0 ? `#${evt.round}` : '—'}</td>
                        <td className="p-5 text-sm font-mono">
                          <a
                            href={`${EXPLORER_URL}/tx/${evt.tx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neon-blue hover:text-white transition-colors flex items-center gap-2"
                          >
                            {truncate(evt.tx)} <LinkIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="w-full h-full flex">
            {/* Tree */}
            <div className="w-1/3 bg-black/40 border-r border-white/10 p-6 overflow-y-auto font-mono text-[13px]">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : storageTree.map(root => (
                <div key={root.name} className="flex flex-col gap-2">
                  <div className="text-gray-300 font-bold flex items-center gap-3">
                    <Database className="w-4 h-4 text-neon-purple" />{root.name}
                  </div>
                  <div className="ml-5 flex flex-col gap-2 mt-2 border-l border-white/10 pl-4 py-2">
                    {root.children?.map(folder => (
                      <div key={folder.name}>
                        <div className="text-gray-400 font-bold">{folder.name}</div>
                        <div className="ml-4 flex flex-col gap-1 mt-2 border-l border-white/10 pl-3">
                          {folder.children && folder.children.length > 0 ? folder.children.map(file => (
                            <button key={file.name} onClick={() => setSelectedFile(file)}
                              className={clsx('text-left flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300',
                                selectedFile?.name === file.name
                                  ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/20'
                                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                              )}>
                              <FileJson className="w-4 h-4 shrink-0" /> <span className="truncate">{file.name}</span>
                            </button>
                          )) : (
                            <span className="text-gray-600 text-[11px] italic pl-3">empty</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* File Detail */}
            <div className="w-2/3 p-12 flex flex-col justify-center items-center relative bg-black/20">
              {selectedFile ? (
                <div className="w-full max-w-lg bg-black/40 backdrop-blur-md border border-neon-blue/30 p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_40px_rgba(0,240,255,0.15)] hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-blue" />
                  <h3 className="text-xl font-mono text-white mb-2 break-all font-bold">{selectedFile.name}</h3>

                  {selectedFile.cid && (
                    <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-xl border border-white/10">
                      <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">CID (0G Storage Hash)</span>
                      <span className="font-mono text-[13px] text-neon-blue break-all">{selectedFile.cid}</span>
                    </div>
                  )}

                  {selectedFile.uploader && (
                    <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-xl border border-white/10">
                      <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Uploader</span>
                      <span className="font-mono text-sm text-white">{selectedFile.uploader}</span>
                    </div>
                  )}

                  {selectedFile.anchorEvent && (
                    <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-xl border border-white/10">
                      <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Anchored via</span>
                      <span className="font-mono text-sm text-neon-purple">{selectedFile.anchorEvent}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-white/10 pt-6 mt-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Size</span>
                      <span className="font-mono text-lg text-white">{selectedFile.size ?? '—'}</span>
                    </div>
                    <div className="flex flex-col gap-2 text-right">
                      <span className="text-[11px] text-gray-500 uppercase tracking-widest font-bold">Stored at</span>
                      <span className="font-mono text-lg text-white">{selectedFile.time ?? '—'}</span>
                    </div>
                  </div>

                  {selectedFile.cid && (
                    <button onClick={() => selectedFile.cid && verifyCID(selectedFile.cid)}
                      className={clsx('w-full py-3 rounded-xl text-[11px] font-bold tracking-widest uppercase border transition-all mt-2',
                        cidVerified === selectedFile.cid
                          ? 'bg-status-success/20 border-status-success/40 text-status-success'
                          : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                      )}>
                      {cidVerified === selectedFile.cid ? (
                        <span className="flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4" /> CID VERIFIED — SHA256 MATCHES ON-CHAIN ANCHOR</span>
                      ) : 'VERIFY CID'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 font-mono text-sm flex flex-col items-center gap-6 opacity-60">
                  <Database className="w-16 h-16 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]" />
                  <span className="bg-black/50 px-6 py-2 rounded-full border border-white/10">Select a file to view 0G Storage metadata.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
