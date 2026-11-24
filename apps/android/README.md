# Android NFC terminal

Open this folder in Android Studio, change `TERMINAL_URL` in `app/build.gradle.kts` to the fixed LAN address of the event server, and build the signed APK. Reader mode reads the Android `Tag.id` bytes and passes the normalized uppercase UID into the loaded React terminal through `window.onNfcUid(uid)`.

The manifest permits HTTP only because this is intended for a dedicated, isolated event LAN. Before deployment, prefer local HTTPS with a managed certificate or restrict the network policy to the exact server host. Never expose this WebView or API to a guest Wi-Fi.
