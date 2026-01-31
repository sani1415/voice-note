# Build Swarolipi AI as Android APK (Capacitor)

Your web app is wrapped in a native Android shell. **No URL bar** — it runs like a normal app. Your existing code is unchanged; Capacitor only adds config and an `android` folder.

---

## Prerequisites

1. **Node.js** (you already have this)
2. **Android Studio** — [Download](https://developer.android.com/studio) and install. During setup, install:
   - Android SDK
   - Android SDK Platform (e.g. API 34)
   - Android Virtual Device (optional, for emulator)

3. **Java 17** — Android Studio usually installs it. Check: `java -version`

---

## Step 1: Install dependencies

In the project folder (where `package.json` is):

```bash
npm install
```

This installs `@capacitor/core` and `@capacitor/cli` (and the rest of your app).

---

## Step 2: Add the Android platform (once)

```bash
npx cap add android
```

This creates the `android` folder and adds the native Android project. You only run this once per machine.  
*(If the `android` folder already exists, skip this step.)*

---

## Step 3: Build the web app and sync to Android

Every time you change your web code and want to update the APK:

```bash
npm run build:android
```

This runs:

1. `vite build` — builds your app into `dist/`
2. `npx cap sync android` — copies `dist/` into the Android project and updates native config

---

## Step 4: Open in Android Studio

```bash
npm run open:android
```

This opens the `android` project in Android Studio.

---

## Step 5: Build APK in Android Studio

1. Wait for Android Studio to finish indexing/sync.
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. When it finishes, click **Locate** in the notification to open the folder with the `.apk` file.
4. Copy the APK to your phone (or use an emulator) and install.

**To run on a connected phone or emulator:**  
Click the green **Run** button (or **Run → Run 'app'**). Pick your device.

---

## Quick reference

| What you want              | Command                 |
|----------------------------|-------------------------|
| First-time setup           | `npm install` then `npx cap add android` |
| After changing web code    | `npm run build:android` |
| Open Android project       | `npm run open:android`  |
| Build APK                  | In Android Studio: Build → Build APK(s) |

---

## Microphone (recording)

The app needs **microphone permission** to record voice notes. When you **first open the app**, Android should show a permission dialog — tap **Allow**. (The app requests this at startup so the recording feature works reliably in the WebView.)

If you see "Microphone access denied or error occurred":

1. **First time:** Make sure you tapped **Allow** when Android asked for microphone access when you opened the app.
2. **If you previously denied:** Open **Settings → Apps → Swarolipi AI → Permissions** and turn **Microphone** on.
3. **If it still fails after an update:** Uninstall the app completely, then install the new APK again. Open the app, allow microphone when prompted, then try recording.
4. Rebuild and reinstall the APK after any native change (manifest or MainActivity), then try again.

---

## Load from URL (web updates, same native feel)

To have the app **load from your deployed website** so users get updates when you deploy (no APK reinstall), **without** showing a URL bar or changing the native feel:

**Quick guide (Swarolipi deployed at [swarolipi-ai-lemon.vercel.app](https://swarolipi-ai-lemon.vercel.app/)):**

1. **Build and sync with your URL** — in the project folder, run **one** of these (use your terminal, not VS Code’s Run button):

   **Windows (PowerShell):**
   ```powershell
   $env:CAPACITOR_SERVER_URL="https://swarolipi-ai-lemon.vercel.app"; npm run build:android
   ```

   **macOS / Linux / Git Bash:**
   ```bash
   CAPACITOR_SERVER_URL=https://swarolipi-ai-lemon.vercel.app npm run build:android
   ```

   This builds the web app, then syncs to Android with the URL baked in. The APK will load from this URL when opened.

2. **Open Android Studio:**  
   `npm run open:android`

3. **Build APK:**  
   In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. When done, use **Locate** to find the `.apk`.

4. **Install on your phone** (copy the APK and install, or run from Android Studio with the device connected).

5. **Open the app** — it will load [https://swarolipi-ai-lemon.vercel.app](https://swarolipi-ai-lemon.vercel.app/) in a full-screen WebView (no URL bar). When you deploy changes to Vercel, users get them on next app open.

---

**Generic steps (any URL):**

1. **Deploy your web app** somewhere (e.g. Vercel, Netlify) so you have a URL like `https://your-app.vercel.app`.
2. **Set the URL when building/syncing** so Capacitor uses it:
   - **Windows (PowerShell):**  
     `$env:CAPACITOR_SERVER_URL="https://your-app.vercel.app"; npm run build:android`
   - **macOS/Linux or Git Bash:**  
     `CAPACITOR_SERVER_URL=https://your-app.vercel.app npm run build:android`
3. **Build the APK** in Android Studio as usual.

The app will open and load your site in a **full-screen WebView** — no URL bar, same native look. When you update the website and users open the app again, they get the new version. The app needs internet to load; if you need offline support, use the in-app update (LIVE_UPDATE) instead.

To **switch back to local bundle** (load from files inside the APK), run `npm run build:android` **without** setting `CAPACITOR_SERVER_URL`, then rebuild the APK.

---

## In-app update (no reinstall)

You can show an **"Update available"** message and update the **local bundle** without reinstalling the APK. See **[LIVE_UPDATE.md](./LIVE_UPDATE.md)** for:

- Setting `VITE_UPDATE_MANIFEST_URL` and hosting a `version.json` + bundle zip
- How the app checks for updates and shows the dialog
- When you still need a new APK (native/permission changes)

---

## Notes

- **No URL bar** — Capacitor loads your app from local files inside the app; it’s not showing a browser URL.
- **Your code** — Only new files were added: `capacitor.config.ts`, `android/`, and npm scripts. Your app logic is unchanged.
- **Environment variables** — For production (e.g. Gemini, Supabase), use a proper release build and keys (e.g. in Android Studio or env config); the same `.env` approach can be used when building the web bundle that Capacitor packs.

If any step fails, share the exact command and the error message.
