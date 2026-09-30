import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import './globals.css';

const instrument = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'SupportOps', template: '%s · SupportOps' },
  description: 'AI support assistant for customers, invoices, tickets and refunds',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}