'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Cpu, ChevronDown, Shield, Brain, Box, Check, Plus, Wallet, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { clsx } from 'clsx';
import { useWallet } from '@/lib/hooks';
import { NEUROLEDGER_ABI, EXPLORER_URL, RPC_URL } from '@/lib/contract';
import deployment from '@/lib/deployment.json';

interface ChainAgent {
  address: string;
  hospitalName: string;
  region: string;
  specialization: string;
  stake: string;
  reputation: number;
  tokenId: number;
  roundsCompleted: number;
}

interface ChainStats {
  agentCount: number;
  currentRound: number;
  agents: ChainAgent[];
  loading: boolean;
}

function useChainStats(): ChainStats {
  const [stats, setStats] = useState<ChainStats>({ agentCount: 0, currentRound: 0, agents: [], loading: true });

  useEffect(() => {
    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(
          deployment.contractAddress,
          NEUROLEDGER_ABI as unknown as string[],
          provider
        );

        const [agentCount, currentRound, registeredEvents] = await Promise.all([
          contract.getAgentCount().then(Number),
          contract.currentRound().then(Number),
          // No block range limit — agents registered in any earlier session must be included
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (contract as any).queryFilter((contract as any).filters.AgentRegistered()),
        ]);

        // Fetch full agent info for each registered address
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentAddresses = (registeredEvents as ethers.EventLog[]).map(e => (e.args as any)?.agent as string).filter(Boolean);
        const uniqueAddrs = [...new Set(agentAddresses)];

        const agentInfos = await Promise.all(
          uniqueAddrs.map(addr =>
            contract.agents(addr).then((a: Record<string, unknown>) => ({
              address: addr,
              hospitalName: String(a.hospitalName ?? ''),
              region: String(a.region ?? ''),
              specialization: String(a.specialization ?? ''),
              stake: ethers.formatEther((a.stake as bigint) ?? 0n) + ' A0GI',
              reputation: Number(a.reputation ?? 0),
              tokenId: Number(a.agentTokenId ?? 0),
              roundsCompleted: Number(a.roundsCompleted ?? 0),
            } as ChainAgent)).catch(() => null)
          )
        );

        const agents = agentInfos.filter((a): a is ChainAgent => a !== null && a.hospitalName !== '');

        setStats({ agentCount, currentRound, agents, loading: false });
      } catch (err) {
        console.error('[GlobalNetworkView] chain fetch failed:', err);
        setStats(s => ({ ...s, loading: false }));
      }
    }
    load();
  }, []);

  return stats;
}

