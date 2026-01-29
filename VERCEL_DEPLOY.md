# Deploy to Vercel - Step by Step Guide

## Prerequisites ✅
- ✅ GitHub repository is set up
- ✅ Code is pushed to GitHub
- ✅ Supabase database is configured (you ran the SQL)

## Step 1: Install Supabase Package Locally

First, make sure you have the Supabase package installed:

```bash
cd "D:\মাওলানা হাসিব\swarolipi-ai-(স্বরলিপি)"
npm install
```

This will install `@supabase/supabase-js` which is needed for cloud sync.

## Step 2: Create Vercel Account & Import Project

1. Go to **https://vercel.com** and sign up/login (you can use your GitHub account for easy connection)

2. Click **"Add New..."** → **"Project"**

3. Click **"Import Git Repository"** and select your `swarolipi-ai` repository

4. Vercel will auto-detect it's a Vite project. Verify these settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build` (should be auto-filled)
   - **Output Directory**: `dist` (should be auto-filled)
   - **Install Command**: `npm install` (should be auto-filled)

## Step 3: Add Environment Variables

**This is critical!** Click **"Environment Variables"** and add these three:

1. **GEMINI_API_KEY**
   - Value: Your Gemini API key from `.env.local`
   - Environment: Production, Preview, Development (check all three)

2. **VITE_SUPABASE_URL**
   - Value: Your Supabase project URL (e.g., `https://vjylaecljxxdjandofau.supabase.co`)
   - Environment: Production, Preview, Development (check all three)

3. **VITE_SUPABASE_ANON_KEY**
   - Value: Your Supabase anon key
   - Environment: Production, Preview, Development (check all three)

**Important:** Make sure to check all three environments (Production, Preview, Development) for each variable!

## Step 4: Deploy

1. Click **"Deploy"** button
2. Wait 1-2 minutes for the build to complete
3. Once done, Vercel will show you a live URL like: `https://your-app-name.vercel.app`

## Step 5: Test Your Deployed App

1. Open the Vercel URL in your browser
2. Allow microphone access when prompted
3. Create a test note by recording audio
4. Check if notes are syncing to Supabase:
   - Go to Supabase Dashboard → Table Editor → `cloud_notes`
   - You should see your notes appearing there!

## Troubleshooting

### Build fails?
- Check the build logs in Vercel dashboard
- Make sure all environment variables are set correctly
- Verify `package.json` has all dependencies

### Notes not syncing to Supabase?
- Check browser console (F12) for errors
- Verify Supabase env vars are set in Vercel
- Make sure you ran the `cloud_notes` table SQL in Supabase

### API key errors?
- Double-check `GEMINI_API_KEY` is set in Vercel environment variables
- Make sure it's the same key that works locally

## Next Steps After Deployment

- Your app is now live! 🎉
- Notes will sync to Supabase automatically
- You can access your notes from any device/browser (as long as they use the same Supabase project)
- To update your app: just push changes to GitHub, Vercel will auto-deploy
