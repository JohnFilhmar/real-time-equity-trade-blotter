import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Providers } from './providers';
import { theme_storage_key } from '@/providers/theme_provider';
import './globals.css';

const plex_sans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const plex_mono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Fusion Blotter',
  description: 'Real-time equity trade blotter',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#060A12' },
    { media: '(prefers-color-scheme: light)', color: '#E8EDF4' },
  ],
};

// Runs before first paint so a stored theme choice never flashes the other theme. Reads the same
// key the theme provider writes; anything unexpected in storage leaves the OS preference in charge.
const theme_boot_script = `(function(){try{var m=localStorage.getItem(${JSON.stringify(theme_storage_key)});if(m==='dark'||m==='light'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plex_sans.variable} ${plex_mono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme_boot_script }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
