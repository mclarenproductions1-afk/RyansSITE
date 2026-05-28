# StudyDesk — Assignment & Test Tracker

A fully static, no-backend assignment and test tracker that runs on **GitHub Pages** and stores all data by reading and writing `tasks.json` directly in this repo via the GitHub REST API. Every save is a real commit.

---

## Setup (5 minutes)

### 1. Create a GitHub Fine-Grained Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Give it a name (e.g. `studydesk-token`)
4. Under **Repository access** → select **Only select repositories** → choose this repo
5. Under **Permissions → Repository permissions** → set **Contents** to **Read and write**
6. Click **Generate token** and **copy it immediately** (you won't see it again)

---

### 2. Paste your config into `index.html`

Open `index.html` and find the `CONFIG` block near the top of the `<script>` tag:

```js
const CONFIG = {
  owner:  "YOUR_GITHUB_USERNAME",   // ← your GitHub username
  repo:   "YOUR_REPO_NAME",         // ← this repo's name
  branch: "main",
  token:  "YOUR_PERSONAL_ACCESS_TOKEN"  // ← the token you just created
};
```

Replace the three placeholder values and commit the change.

---

### 3. Enable GitHub Pages

1. Go to this repo's **Settings → Pages**
2. Under **Source**, select **Deploy from a branch**
3. Choose branch: `main`, folder: `/ (root)`
4. Click **Save**

GitHub will give you a URL like:
```
https://<your-username>.github.io/<repo-name>
```

---

### 4. Open the app

Visit your GitHub Pages URL. The app will:
- Load any existing tasks from `tasks.json` on page load
- Save every add / edit / complete / delete back to `tasks.json` as a real commit
- Auto-refresh every 30 seconds so multiple users stay in sync

---

## How it works

| Step | What happens |
|------|-------------|
| **Load** | `GET /repos/{owner}/{repo}/contents/tasks.json` → decode base64 → render cards |
| **Save** | Re-encode tasks as base64 → `PUT` with the file's current SHA → GitHub commits it |
| **First save** | If `tasks.json` doesn't exist yet, omit SHA — GitHub creates the file automatically |
| **Conflict** | If two saves race (409), the app re-fetches the latest SHA and retries |

---

## Security note

> ⚠️ **Keep this repo private.** The GitHub token is embedded in `index.html` and is visible in page source to anyone who can view it. A fine-grained token scoped only to this repo limits the blast radius, but you should still treat it as a secret.

If you need to share the app publicly, consider rotating the token periodically via GitHub Settings.

---

## Usage tips

| Action | How |
|--------|-----|
| Add task | Click **Add Task** button or press **N** |
| Complete | Click the checkbox on any card |
| Edit | Click the pencil icon |
| Delete | Click the trash icon |
| Close panel | Press **Escape** |
| Filter | Use the **All / Upcoming / Overdue / Completed** tabs |

---

## File structure

```
/
├── index.html     ← entire app (HTML + CSS + JS, no build step)
├── tasks.json     ← the "database" (starts as [])
└── README.md
```

---

## GitHub API limits

GitHub allows **5,000 authenticated requests per hour** on a free account — more than enough for a class of students adding tasks throughout the day.
