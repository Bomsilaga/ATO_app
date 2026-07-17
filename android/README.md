# Android app (Trusted Web Activity)

The Android APK is a TWA wrapper around the deployed site
(https://ato-app-three.vercel.app), built with Bubblewrap from
`twa-manifest.json` in this folder.

To rebuild (e.g. after bumping the version):

```bash
npm i -g @bubblewrap/cli
# put android.keystore (NOT in this repo — keep it private) next to twa-manifest.json
bubblewrap update --skipVersionUpgrade
BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=... bubblewrap build
```

The signing keystore must stay OUT of this public repo. Losing it means you
can never ship an update under the same package id
(au.com.bomsilaga.atotriage) — keep a backup. Its certificate fingerprint is
pinned in `public/.well-known/assetlinks.json`, which is what lets the
installed app run full-screen without a browser bar.
