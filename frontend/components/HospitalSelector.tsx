'use client';

import { useState } from 'react';
import { clsx } from 'clsx';

export interface HospitalOption {
  name: string;
  address: string;
  disease: string;
  dataset: string;
  samples: number;
  hasData: boolean;        // UCI registry entry OR uploaded CSV
  hasUploadedCSV: boolean;
}

// Static fallback — used when chain query hasn't resolved yet
export const STATIC_HOSPITALS: HospitalOption[] = [
  { name: 'manipal',  address: '', disease: 'Cardiovascular Disease', dataset: 'UCI Heart',   samples: 297, hasData: true,  hasUploadedCSV: false },
  { name: 'srenivas', address: '', disease: 'Type 2 Diabetes',         dataset: 'Pima',        samples: 768, hasData: true,  hasUploadedCSV: false },
  { name: 'dfl',      address: '', disease: 'Breast Cancer',           dataset: 'Wisconsin',   samples: 569, hasData: true,  hasUploadedCSV: false },
  { name: 'rusty',    address: '', disease: 'Chronic Kidney Disease',  dataset: 'UCI Kidney',  samples: 400, hasData: true,  hasUploadedCSV: false },
];

export function HospitalSelector({
  hospitals,
  onChange,
  onWalletsChange,
}: {
  hospitals?: HospitalOption[];
  onChange: (selected: string[]) => void;
  onWalletsChange?: (wallets: string[]) => void;
}) {
  const list = hospitals && hospitals.length > 0 ? hospitals : STATIC_HOSPITALS;

  const defaultSelected = new Set(
    list.filter(h => h.hasData).slice(0, 3).map(h => h.name)
  );
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  function toggle(h: HospitalOption) {
    if (!h.hasData) return; // can't select hospitals with no data
    const next = new Set(selected);
    if (next.has(h.name)) {
      if (next.size <= 2) return; // enforce minimum 2
      next.delete(h.name);
    } else {
      next.add(h.name);
    }
    setSelected(next);
    const selectedNames = Array.from(next);
    onChange(selectedNames);
    if (onWalletsChange) {
      const wallets = selectedNames.map(n => list.find(h => h.name === n)?.address ?? '');
      onWalletsChange(wallets);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
          Participating Hospitals
        </span>
        <span className="text-xs text-gray-500">{selected.size} selected (min 2)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.map(h => {
          const active = selected.has(h.name);
          const canSelect = h.hasData;
          return (
            <button
              key={h.name}
              type="button"
              onClick={() => toggle(h)}
              title={!canSelect ? 'Upload patient data in Node Network to participate' : undefined}
              className={clsx(
                'flex flex-col gap-1 p-4 rounded-xl border text-left transition-all duration-200',
                active
                  ? 'bg-neon-blue/10 border-neon-blue/40 shadow-[inset_0_1px_0_rgba(0,240,255,0.2)]'
                  : canSelect
                    ? 'bg-black/30 border-white/10 hover:border-white/20 opacity-60 hover:opacity-80'
                    : 'bg-black/20 border-white/5 opacity-30 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-2">
                <div className={clsx('w-2 h-2 rounded-full shrink-0',
                  active ? 'bg-neon-blue shadow-[0_0_6px_rgba(0,240,255,0.8)]' :
                  h.hasUploadedCSV ? 'bg-status-success shadow-[0_0_6px_rgba(0,255,150,0.8)]' :
                  canSelect ? 'bg-gray-500' : 'bg-gray-700'
                )} />
                <span className="text-sm font-bold text-white truncate">{h.name}</span>
                {h.hasUploadedCSV && (
                  <span className="text-[9px] font-bold text-status-success border border-status-success/40 px-1 py-0.5 rounded uppercase tracking-wider">CSV</span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">{h.disease}</span>
              <span className="text-[10px] text-gray-600 truncate">
                {canSelect ? `${h.dataset} · ${h.samples} records` : 'Upload CSV to participate'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
