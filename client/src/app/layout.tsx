import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { THEME_INIT_SCRIPT } from '@/components/theme/theme-script';
import './globals.css';

const instrument = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Enterprise SupportOps', template: '%s · Enterprise SupportOps' },
  description: 'AI support assistant for customers, invoices, tickets and refunds',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}