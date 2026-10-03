import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NightAmbientController } from '@/components/NightAmbientController';
import { AutoRefresh } from '@/components/AutoRefresh';
import { RevisionWatcher } from '@/components/RevisionWatcher';
import { getRevision } from '@/lib/db';
import './globals.css';

export const metadata: Metadata = {
  title: 'Papan Wonosalam',
  description: 'Papan informasi 24 jam di Wonosalam Boarding School.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <NightAmbientController />
        <AutoRefresh />
        <RevisionWatcher initialRevision={getRevision()} />
        {children}
      </body>
    </html>
  );
}
