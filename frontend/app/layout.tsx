import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NeuroLedger Dashboard',
  description: 'Decentralized federated learning network for medical AI',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head />

      <body className="bg-bg-base text-text-main font-sans overflow-hidden antialiased flex flex-col h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
