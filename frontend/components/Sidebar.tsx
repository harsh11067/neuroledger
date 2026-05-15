'use client';

import { Activity, Cpu, Database, Network, ShieldCheck, Wallet, LogOut, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { useWallet } from '@/lib/hooks';

interface SidebarProps {
  activePanel: number;
  setActivePanel: (index: number) => void;
}

const navItems = [
  { id: 0, label: 'Dashboard', icon: Network },
  { id: 1, label: 'Node Network', icon: Database },
  { id: 2, label: 'Training Simulator', icon: Activity },
  { id: 3, label: 'TEE Enclaves', icon: ShieldCheck },
  { id: 4, label: 'Artifact Ledger', icon: Cpu },
];

export function Sidebar({ activePanel, setActivePanel }: SidebarProps) {
  const { wallet, connect, disconnect, truncateAddress } = useWallet();

  return (
    <div className="w-full h-full border-r border-white/10 bg-black/40 backdrop-blur-2xl flex flex-col pt-20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
      <div className="px-6 pb-6 border-b border-white/10 flex items-center gap-3">
        <span className="font-bold tracking-[0.1em] text-white text-lg flex items-center">
          NEUR<span className="relative inline-block mx-1">
            <span className="absolute inset-0 bg-neon-blue blur-[8px] opacity-60 rounded-full" />
            <span className="relative z-10 text-white">O</span>
          </span>LEDGER
        </span>
      </div>

      <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
        <div className="px-3 text-[10px] uppercase tracking-widest text-gray-500 mb-4 font-semibold">Primary Operations</div>
        {navItems.map((item) => {
          const isActive = activePanel === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={clsx(
                'relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left w-full group',
                isActive 
                  ? 'bg-white/10 text-neon-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] border border-white/10' 
                  : 'hover:bg-white/5 text-gray-400 hover:text-white border border-transparent'
              )}
            >
              <Icon className={clsx('w-4 h-4 relative z-10 transition-colors', isActive ? 'text-neon-blue' : 'opacity-60 group-hover:opacity-100 group-hover:text-neon-blue')} />
              <span className={clsx("font-medium tracking-wide relative z-10 text-sm transition-colors", isActive ? "text-white" : "")}>{item.label}</span>
              {isActive && (
                <div className="absolute inset-0 border border-neon-blue/20 rounded-lg shadow-[0_0_15px_rgba(0,240,255,0.1)] mix-blend-screen pointer-events-none" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Wallet Section */}
      <div className="p-6 border-t border-white/10 shrink-0">
        {wallet.connected ? (
          <>
            <div className="text-[10px] uppercase text-gray-500 mb-2 font-bold flex items-center justify-between">
              <span>Wallet Connected</span>
              <button
                onClick={disconnect}
                className="text-gray-500 hover:text-red-400 transition-colors p-1"
                title="Disconnect"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-white/10 transition-colors cursor-pointer group">
              <div className="w-2 h-2 rounded-full bg-status-success shadow-[0_0_10px_rgba(0,255,150,0.8)] group-hover:animate-pulse" />
              <span className="text-xs font-mono text-gray-300 group-hover:text-white transition-colors">
                {truncateAddress(wallet.address!)}
              </span>
            </div>
            {wallet.balance && (
              <div className="mt-2 text-[11px] font-mono text-gray-500 px-1">
                Balance: <span className="text-neon-blue">{wallet.balance} A0GI</span>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={connect}
            className="w-full flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-neon-blue/20 to-neon-purple/20 backdrop-blur-md rounded-xl border border-neon-blue/30 text-white text-xs font-bold tracking-widest uppercase hover:from-neon-blue/30 hover:to-neon-purple/30 hover:border-neon-blue/50 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:-translate-y-0.5 transition-all duration-300"
          >
            <Wallet className="w-4 h-4 text-neon-blue" />
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
}
