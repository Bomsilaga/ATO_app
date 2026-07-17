import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "ATO Triage — tax categorisation, done properly",
  description: "Text or file in, categorised ATO labels out. Nothing assumed.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ATO Triage" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" }
};

export const viewport: Viewport = {
  themeColor: "#1a4731"
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
      <body className="bg-paper text-ink font-sans antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
