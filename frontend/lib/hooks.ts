'use client';

import { useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { getSimulationEngine } from './simulation';
import type { SimAgent, RoundResult, SimEvent, StorageArtifact, RoundPhase } from './simulation';
import { connectWallet, disconnectWallet, getWalletSnapshot, subscribeWallet, truncateAddress, type WalletState } from './wallet';

// ── Simulation State Hook ──
// Uses a version counter to produce stable snapshots for useSyncExternalStore
export function useSimulation() {
  const engine = getSimulationEngine();
  const versionRef = useRef(0);
  const makeSnap = useCallback(() => ({
    agents: [...engine.agents],
    rounds: [...engine.rounds],
    currentRound: engine.currentRound,
    globalAccuracy: engine.globalAccuracy,
    events: [...engine.events],
    storageArtifacts: [...engine.storageArtifacts],
  }), [engine]);
  const cacheRef = useRef<ReturnType<typeof makeSnap> | null>(null);

  const subscribe = useCallback((cb: () => void) => {
    return engine.subscribe(() => {
      versionRef.current++;
      cacheRef.current = null; // invalidate cache
      cb();
    });
  }, [engine]);

  const getSnapshot = useCallback(() => {
    if (!cacheRef.current) {
      cacheRef.current = makeSnap();
    }
    return cacheRef.current;
  }, [makeSnap]);

  const getServerSnapshot = useCallback(() => ({
    agents: [] as SimAgent[],
    rounds: [] as RoundResult[],
    currentRound: 0,
    globalAccuracy: 45,
    events: [] as SimEvent[],
    storageArtifacts: [] as StorageArtifact[],
  }), []);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...snap, engine };
}

const WALLET_SERVER_SNAPSHOT: WalletState = { connected: false, address: null, balance: null, chainId: null, isCorrectChain: false };

// ── Wallet Hook ──
export function useWallet() {
  const wallet = useSyncExternalStore(
    subscribeWallet,
    getWalletSnapshot,
    () => WALLET_SERVER_SNAPSHOT
  );

  const connect = useCallback(async () => {
    await connectWallet();
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
  }, []);

  return { wallet, connect, disconnect, truncateAddress };
}

// ── Training Round Hook ──
export function useTrainingRound() {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<RoundPhase>('IDLE');
  const [progress, setProgress] = useState(0);
  const [latestResult, setLatestResult] = useState<RoundResult | null>(null);
  const engine = getSimulationEngine();

  const startRound = useCallback(async () => {
    if (isRunning || engine.agents.length === 0) return;
    setIsRunning(true);
    setPhase('IDLE');
    setProgress(0);
    try {
      const result = await engine.runRound((p, prog) => {
        setPhase(p);
        setProgress(prog);
      });
      setLatestResult(result);
    } catch (e) {
      console.error('Round failed:', e);
    }
    setIsRunning(false);
  }, [isRunning, engine]);

  return { isRunning, phase, progress, latestResult, startRound };
}
