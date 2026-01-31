# In-app update (OTA) — update without reinstalling the APK

The app can show an **"আপডেট উপলব্ধ"** (Update available) message and, when the user taps **আপডেট করুন**, download the new web bundle and apply it. The **local bundle** is updated; users do **not** need to reinstall the APK.

---

## How it works

1. You host a **manifest URL** that returns JSON: `{ "version": "1.0.1", "url": "https://yourserver.com/bundles/1.0.1.zip" }`.
2. You host the **bundle zip**: the contents of your `dist/` folder (after `npm run build`) zipped so that `index.html` is at the root.
3. When the app loads (and the user is signed in), it fetches the manifest and compares `version` with the current bundle version.
4. If the server version is **newer**, the app shows the update dialog.
5. When the user taps **আপডেট করুন**, the app downloads the zip, sets it as the next bundle, and reloads. After reload, the app runs the new bundle.

---

## Setup

### 1. Set the manifest URL

Create a `.env.local` (or set in your build/deploy) with:

```env
VITE_UPDATE_MANIFEST_URL=https://yourserver.com/updates/version.json
```

Rebuild the web app and sync to Android so the APK contains this URL:

```bash
npm run build:android
```

### 2. Host the manifest

On your server (or Vercel/Netlify/any static host), serve a file at that URL. Example `version.json`:

```json
{
  "version": "1.0.1",
  "url": "https://yourserver.com/bundles/1.0.1.zip"
}
```

- **version**: string that is **greater** than the current app/bundle version (e.g. `1.0.1` > `1.0.0`). The app compares by splitting on `.` and comparing numbers.
- **url**: full URL to a **ZIP file** of your web app bundle (see below).

### 3. Build and host the bundle ZIP

After building the web app:

```bash
npm run build
```

Create a zip of the **contents** of `dist/` (not the `dist` folder itself). The zip must have `index.html` at the root.

**Windows (PowerShell):**
```powershell
cd dist
Compress-Archive -Path * -DestinationPath ../bundle-1.0.1.zip
cd ..
```

**macOS/Linux:**
```bash
cd dist && zip -r ../bundle-1.0.1.zip . && cd ..
```

Upload `bundle-1.0.1.zip` to your server so it is available at the `url` in `version.json` (e.g. `https://yourserver.com/bundles/1.0.1.zip`).

### 4. When you release a new version

1. Bump the version (e.g. in `version.json` and the zip filename).
2. Run `npm run build`.
3. Zip the contents of `dist/` as above (e.g. `bundle-1.0.2.zip`).
4. Update `version.json` to the new version and new zip URL.
5. Upload the new zip and the updated `version.json`.

Users who already have the app will see **আপডেট উপলব্ধ** on next open; when they tap **আপডেট করুন**, the local bundle will update without reinstalling the APK.

---

## When a new APK is still required

You must ship a **new APK** (and users must install/update from the store) when you change:

- Native code (e.g. `MainActivity`, `AndroidManifest.xml`)
- Permissions (e.g. new `<uses-permission>`)
- New Capacitor or native plugins
- `appId` or store-related config

Only **web** changes (HTML, CSS, JS) can be delivered via this in-app update.

---

## Using GitHub for updates

Yes — you can use **GitHub** so that when you push updates and build in Android Studio, users get the "update available" message and download the new bundle from GitHub.

### How it works with GitHub

1. **Manifest** — Put `version.json` in your repo (e.g. `updates/version.json`) and push. The app will fetch it from a **raw** or **CDN** URL (see below).
2. **Bundle zip** — Use **GitHub Releases**: create a release, attach the zip of your `dist/` contents. GitHub gives a stable download URL for that file.
3. **Manifest URL** — Point `VITE_UPDATE_MANIFEST_URL` to your `version.json` on GitHub (raw or jsDelivr; jsDelivr is often more reliable from the app).

### Step-by-step (GitHub)

**1. Create the updates folder and manifest in the repo**

Create a file `updates/version.json` in your project (see the sample in this repo). Example:

```json
{
  "version": "1.0.0",
  "url": "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.0/bundle.zip"
}
```

Commit and push `updates/version.json`.

**2. Set the manifest URL in the app**

Use **jsDelivr** (adds CORS and works well from the app):

```env
VITE_UPDATE_MANIFEST_URL=https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO/updates/version.json
```

Or GitHub raw (replace `main` with your default branch if different):

```env
VITE_UPDATE_MANIFEST_URL=https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/updates/version.json
```

Put this in `.env.local`, then run `npm run build:android` and build the APK in Android Studio. The APK will contain this URL.

**3. When you release a new version**

1. Update your app and build the web bundle: `npm run build`.
2. Zip the **contents** of `dist/` (so `index.html` is at the root). Name it e.g. `bundle.zip`.
3. In GitHub: **Releases → Create a new release**. Tag e.g. `v1.0.1`, upload `bundle.zip` as an asset.
4. Copy the zip’s download URL (e.g. `https://github.com/USER/REPO/releases/download/v1.0.1/bundle.zip`).
5. Update `updates/version.json` in the repo:
   ```json
   {
     "version": "1.0.1",
     "url": "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.1/bundle.zip"
   }
   ```
6. Commit and push the updated `version.json`.
7. (Optional) Build a new APK in Android Studio if you changed native code; otherwise users on the old APK will still get the **আপডেট উপলব্ধ** message and update the **web bundle** without reinstalling.

**4. User experience**

- Users open the app → app fetches `version.json` from GitHub (via jsDelivr or raw).
- If `version` in the file is **newer** than the one in the app → app shows **আপডেট উপলব্ধ**.
- User taps **আপডেট করুন** → app downloads the zip from the GitHub Release URL and applies it → local bundle is updated, no reinstall.

### Notes for GitHub

- **Releases** are the right place for the zip: stable URLs and good for larger files.
- **jsDelivr** (`cdn.jsdelivr.net/gh/...`) is recommended for `version.json` so the WebView can fetch it without CORS issues.
- Do **not** commit the zip into the repo; use Releases so the repo stays small and the download URL is stable.

---

## Optional: Vercel/Netlify

You can host both the app and the update manifest + bundle on the same project:

- Deploy the app as usual (e.g. `dist/` as the site root).
- Add a route or static file for `version.json` (e.g. in `public/updates/version.json`).
- For the bundle zip: either generate it in a build step and upload to a storage (e.g. Vercel Blob, S3), or use a separate “releases” folder that you update manually and point `url` to that file.

If you use a single static host, you can put `version.json` and `bundles/1.0.1.zip` in a folder (e.g. `public/updates/`) and set:

```env
VITE_UPDATE_MANIFEST_URL=https://your-app.vercel.app/updates/version.json
```

---

## Summary

| Step | What you do |
|------|-------------|
| 1 | Set `VITE_UPDATE_MANIFEST_URL` and rebuild/sync the APK. |
| 2 | Host `version.json` with `version` and `url` to the zip (e.g. in the repo + GitHub Releases for the zip). |
| 3 | Build the app, zip `dist/` contents, upload the zip (e.g. as a Release asset). |
| 4 | On new releases, bump version, build, zip, create/update Release, update `version.json` and push. |

Users get an in-app message to update, and the **local bundle** is updated without reinstalling the APK.

**Using GitHub:** Put `updates/version.json` in the repo (see the sample in this project), use GitHub Releases for the bundle zip, and set `VITE_UPDATE_MANIFEST_URL` to the jsDelivr URL of `version.json` (see **Using GitHub for updates** above).
