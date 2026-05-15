'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { GlobalNetworkView } from '@/components/GlobalNetworkView';
import { NodeDeploymentPanel } from '@/components/NodeDeploymentPanel';
import { TrainingSimulator } from '@/components/TrainingSimulator';
import { AttestationPanel } from '@/components/AttestationPanel';
import { ArtifactLedger } from '@/components/ArtifactLedger';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X } from 'lucide-react';
import Script from 'next/script';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'spline-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        url?: string;
        'events-target'?: string;
        'loading-anim-type'?: string;
      }, HTMLElement>;
    }
  }
}

export default function Home() {
  const [activePanel, setActivePanel] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [splineLoaded, setSplineLoaded] = useState(false);

  const renderPanel = () => {
    switch (activePanel) {
      case 0:
        return <GlobalNetworkView onDeployClick={() => setActivePanel(1)} />;
      case 1:
        return <NodeDeploymentPanel />;
      case 2:
        return <TrainingSimulator />;
      case 3:
        return <AttestationPanel />;
      case 4:
        return <ArtifactLedger />;
      default:
        return <GlobalNetworkView />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0d1117] text-gray-300 relative">
      {/* Spline viewer script */}
      <Script
        type="module"
        src="https://unpkg.com/@splinetool/viewer@1.12.92/build/spline-viewer.js"
        strategy="lazyOnload"
        onLoad={() => setSplineLoaded(true)}
      />

      {/* Full Screen Spline Background — only on Dashboard */}
      {activePanel === 0 && (
        <div className="fixed inset-0 z-0" style={{ pointerEvents: 'auto' }}>
          {splineLoaded && (
            <spline-viewer
              url="https://prod.spline.design/29aRMJl5v08tfoii/scene.splinecode"
              events-target="global"
              loading-anim-type="none"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          )}
          {/* Subtle gradient overlay for text readability — only at edges */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#0d1117]/40 via-transparent to-[#0d1117]/60" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#0d1117]/50 via-transparent to-transparent" />
        </div>
      )}

      {/* Floating Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed top-0 left-0 h-full w-64 z-40"
          >
            <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:border-white/30 transition-all duration-300"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      
      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col relative z-10 w-full h-full overflow-y-auto transition-all duration-500 ease-in-out ${isSidebarOpen ? 'pl-64' : 'pl-0'}`}
      >
         <main className="flex-1 min-h-full">
            <AnimatePresence mode="wait">
               <motion.div
                 key={activePanel}
                 initial={{ opacity: 0, y: 15 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -15 }}
                 transition={{ duration: 0.4 }}
                 className="min-h-full w-full"
               >
                 {renderPanel()}
               </motion.div>
            </AnimatePresence>
         </main>
      </div>
    </div>
  );
}
