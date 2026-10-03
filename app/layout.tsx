import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NightAmbientController } from '@/components/NightAmbientController';
import { AutoRefresh } from '@/components/AutoRefresh';
import './globals.css';

export const metadata: Metadata = {
  title: 'Papan Wonosalam',
  description: 'Papan informasi 24 jam di Wonosalam Boarding School.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <NightAmbientController />
        <AutoRefresh />
        {children}
      </body>
    </html>
  );
}
