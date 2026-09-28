import './globals.css';
import { Bricolage_Grotesque } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
const font = Bricolage_Grotesque({ subsets: ['latin'] });
export const metadata: Metadata = { title: 'Aura Calculator' };
export const viewport: Viewport = { themeColor: '#0B0B0F' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className={font.className}>{children}</body></html>);
}
