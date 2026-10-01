import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NightAmbientController } from '@/components/NightAmbientController';
import { AutoRefresh } from '@/components/AutoRefresh';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clock2',
  description: 'Digital mosque display built with Next.js, React, Three.js, and SQLite.',
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
