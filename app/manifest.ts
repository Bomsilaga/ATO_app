import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest — this plus the icons and service worker
// is what makes Android offer "Install app" (and what a TWA/PWABuilder
// wrapper packages into an APK).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATO Triage — deductions & tax filing",
    short_name: "ATO Triage",
    description:
      "Track deductions as they happen, upload receipts and statements, and generate a label-mapped ATO pre-fill with a live tax estimate.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f1e8",
    theme_color: "#1a4731",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
