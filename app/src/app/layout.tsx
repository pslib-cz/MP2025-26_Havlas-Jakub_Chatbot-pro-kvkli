import './globals.css';
import ApolloWrapper from './providers/ApolloWrapper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chatbot KVKLI',
  robots: { index: false, follow: false, noarchive: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <ApolloWrapper>
          {children}
        </ApolloWrapper>
      </body>
    </html>
  );
}
