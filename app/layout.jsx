import './globals.css';

export const metadata = {
  title: 'GAHANGA House Construction Dashboard',
  description: 'Track your construction finances and spending',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

