"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing (old browser, private mode) just means no
        // install prompt / offline shell — the app itself works regardless.
      });
    }
  }, []);
  return null;
}
