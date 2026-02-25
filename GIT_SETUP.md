# Steps to put ResumeIQ on Git (GitHub) so others can use and work on it

## 1. Create a new repository on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click **New** (or **+** → **New repository**).
3. **Repository name:** e.g. `resumeiq`
4. **Description:** e.g. `Resume optimization tool – tailor resume to job descriptions with AI suggestions`
5. Choose **Public** (or Private if you prefer).
6. **Do not** add a README, .gitignore, or license yet (you already have files).
7. Click **Create repository**.

---

## 2. Initialize Git in the project (if not already)

Open a terminal and go to the project folder:

```bash
cd /Users/apple/resumeiq
```

Check if Git is already set up:

```bash
git status
```

- If you see `fatal: not a git repository`: run the steps below.
- If you already see branch and file list: skip to **Step 4**.

Initialize and first commit:

```bash
git init
git add .
git status
git commit -m "Initial commit: ResumeIQ – resume optimization with AI suggestions and PDF export"
```

---

## 3. (Optional) Check what will be committed

- `.env` is in `.gitignore` – your `VITE_OPENAI_API_KEY` will **not** be pushed. Others will add their own key.
- `node_modules` and `dist` are ignored.

---

## 4. Connect to GitHub and push

Replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name (e.g. `johndoe` and `resumeiq`):

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

If GitHub shows you a **token or SSH** prompt, use your preferred method (HTTPS + token, or SSH key).

---

## 5. What others need to do to use and work on the code

Share the repo URL (e.g. `https://github.com/YOUR_USERNAME/resumeiq`) and these steps:

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd YOUR_REPO
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add their own API key**
   - Copy `.env.example` to `.env` (if you add one), or create `.env` with:
     ```
     VITE_OPENAI_API_KEY=their_openai_api_key_here
     ```
   - Get a key from [platform.openai.com](https://platform.openai.com/api-keys).

4. **Run the app**
   ```bash
   npm run dev
   ```

5. **Work on the code**
   - Create a branch: `git checkout -b feature/my-feature`
   - Commit and push: `git add .` → `git commit -m "Description"` → `git push -u origin feature/my-feature`
   - Open a Pull Request on GitHub.

---

## 6. (Optional) Add a .env.example for collaborators

Create a file `.env.example` in the project root with no real key:

```
# Get your key from https://platform.openai.com/api-keys
VITE_OPENAI_API_KEY=
```

Commit and push it. Others can copy `.env.example` to `.env` and paste their key.

---

## Quick reference

| Step | Command |
|------|--------|
| First-time init | `git init` → `git add .` → `git commit -m "Initial commit"` |
| Add GitHub remote | `git remote add origin https://github.com/USER/REPO.git` |
| Push | `git branch -M main` → `git push -u origin main` |
| Later updates | `git add .` → `git commit -m "Message"` → `git push` |