export function GlobalNetworkView({ onDeployClick }: { onDeployClick?: () => void }) {
  const { wallet, connect } = useWallet();
  const { agentCount, currentRound, agents, loading } = useChainStats();

  const scrollToTopology = () => {
    document.getElementById('topology-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const hasAgents = agents.length > 0;

  const badgeText = loading
    ? '0G GALILEO — LOADING...'
    : agentCount === 0
      ? '0G GALILEO ACTIVE • DEPLOY YOUR FIRST AGENT'
      : `0G GALILEO ACTIVE • ${agentCount} AGENT${agentCount !== 1 ? 'S' : ''} • ${currentRound > 0 ? `ROUND #${currentRound}` : 'NO ROUNDS YET'}`;

  return (
    <div className="flex flex-col w-full min-h-full">
      {/* Hero Section */}
      <div className="relative w-full h-screen min-h-[800px] shrink-0 flex flex-col justify-center items-center group overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" />

        {/* Top Badge */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center justify-center text-center px-4 w-full pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
            className="px-8 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-neon-blue text-base md:text-lg font-mono hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_40px_rgba(0,240,255,0.4)] transition-all cursor-default shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] font-bold tracking-widest uppercase flex items-center gap-3"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin opacity-60" />}
            {badgeText}
          </motion.div>
        </div>

        {/* Floating Pillars */}
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 flex items-center justify-center gap-12 z-30 cursor-pointer pointer-events-auto" onClick={scrollToTopology}>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex justify-center items-center group hover:bg-white/10 hover:border-neon-blue/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Brain className="w-8 h-8 text-neon-blue drop-shadow-[0_0_15px_rgba(0,240,255,0.8)]" />
          </motion.div>
          <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl flex justify-center items-center group hover:bg-white/10 hover:border-status-success/50 hover:shadow-[0_0_40px_rgba(0,255,150,0.3)] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Box className="w-10 h-10 text-status-success drop-shadow-[0_0_15px_rgba(0,255,150,0.8)]" />
          </motion.div>
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex justify-center items-center group hover:bg-white/10 hover:border-neon-purple/50 hover:shadow-[0_0_30px_rgba(138,43,226,0.3)] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <Shield className="w-8 h-8 text-neon-purple drop-shadow-[0_0_15px_rgba(138,43,226,0.8)]" />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-gray-400 z-30 pointer-events-auto cursor-pointer hover:text-white transition-colors"
          onClick={scrollToTopology}>
          <ChevronDown className="w-6 h-6 animate-bounce" />
        </motion.div>
      </div>

      {/* Network Topology */}
      <div id="topology-section" className="relative z-30 px-8 mx-auto w-full max-w-7xl pt-24 pb-40 flex flex-col items-center pointer-events-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight text-center">Global Neural Topology</h2>
        <p className="text-lg text-gray-400 font-light mb-12 text-center max-w-2xl leading-relaxed">
          {loading
            ? 'Reading registered agents from 0G Galileo...'
            : hasAgents
              ? `${agentCount} federated node${agentCount !== 1 ? 's' : ''} registered on 0G Galileo.`
              : 'No agents deployed yet. Register a hospital node to join the federated network.'}
        </p>

        {!hasAgents && !loading && (
          <div className="flex gap-4 mb-12">
            {!wallet.connected && (
              <button onClick={connect} className="px-8 py-4 bg-gradient-to-r from-neon-blue/20 to-neon-purple/20 border border-neon-blue/40 text-white rounded-2xl text-[13px] font-bold tracking-widest uppercase hover:shadow-[0_0_30px_rgba(0,240,255,0.3)] transition-all flex items-center gap-3">
                <Wallet className="w-5 h-5 text-neon-blue" /> Connect Wallet
              </button>
            )}
            <button onClick={onDeployClick} className="px-8 py-4 bg-status-success/20 border border-status-success/40 text-white rounded-2xl text-[13px] font-bold tracking-widest uppercase hover:bg-status-success/30 hover:shadow-[0_0_30px_rgba(0,255,150,0.3)] transition-all flex items-center gap-3">
              <Plus className="w-5 h-5 text-status-success" /> Deploy Hospital Agent
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-gray-500 py-16">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono">Reading chain state...</span>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            {agents.map((agent, i) => (
              <motion.div key={agent.address}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }} transition={{ delay: i * 0.1, duration: 0.6 }}
                className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 flex flex-col gap-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)] group relative overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:border-white/30 cursor-default"
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.08),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="flex justify-between items-start relative z-10 w-full">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-gray-300 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-status-success/10 border border-status-success/30">
                    <div className="w-2 h-2 rounded-full bg-status-success shadow-[0_0_10px_rgba(0,255,150,0.8)]" />
                    <span className="text-[10px] font-bold tracking-widest uppercase text-status-success">ACTIVE</span>
                  </div>
                </div>

                <div className="mt-2 relative z-10">
                  <h3 className="text-2xl font-bold text-white mb-1">{agent.hospitalName}</h3>
                  <span className="text-sm font-mono text-status-success tracking-wide">{agent.specialization || agent.region}</span>
                </div>

                {/* Reputation bar */}
                <div className="flex items-center gap-3 relative z-10">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-neon-purple to-neon-blue rounded-full transition-all duration-1000"
                      style={{ width: `${(agent.reputation / 10000) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400">{(agent.reputation / 100).toFixed(0)}%</span>
                </div>

                <div className="mt-auto border-t border-white/10 pt-5 flex justify-between items-center relative z-10">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-500 tracking-widest font-bold uppercase">Stake</span>
                    <span className="text-lg font-mono text-neon-purple drop-shadow-[0_0_10px_rgba(138,43,226,0.6)] font-bold">{agent.stake}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[10px] text-gray-500 tracking-widest font-bold uppercase">Token ID</span>
                    <span className="text-lg font-mono text-gray-300">#{agent.tokenId}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Add Agent Card — only if at least one exists */}
            {hasAgents && (
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                onClick={onDeployClick}
                className="bg-black/20 backdrop-blur-xl border border-dashed border-white/20 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-neon-blue/40 hover:bg-white/5 transition-all duration-300 min-h-[280px]"
              >
                <Plus className="w-10 h-10 text-gray-600" />
                <span className="text-sm text-gray-500 font-medium">Deploy New Agent</span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Deterministic Verification */}
      <div className="relative z-30 px-8 mx-auto w-full max-w-7xl py-32 flex flex-col items-center pointer-events-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight text-center">Deterministic Verification</h2>
        <p className="text-lg text-gray-400 font-light text-center max-w-3xl leading-relaxed mb-20">
          Every gradient update is cryptographically proven via Intel TDX attestation reports written directly to the 0G data availability layer.
        </p>

        <div className="relative w-full max-w-4xl group cursor-default">
          <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
             <div className="flex items-center px-4 py-3 border-b border-white/10 bg-white/5">
                <div className="flex gap-2">
                   <div className="w-3 h-3 rounded-full bg-white/20" />
                   <div className="w-3 h-3 rounded-full bg-white/20" />
                   <div className="w-3 h-3 rounded-full bg-white/20" />
                </div>
                <div className="mx-auto text-xs font-mono text-gray-500">TDX-ATTESTATION.JSON</div>
             </div>
             <div className="p-8 overflow-x-auto text-sm md:text-base font-mono leading-loose text-gray-400">
               <pre>
{`{
  "quote_version": "4",
  "td_quote_body": {
    "mr_enclave": "`}<span className="text-neon-purple">0x8fa3...b29c</span>{`",
    "mr_signer": "`}<span className="text-neon-blue">0x11c2...99f1</span>{`",
    "rtmr_0": "`}<span className="text-status-success">00000000000000000000000000000000</span>{`"
  },
  "timestamp": "2026-05-14T04:22:00Z",
  "0g_da_cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "signature": "0x539...a1b"
}`}
               </pre>
             </div>
          </div>

          <div className="absolute -bottom-4 -right-4 md:-right-6 md:-bottom-6 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-20 pointer-events-none">
            <div className="w-24 h-24 rounded-full border border-status-success/50 bg-black/40 backdrop-blur-md flex flex-col items-center justify-center shadow-[0_0_30px_rgba(0,255,150,0.15),inset_0_0_15px_rgba(0,255,150,0.1)] transform rotate-[-15deg] group-hover:rotate-[-5deg] transition-transform duration-700">
               <div className="w-[86px] h-[86px] rounded-full border border-dashed border-status-success/40 flex flex-col items-center justify-center absolute">
                 <Check className="w-7 h-7 text-status-success drop-shadow-[0_0_8px_rgba(0,255,150,0.8)]" />
                 <span className="text-[9px] font-bold font-mono text-status-success tracking-widest uppercase mt-1">Verified</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Changelog */}
      <div className="relative z-30 w-full py-32 bg-black/40 border-y border-white/5 pointer-events-auto">
         <div className="max-w-7xl mx-auto px-8">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-24 tracking-tight">Changelog</h2>
            <div className="relative w-full border-t border-white/10 flex flex-col md:flex-row gap-12 md:gap-8 pt-8">
               {[
                 { date: "APR 30, 2026", title: "Mainnet Release", desc: "Plan and track global models directly from the agent interface." },
                 { date: "APR 23, 2026", title: "0G Storage Support", desc: "Agents can now stream gradients directly to 0G DA verifiable on-chain." },
                 { date: "MAR 15, 2026", title: "Intel TDX Enclaves", desc: "Hardware-level memory encryption for zero-trust aggregation." }
               ].map((item, i) => (
                 <div key={i} className="flex-1 relative group cursor-default pt-4">
                    <div className="absolute -top-[37px] left-0 w-3 h-3 rounded-full bg-gray-600 border-2 border-black group-hover:bg-white group-hover:shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all duration-300" />
                    <div className="text-xs font-mono text-gray-500 mb-3 group-hover:text-gray-300 transition-colors uppercase tracking-widest">{item.date}</div>
                    <h4 className="text-lg font-medium text-gray-300 mb-3 group-hover:text-white transition-colors">{item.title}</h4>
                    <p className="text-[15px] font-light text-gray-500 group-hover:text-gray-400 leading-relaxed transition-colors pr-4">{item.desc}</p>
                 </div>
               ))}
            </div>
         </div>
      </div>

      {/* Architecture CTA */}
      <div className="relative w-full py-40 flex flex-col items-center justify-center px-6 overflow-hidden z-20 pointer-events-auto">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neon-purple/20 rounded-full blur-[150px] opacity-60 pointer-events-none z-10" />
        <div className="relative z-20 flex flex-col items-center max-w-4xl text-center">
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="mb-12 w-24 h-24 bg-gradient-to-br from-neon-blue to-neon-purple rounded-3xl p-[1px] shadow-[0_0_50px_rgba(138,43,226,0.5)]">
            <div className="w-full h-full bg-black/60 backdrop-blur-2xl rounded-3xl flex items-center justify-center border border-white/10">
              <Cpu className="w-10 h-10 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
            </div>
          </motion.div>
          <h2 className="text-5xl md:text-7xl font-bold text-white tracking-tighter mb-8 max-w-3xl leading-tight">
            Train together, <br className="hidden md:block"/>heal globally.
          </h2>
          <p className="text-lg md:text-xl text-gray-300 font-light mb-12 max-w-2xl leading-relaxed opacity-90">
            From localized datasets to a unified clinical intelligence. NeuroLedger keeps your patient records secure on-premise while mathematical proofs sync the intelligence to the 0G network.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button onClick={onDeployClick} className="px-10 py-5 bg-status-success text-black font-bold text-[13px] tracking-widest uppercase rounded-2xl hover:bg-status-success/90 hover:scale-105 hover:shadow-[0_0_40px_rgba(0,255,150,0.4)] transition-all duration-300">
              Deploy Hospital Agent
            </button>
            <a href={`${EXPLORER_URL}/tx/${deployment.deployTxHash}`} target="_blank" rel="noopener noreferrer"
              className="px-10 py-5 bg-white/5 border border-white/20 text-white font-bold text-[13px] tracking-widest uppercase rounded-2xl backdrop-blur-md hover:bg-white/10 hover:scale-105 transition-all duration-300">
              View on 0G Explorer
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-30 w-full border-t border-white/5 bg-[#000000] pt-24 pb-12 px-8 pointer-events-auto">
        <div className="max-w-7xl mx-auto flex flex-col gap-20">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-12">
            <div className="col-span-2 md:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col gap-5 text-sm">
              <h4 className="text-white font-medium mb-2">Product</h4>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Agents</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Network</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Security</a>
            </div>
            <div className="flex flex-col gap-5 text-sm">
              <h4 className="text-white font-medium mb-2">Protocol</h4>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">0G Chain</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Storage</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Compute</a>
            </div>
            <div className="flex flex-col gap-5 text-sm">
              <h4 className="text-white font-medium mb-2">Company</h4>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">About</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">Blog</a>
            </div>
            <div className="flex flex-col gap-5 text-sm">
              <h4 className="text-white font-medium mb-2">Connect</h4>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">GitHub</a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">X / Twitter</a>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-[13px] text-gray-500 gap-6">
            <p>© 2026 NeuroLedger Protocol</p>
            <div className="flex gap-8">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
