import './globals.css';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';

const display_font = Fraunces({ subsets: ['latin'], variable: '--font-display' });
const ui_font = Geist({ subsets: ['latin'], variable: '--font-ui' });
const mono_font = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata = {
  title: 'GAHANGA House Construction Dashboard',
  description: 'Track your construction finances and spending',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display_font.variable} ${ui_font.variable} ${mono_font.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
