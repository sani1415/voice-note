<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ymxMJTl0YklTHUDWPnYQtwInnRUD5Zp7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Environment variables

Create a file named `.env.local` in the project root and add:

```bash
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Supabase (for future cloud sync / auth)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key_here
```

## Deploy to Vercel (frontend only)

1. Push this project to a GitHub repository.
2. In Vercel, click **New Project** and import the repo.
3. When asked for build settings:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In the **Environment Variables** section, add:
   - `GEMINI_API_KEY` = your Gemini API key
5. Deploy. After deployment, open the Vercel URL in your browser.

Notes are still stored locally in your browser (`localStorage`) and can be backed up with the built‑in JSON export/import in the sidebar.

## Supabase (optional)

If you want login and cloud‑synced notes:

1. Create a project on [Supabase](https://supabase.com/).
2. In Supabase:
   - Go to **SQL** → **New Query**.
   - Paste the contents of `supabase-schema.sql` from this repo.
   - Run the migration to create `users` and `notes` tables with row‑level security.
3. In Supabase **Project Settings → API**, copy:
   - `Project URL` → use as `VITE_SUPABASE_URL`
   - `anon` public key → use as `VITE_SUPABASE_ANON_KEY`
4. Set these in `.env.local` (and in Vercel as env vars if you later integrate Supabase fully in the app).

The file `supabaseClient.ts` is ready to create a Supabase client using these env vars. The current app still works fully with localStorage even if Supabase is not configured.

### Copy/paste template (fill in your values)

Do **not** commit real keys to GitHub. Paste into `.env.local` (local) and Vercel Env Vars (deployment).

```bash
# Supabase (public project credentials for the browser)
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```
