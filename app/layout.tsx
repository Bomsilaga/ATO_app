import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATO Triage — tax categorisation, done properly",
  description: "Text or file in, categorised ATO labels out. Nothing assumed."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
