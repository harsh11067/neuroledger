/**
 * Wallet Connection — MetaMask only, 0G Galileo Testnet
 * No simulated fallback. Real wallet or not connected.
 */

import { CHAIN_ID, RPC_URL, EXPLORER_URL } from './contract';

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: string | null;
  chainId: number | null;
  isCorrectChain: boolean;
}

const INITIAL_STATE: WalletState = {
  connected: false,
  address: null,
  balance: null,
  chainId: null,
  isCorrectChain: false,
};

let walletState: WalletState = INITIAL_STATE;
const walletListeners = new Set<() => void>();

function setWalletState(next: WalletState) {
  walletState = next;
  walletListeners.forEach(listener => listener());
}

export function getWalletSnapshot(): WalletState {
  return walletState;
}

export function subscribeWallet(listener: () => void) {
  walletListeners.add(listener);
  return () => walletListeners.delete(listener);
}

const OG_CHAIN_CONFIG = {
  chainId: `0x${CHAIN_ID.toString(16)}`,
  chainName: '0G Galileo Testnet',
  nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function connectWallet(): Promise<WalletState> {
  if (typeof window === 'undefined') return INITIAL_STATE;

  const ethereum = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on: (event: string, handler: (...args: unknown[]) => void) => void } }).ethereum;
  if (!ethereum) {
    alert('MetaMask not found. Please install MetaMask from https://metamask.io to connect.');
    return INITIAL_STATE;
  }

  try {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    if (!accounts || accounts.length === 0) return INITIAL_STATE;

    const chainIdHex = await ethereum.request({ method: 'eth_chainId' }) as string;
    const chainId = parseInt(chainIdHex, 16);

    let balance = '0.0000';
    try {
      const rawBalance = await ethereum.request({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest'],
      }) as string;
      balance = (parseInt(rawBalance, 16) / 1e18).toFixed(4);
    } catch {
      balance = '0.0000';
    }

    const connected: WalletState = {
      connected: true,
      address: accounts[0],
      balance,
      chainId,
      isCorrectChain: chainId === CHAIN_ID,
    };
    setWalletState(connected);

    // If on wrong chain, offer to switch
    if (chainId !== CHAIN_ID) {
      await switchToOGChain();
    }

    // Listen for account/chain changes
    ethereum.on('accountsChanged', (accs: unknown) => {
      const accounts = accs as string[];
      if (!accounts.length) {
        setWalletState(INITIAL_STATE);
      } else {
        setWalletState({ ...walletState, address: accounts[0] });
      }
    });
    ethereum.on('chainChanged', () => {
      window.location.reload();
    });

    return connected;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('user rejected') || message.includes('User rejected')) {
      return INITIAL_STATE;
    }
    console.error('Wallet connect error:', message);
    return INITIAL_STATE;
  }
}

export async function switchToOGChain(): Promise<boolean> {
  const ethereum = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!ethereum) return false;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: OG_CHAIN_CONFIG.chainId }],
    });
    return true;
  } catch (switchError: unknown) {
    const err = switchError as { code?: number };
    if (err.code === 4902) {
      try {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [OG_CHAIN_CONFIG],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function disconnectWallet(): WalletState {
  setWalletState(INITIAL_STATE);
  return INITIAL_STATE;
}
