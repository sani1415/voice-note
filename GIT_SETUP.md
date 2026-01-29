# Git & GitHub Setup Instructions

✅ **Git is now installed!** Close and reopen your terminal/PowerShell window, then run these commands:

## Step 1: Configure Git (one-time setup)

**Important:** Run these commands in a **NEW** terminal window (after closing and reopening):

```bash
git config --global user.name "madanitech123"
git config --global user.email "madanitech123@gmail.com"
```

## Step 2: Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit: Swarolipi AI voice notes app"
```

## Step 3: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `swarolipi-ai` (or any name you prefer)
3. Choose **Public** or **Private**
4. **Do NOT** initialize with README (you already have one)
5. Click **Create repository**

## Step 4: Connect and Push

After creating the repo, GitHub will show you commands. Use these:

```bash
git remote add origin https://github.com/madanitech123/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace `YOUR_REPO_NAME` with the actual repository name you created.

## Important Notes

- Your `.env.local` file is already ignored by `.gitignore` (it contains your API keys)
- Never commit `.env.local` to GitHub
- When deploying to Vercel, add environment variables in Vercel's dashboard instead
