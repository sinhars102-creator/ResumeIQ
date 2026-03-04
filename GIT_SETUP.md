# Steps to put ResumeIQ on Git (GitHub) so others can use and work on it

**See also:** [README.md](README.md) for quick start · [DEPLOYMENT.md](DEPLOYMENT.md) for going live.

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
git commit -m "ResumeIQ v1.0: AI resume optimization, LinkedIn jobs (India), JDs, PDF export – ready for launch"
```

---

## 3. (Optional) Check what will be committed

- `.env` is in `.gitignore` – your `VITE_OPENAI_API_KEY` will **not** be pushed. Others will add their own key.
- `node_modules` and `dist` are ignored.

---

## 4. Connect to GitHub and push

Use your repo name for `YOUR_REPO` (e.g. `resumeiq`). Example with username `sinhars102-creator`:

```bash
git remote add origin https://github.com/sinhars102-creator/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## 4b. No GitHub password? (e.g. you signed up with Google)

GitHub doesn’t use your Google password for Git. Use one of these:

### Option A: Personal Access Token (simplest)

1. On GitHub: click your profile picture → **Settings** → **Developer settings** (left sidebar) → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**. Name it e.g. `ResumeIQ push`. Choose expiry (e.g. 90 days or no expiration). Check **repo**.
3. Generate and **copy the token** (you won’t see it again).
4. When you run `git push`, Git will ask for:
   - **Username:** `sinhars102-creator`
   - **Password:** paste the **token** (not your Google password).
5. Optionally, Git can remember it: use a credential helper (e.g. on macOS: `git config --global credential.helper osxkeychain`), then the next time you enter the token it will be saved.

### Option B: SSH key (no password prompt after setup)

1. Create an SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"` (Enter to accept default path, optionally set a passphrase).
2. Start the agent and add the key: `eval "$(ssh-agent -s)"` then `ssh-add ~/.ssh/id_ed25519`.
3. Copy the **public** key: `cat ~/.ssh/id_ed25519.pub` (copy the whole line).
4. On GitHub: **Settings** → **SSH and GPG keys** → **New SSH key** → paste the key and save.
5. Use the SSH remote instead of HTTPS:
   ```bash
   git remote remove origin
   git remote add origin git@github.com:sinhars102-creator/YOUR_REPO.git
   git push -u origin main
   ```
   After that, `git push` won’t ask for a password.

---

## 5. What others need to do to use and work on the code

Share the repo URL (e.g. `https://github.com/sinhars102-creator/resumeiq`) and these steps:

1. **Clone the repo**
   ```bash
   git clone https://github.com/sinhars102-creator/YOUR_REPO.git
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
| Add GitHub remote | `git remote add origin https://github.com/sinhars102-creator/REPO.git` |
| Push | `git branch -M main` → `git push -u origin main` |
| Later updates | `git add .` → `git commit -m "Message"` → `git push` |
