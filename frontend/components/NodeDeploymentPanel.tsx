'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Database, Shield, Zap, SlidersHorizontal, ExternalLink, UserCheck, Upload } from 'lucide-react';
import { useWallet } from '@/lib/hooks';
import { NEUROLEDGER_ABI, EXPLORER_URL } from '@/lib/contract';
import deployment from '@/lib/deployment.json';

interface ExistingAgent {
  hospitalName: string;
  region: string;
  specialization: string;
  stake: string;
  reputation: number;
  tokenId: number;
  acceptThresholdBps: number;
  retrainThresholdBps: number;
  roundsCompleted: number;
}

interface DatasetStats {
  rows: number;
  cols: number;
  columns: string[];
  labelColumn: string;
  classDistribution: Record<string, number>;
  featureCount: number;
  missingValues: number;
}

interface UploadState {
  status: 'idle' | 'parsing' | 'ready' | 'error';
  stats: DatasetStats | null;
  fileName: string;
  errorMsg: string;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 bg-white/5 rounded-xl border border-white/10">
      <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">{label}</div>
      <div className="text-xl font-bold font-mono text-[#00d4aa]">{value}</div>
    </div>
  );
}

function DatasetUploadSection({
  walletAddress,
  hospitalName,
}: {
  walletAddress: string;
  hospitalName: string;
}) {
  const [upload, setUpload] = useState<UploadState>({ status: 'idle', stats: null, fileName: '', errorMsg: '' });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if dataset already uploaded on mount
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/dataset/status?wallet=${encodeURIComponent(walletAddress)}`)
      .then(r => r.json())
      .then(data => {
        if (data.hasDataset && data.meta?.stats) {
          setUpload({ status: 'ready', stats: data.meta.stats, fileName: data.meta.fileName || 'dataset.csv', errorMsg: '' });
        }
      })
      .catch(() => {});
  }, [walletAddress]);

  async function processFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setUpload(u => ({ ...u, status: 'error', errorMsg: 'Only .csv files accepted' }));
      return;
    }
    setUpload(u => ({ ...u, status: 'parsing', fileName: file.name }));
    const formData = new FormData();
    formData.append('file', file);
    formData.append('wallet', walletAddress);
    formData.append('hospitalName', hospitalName);
    try {
      const res = await fetch('/api/dataset/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      setUpload({ status: 'ready', stats: data.stats, fileName: file.name, errorMsg: '' });
    } catch (err) {
      setUpload(u => ({ ...u, status: 'error', errorMsg: String(err) }));
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, hospitalName]);

  const classEntries = upload.stats ? Object.entries(upload.stats.classDistribution).slice(0, 3) : [];
  const totalSample = classEntries.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="mt-5 border border-white/10 rounded-2xl p-5 bg-black/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#00d4aa]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Patient Dataset</span>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full border border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]">
          🔒 Data never leaves this machine
        </span>
      </div>

      <p className="text-[12px] text-gray-500 mb-3 leading-relaxed">
        Upload your hospital CSV. The gradient is computed locally and DP-noised (ε=1.0).
        Your <strong className="text-gray-300">raw data is deleted immediately</strong> after training — only the gradient reaches 0G Storage.
      </p>

      {/* Sample links */}
      <div className="flex flex-wrap gap-2 mb-3 p-2.5 bg-white/[0.02] rounded-xl border border-white/5 text-[11px]">
        <span className="text-gray-600">Sample datasets:</span>
        {[
          { label: '↓ Heart Disease (297)', href: 'https://archive.ics.uci.edu/ml/machine-learning-databases/heart-disease/processed.cleveland.data' },
          { label: '↓ Diabetes (768)', href: 'https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.csv' },
          { label: '↓ Liver (345)', href: 'https://archive.ics.uci.edu/ml/machine-learning-databases/liver-disorders/bupa.data' },
        ].map(l => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
            className="text-neon-purple border border-neon-purple/30 px-2 py-0.5 rounded hover:bg-neon-purple/10 transition-colors">
            {l.label}
          </a>
        ))}
      </div>

      {/* Drop zone */}
      {upload.status !== 'ready' && (
        <div
          className={`border-2 border-dashed rounded-xl px-5 py-7 text-center cursor-pointer transition-all ${
            dragOver ? 'border-neon-purple bg-neon-purple/5' :
            upload.status === 'error' ? 'border-red-500/50 bg-red-500/5' :
            'border-white/10 hover:border-white/30'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} style={{ display: 'none' }} />
          {upload.status === 'idle' && (
            <>
              <div className="text-2xl mb-2">📂</div>
              <p className="text-[13px] text-gray-300 font-medium">Drop patient CSV here</p>
              <p className="text-[11px] text-gray-500 mt-1">or click to browse · .csv only · max 50MB</p>
            </>
          )}
          {upload.status === 'parsing' && (
            <>
              <div className="text-2xl mb-2 animate-pulse">⏳</div>
              <p className="text-[13px] text-gray-300">Processing {upload.fileName}...</p>
            </>
          )}
          {upload.status === 'error' && (
            <>
              <div className="text-2xl mb-2">❌</div>
              <p className="text-[13px] text-gray-300">Upload failed</p>
              <p className="text-[11px] text-red-400 mt-1">{upload.errorMsg}</p>
              <p className="text-[11px] text-gray-500 mt-1">Click to try again</p>
            </>
          )}
        </div>
      )}

      {/* Ready state */}
      {upload.status === 'ready' && upload.stats && (
        <div className="border border-[#00d4aa]/30 rounded-xl p-4 bg-[#00d4aa]/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">✅</span>
            <span className="text-[13px] text-white font-medium flex-1">{upload.fileName}</span>
            <button
              className="text-[10px] text-gray-500 border border-white/10 rounded px-2 py-0.5 hover:border-white/30 hover:text-gray-300 transition-all"
              onClick={() => { setUpload({ status: 'idle', stats: null, fileName: '', errorMsg: '' }); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            >
              Replace
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatCard label="Patients" value={upload.stats.rows.toLocaleString()} />
            <StatCard label="Features" value={String(upload.stats.featureCount)} />
            <StatCard label="Label" value={upload.stats.labelColumn || 'last col'} />
            <StatCard label="Classes" value={String(Object.keys(upload.stats.classDistribution).length)} />
          </div>

          {/* Class distribution */}
          {classEntries.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-gray-600 mb-1.5">Label distribution (sample):</div>
              {classEntries.map(([label, count]) => (
                <div key={label} className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] text-gray-400 w-12 truncate">{label}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-neon-purple to-[#00d4aa] rounded-full transition-all"
                      style={{ width: `${Math.min(100, (count / (totalSample || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-600 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Columns */}
          <div className="flex flex-wrap gap-1 mb-3">
            {upload.stats.columns.slice(0, 8).map(col => (
              <span key={col} className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                col === upload.stats!.labelColumn
                  ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/30'
                  : 'bg-white/5 text-gray-500 border-white/10'
              }`}>
                {col === upload.stats!.labelColumn ? `🎯 ${col}` : col}
              </span>
            ))}
            {upload.stats.columns.length > 8 && (
              <span className="text-[10px] text-gray-600 px-2 py-0.5">+{upload.stats.columns.length - 8} more</span>
            )}
          </div>

          <div className="flex items-start gap-2 p-2.5 bg-yellow-500/[0.04] border border-yellow-500/15 rounded-lg text-[11px] text-gray-400">
            <span className="text-base shrink-0">🛡️</span>
            <span>Stored in temporary local buffer. <strong className="text-gray-300">Permanently deleted</strong> the moment your gradient is computed. Only the DP-noised gradient (ε=1.0) is published to 0G Storage.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function NodeDeploymentPanel() {
  const { wallet } = useWallet();
  const [logs, setLogs] = useState<string[]>([
    '> 0G Galileo Testnet CLI v1.0.4 loaded.',
    '> Awaiting deployment configuration...'
  ]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedTxHash, setDeployedTxHash] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState('');
  const [region, setRegion] = useState('APAC');
  const [specialization, setSpecialization] = useState('General');
  const [datasetSize, setDatasetSize] = useState(150000);
  const [acceptThreshold, setAcceptThreshold] = useState(0.5);
  const [retrainThreshold, setRetrainThreshold] = useState(-1.0);
  const [stakeAmount, setStakeAmount] = useState('0.01');
  const [existingAgent, setExistingAgent] = useState<ExistingAgent | null>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const isRealDeployment = Boolean(
    wallet.connected &&
    wallet.isCorrectChain &&
    deployment.contractAddress &&
    deployment.contractAddress.startsWith('0x') &&
    deployment.contractAddress.length === 42
  );

  // Pre-check: when wallet connects + contract is live, check if already registered
  useEffect(() => {
    if (!isRealDeployment || !wallet.address) return;
    const ethereum = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return;

    setCheckingRegistration(true);
    import('ethers').then(async ({ ethers }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider = new ethers.BrowserProvider(ethereum as any);
        const contract = new ethers.Contract(deployment.contractAddress, NEUROLEDGER_ABI as unknown as string[], provider);
        const agent = await contract.agents(wallet.address);
        if (agent.active) {
          const existing: ExistingAgent = {
            hospitalName: agent.hospitalName,
            region: agent.region,
            specialization: agent.specialization,
            stake: ethers.formatEther(agent.stake) + ' A0GI',
            reputation: Number(agent.reputation),
            tokenId: Number(agent.agentTokenId),
            acceptThresholdBps: Number(agent.acceptThresholdBps),
            retrainThresholdBps: Number(agent.retrainThresholdBps),
            roundsCompleted: Number(agent.roundsCompleted),
          };
          setExistingAgent(existing);
          setLogs([
            '> 0G Galileo Testnet CLI v1.0.4 loaded.',
            `> Connected: ${wallet.address}`,
            `> Agent already registered on 0G Galileo.`,
            `> Hospital: ${existing.hospitalName}`,
            `> Token ID: #${existing.tokenId}  |  Reputation: ${existing.reputation}`,
            `> Accept ≥ ${(existing.acceptThresholdBps / 100).toFixed(2)}%  |  Retrain ≥ ${(existing.retrainThresholdBps / 100).toFixed(2)}%`,
            `> Rounds completed: ${existing.roundsCompleted}`,
            `> ────────────────────────────────────────────`,
            `> Status: ACTIVE — ready to participate in training rounds.`,
          ]);
        } else {
          setExistingAgent(null);
          setLogs([
            '> 0G Galileo Testnet CLI v1.0.4 loaded.',
            `> Connected: ${wallet.address}`,
            `> No agent registered at this address.`,
            `> Fill out the form to register on 0G Galileo.`,
          ]);
        }
      } catch (e) {
        console.error('Registration check failed:', e);
      } finally {
        setCheckingRegistration(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealDeployment, wallet.address]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const handleDeployReal = async (name: string) => {
    const ethereum = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return false;

    addLog('> Connecting to MetaMask...');

    try {
      const { ethers } = await import('ethers');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new ethers.BrowserProvider(ethereum as any);
      const signer = await provider.getSigner();

      addLog(`> Signer: ${signer.address}`);

      const acceptBps = Math.round(acceptThreshold * 100);
      const retrainBps = Math.round(Math.abs(retrainThreshold) * 100);
      const stakeWei = ethers.parseEther(stakeAmount || '0.01');

      addLog(`> Decision Policy: ACCEPT ≥ ${acceptThreshold.toFixed(2)}% (${acceptBps}bps) | RETRAIN ≥ ${retrainThreshold.toFixed(2)}% (${retrainBps}bps)`);
      addLog('> Calling registerAgent() on 0G Galileo — check MetaMask...');

      const contract = new ethers.Contract(deployment.contractAddress, NEUROLEDGER_ABI as unknown as string[], signer);
      const tx = await contract.registerAgent(
        name,
        region,
        specialization,
        acceptBps,
        retrainBps,
        { value: stakeWei }
      );

      addLog(`> TX submitted: ${tx.hash}`);
      addLog(`> Waiting for block confirmation on 0G Galileo...`);
      setDeployedTxHash(tx.hash);

      const receipt = await tx.wait(1);
      addLog(`> Confirmed in block #${receipt.blockNumber}`);

      // Parse AgentRegistered event
      const iface = new ethers.Interface(NEUROLEDGER_ABI as unknown as string[]);
      const registeredLog = receipt.logs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((log: any) => { try { return iface.parseLog(log); } catch { return null; } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .find((e: any) => e?.name === 'AgentRegistered');

      const tokenId = registeredLog?.args?.tokenId ?? 0;
      addLog(`> [SUCCESS] Agent Token ID: #${tokenId}`);
      addLog(`> [SUCCESS] Agent "${name}" registered on 0G Galileo!`);
      addLog(`> Explorer: ${EXPLORER_URL}/tx/${tx.hash}`);
      addLog(`> ────────────────────────────────────────────`);

      setExistingAgent({
        hospitalName: name,
        region,
        specialization,
        stake: stakeAmount + ' A0GI',
        reputation: 100,
        tokenId: Number(tokenId),
        acceptThresholdBps: Math.round(acceptThreshold * 100),
        retrainThresholdBps: Math.round(Math.abs(retrainThreshold) * 100),
        roundsCompleted: 0,
      });

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('user rejected') || msg.includes('User rejected')) {
        addLog('> ❌ Transaction rejected in MetaMask.');
      } else if (msg.includes('Already registered')) {
        addLog('> ℹ️  This wallet is already registered. Reloading agent data...');
        window.location.reload();
      } else {
        addLog(`> ❌ Error: ${msg.slice(0, 120)}`);
      }
      return false;
    }
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim() || isDeploying) return;

    if (!wallet.connected) {
      addLog('> ❌ Connect MetaMask to submit real on-chain transactions.');
      return;
    }
    if (!wallet.isCorrectChain) {
      addLog('> ❌ Switch MetaMask to 0G Galileo Testnet (Chain ID 16602).');
      return;
    }
    if (!deployment.contractAddress || !deployment.contractAddress.startsWith('0x')) {
      addLog('> ❌ Contract not deployed. Run: npx hardhat run scripts/deploy.ts --network og_galileo');
      return;
    }

    setIsDeploying(true);
    setDeployedTxHash(null);

    const success = await handleDeployReal(hospitalName.trim());
    if (success) {
      setHospitalName('');
    }
    setIsDeploying(false);
  };

  return (
    <div className="h-full flex gap-8 p-12 relative pt-24">
      {/* Form Side */}
      <div className="w-1/2 flex flex-col pt-4 bg-black/40 backdrop-blur-2xl p-10 rounded-3xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)] overflow-y-auto">
        <div className="mb-8">
          <h2 className="text-4xl font-light text-white mb-3 tracking-tight">Deploy Edge Node</h2>
          <p className="text-gray-400 text-sm font-light">Provision a new TEE-secured agent on the NeuroLedger network.</p>
          {checkingRegistration && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              Checking registration status on 0G Galileo...
            </div>
          )}
          {isRealDeployment && !existingAgent && !checkingRegistration && (
            <div className="mt-3 flex items-center gap-2 text-xs text-status-success">
              <div className="w-2 h-2 rounded-full bg-status-success shadow-[0_0_8px_rgba(0,255,150,0.8)] animate-pulse" />
              Live — transactions will be sent to 0G Galileo Testnet
            </div>
          )}
          {wallet.connected && !wallet.isCorrectChain && (
            <div className="mt-3 text-xs text-amber-400">
              ⚠️ MetaMask is on wrong network. Switch to 0G Galileo (Chain ID 16602).
            </div>
          )}
          {!wallet.connected && (
            <div className="mt-3 text-xs text-gray-500">
              Connect MetaMask to submit real on-chain transactions.
            </div>
          )}
        </div>

        {/* Already registered — show agent card + dataset upload */}
        {existingAgent && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 p-5 bg-status-success/10 border border-status-success/30 rounded-2xl">
              <UserCheck className="w-6 h-6 text-status-success shrink-0" />
              <div>
                <div className="text-sm font-bold text-status-success">Agent Active on 0G Galileo</div>
                <div className="text-xs text-gray-400 mt-0.5">This wallet is already registered. No new transaction needed.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Hospital', existingAgent.hospitalName],
                ['Token ID', `#${existingAgent.tokenId}`],
                ['Region', existingAgent.region],
                ['Specialization', existingAgent.specialization],
                ['Stake', existingAgent.stake],
                ['Reputation', `${existingAgent.reputation} / 10000`],
                ['Accept Threshold', `${(existingAgent.acceptThresholdBps / 100).toFixed(2)}% (${existingAgent.acceptThresholdBps} bps)`],
                ['Retrain Threshold', `${(existingAgent.retrainThresholdBps / 100).toFixed(2)}% (${existingAgent.retrainThresholdBps} bps)`],
                ['Rounds Completed', String(existingAgent.roundsCompleted)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 p-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</span>
                  <span className="text-sm text-white font-mono">{value}</span>
                </div>
              ))}
            </div>
            <a
              href={`${EXPLORER_URL}/address/${wallet.address}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-neon-blue hover:text-white transition-colors py-2"
            >
              <ExternalLink className="w-3 h-3" />
              View Agent on 0G Galileo Explorer
            </a>

            {/* Dataset Upload — only shown for registered agents */}
            {wallet.address && (
              <DatasetUploadSection
                walletAddress={wallet.address}
                hospitalName={existingAgent.hospitalName}
              />
            )}
          </div>
        )}

        {!existingAgent && <form onSubmit={handleDeploy} className="flex-1 flex flex-col gap-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-3">
              <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Hospital Name / Entity</label>
              <input
                type="text"
                required
                value={hospitalName}
                onChange={e => setHospitalName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-neon-blue/50 focus:ring-1 focus:ring-neon-blue/50 transition-all placeholder:text-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                placeholder="e.g. Kerala Rural Hospital"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col gap-3 flex-1">
                <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Region</label>
                <select
                  value={region}
                  onChange={e => setRegion(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-neon-blue/50 transition-all appearance-none cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <option className="bg-black" value="APAC">APAC</option>
                  <option className="bg-black" value="EU">EU</option>
                  <option className="bg-black" value="Americas">Americas</option>
                  <option className="bg-black" value="Africa">Africa</option>
                </select>
              </div>
              <div className="flex flex-col gap-3 flex-1">
                <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Specialization</label>
                <select
                  value={specialization}
                  onChange={e => setSpecialization(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-neon-blue/50 transition-all appearance-none cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <option className="bg-black" value="General">General</option>
                  <option className="bg-black" value="Cardiology">Cardiology</option>
                  <option className="bg-black" value="Oncology">Oncology</option>
                  <option className="bg-black" value="Radiology">Radiology</option>
                  <option className="bg-black" value="Emergency">Emergency</option>
                </select>
              </div>
            </div>

            {/* Stake Amount */}
            {wallet.connected && (
              <div className="flex flex-col gap-3">
                <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
                  Stake Amount (A0GI) — min 0.01
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={stakeAmount}
                  onChange={e => setStakeAmount(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-neon-blue/50 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                />
                {wallet.balance && (
                  <p className="text-xs text-gray-500">Wallet balance: <span className="text-neon-blue">{wallet.balance} A0GI</span></p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4 p-6 rounded-xl border border-white/10 bg-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-neon-purple shadow-[0_0_10px_rgba(138,43,226,0.6)] rounded-full" />
                  Simulated Patient Records
                </label>
                <span className="text-neon-blue font-mono font-bold">{(datasetSize / 1000).toFixed(0)}k</span>
              </div>
              <input
                type="range" min="5000" max="500000" step="5000"
                value={datasetSize}
                onChange={e => setDatasetSize(Number(e.target.value))}
                className="w-full accent-neon-blue cursor-pointer"
              />
            </div>

            {/* Decision Policy */}
            <div className="flex flex-col gap-5 p-6 rounded-xl border border-neon-purple/30 bg-neon-purple/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-2 mb-1">
                <SlidersHorizontal className="w-4 h-4 text-neon-purple" />
                <span className="text-sm font-bold text-white tracking-wide">Autonomous Decision Policy</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 uppercase tracking-widest font-bold">Accept threshold</span>
                  <span className="text-status-success font-mono font-bold">+{acceptThreshold.toFixed(1)}% ({Math.round(acceptThreshold * 100)} bps)</span>
                </div>
                <input
                  type="range" min="0.1" max="3.0" step="0.1"
                  value={acceptThreshold}
                  onChange={e => setAcceptThreshold(Number(e.target.value))}
                  className="w-full accent-green-400 cursor-pointer"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 uppercase tracking-widest font-bold">Retrain threshold</span>
                  <span className="text-status-warning font-mono font-bold">{retrainThreshold.toFixed(1)}% ({Math.round(Math.abs(retrainThreshold) * 100)} bps)</span>
                </div>
                <input
                  type="range" min="-5.0" max="0" step="0.1"
                  value={retrainThreshold}
                  onChange={e => setRetrainThreshold(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Thresholds stored on-chain in basis points.
                ACCEPT ≥ +{acceptThreshold.toFixed(2)}% | Below {retrainThreshold.toFixed(2)}% → REJECT + governance flag
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="submit"
              disabled={isDeploying || !hospitalName.trim()}
              className="w-full relative overflow-hidden group bg-white/10 border border-white/20 backdrop-blur-md text-white py-4 rounded-xl font-bold tracking-widest hover:bg-white/20 hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:grayscale disabled:hover:translate-y-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(0,240,255,0.1)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_30px_rgba(0,240,255,0.3)] hover:border-neon-blue/50"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {isDeploying ? <Zap className="w-5 h-5 animate-pulse text-neon-blue" /> : <Shield className="w-5 h-5 text-neon-purple" />}
                {isDeploying ? 'INITIALIZING...' : 'REGISTER ON 0G CHAIN'}
              </span>
            </button>

            {deployedTxHash && (
              <a
                href={`${EXPLORER_URL}/tx/${deployedTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs text-neon-blue hover:text-white transition-colors py-2"
              >
                <ExternalLink className="w-3 h-3" />
                View TX on 0G Galileo Explorer
              </a>
            )}
          </div>
        </form>}
      </div>

      {/* Terminal Side */}
      <div className="w-1/2 rounded-3xl bg-black/60 backdrop-blur-2xl border border-white/10 overflow-hidden flex flex-col shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,0,0,0.5)] relative">
        <div className="h-12 border-b border-white/10 bg-white/5 flex items-center px-6 gap-3 shrink-0">
          <Terminal className="w-4 h-4 text-neon-blue" />
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">node-deployment.log</span>
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRealDeployment ? 'bg-status-success shadow-[0_0_8px_rgba(0,255,150,0.8)]' : wallet.connected ? 'bg-amber-400' : 'bg-gray-600'}`} />
            <span className="text-[10px] font-mono text-gray-500">{isRealDeployment ? '0G GALILEO LIVE' : wallet.connected ? 'WRONG CHAIN' : 'WALLET NOT CONNECTED'}</span>
          </div>
        </div>
        <div className="p-8 font-mono text-[13px] leading-relaxed overflow-y-auto flex-1 flex flex-col gap-3">
          {logs.map((log, i) => (
            <div key={i} className={`
              ${log.includes('SUCCESS') || log.includes('[OK]') ? 'text-status-success'
               : log.includes('TX') || log.includes('Agent ID') || log.includes('Explorer') ? 'text-neon-blue'
               : log.includes('MRENCLAVE') ? 'text-neon-purple'
               : log.includes('Decision Policy') ? 'text-status-warning'
               : log.includes('❌') || log.includes('Error') ? 'text-red-400'
               : log.includes('⚠️') ? 'text-amber-400'
               : log.includes('ℹ️') ? 'text-gray-400'
               : log.includes('────') ? 'text-white/20'
               : 'text-gray-400'}
            `}>
              {log}
            </div>
          ))}
          {isDeploying && (
            <div className="text-neon-blue flex items-center gap-2 mt-4">
              <span className="w-2.5 h-5 bg-neon-blue shadow-[0_0_10px_rgba(0,240,255,0.8)] animate-pulse inline-block" />
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
