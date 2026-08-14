# Deployment Rules

> [!IMPORTANT]
> **STRICT PROTOCOL: NO AUTOMATIC GIT PUSHING**

1.  **NEVER** run `git push` automatically.
2.  **ALWAYS** wait for explicit user permission to push code (e.g., "Okay push that", "Deploy it").
3.  **NEVER** assume a fix should be deployed immediately, even if it is critical.
4.  **ALWAYS** confirm: "I have fixed the code locally. Shall I push it?"

## Current Environment
- **Live Site:** `https://cavalryfc.org` (Hosted on Render)
- **Repo:** `github.com/reecepcavalry/CavalryFC`
  (moved from `reecep-design/CavalryFC`; the local `origin` still points at the
  old path via the `github-cavalryfc` SSH alias and works only by GitHub's
  redirect — see "Known issues" below)
- **Branch:** `master`

## Environment Variables
- **Production (Render):**
    - `FRONTEND_URL` = `https://cavalryfc.org`
    - `NODE_ENV` = `production`

## Known issues
- **`origin` points at the old repo path.** Pushes currently succeed only
  because GitHub redirects `reecep-design/CavalryFC` →
  `reecepcavalry/CavalryFC`. Those redirects are not permanent and break if
  anything is ever created at the old name. To fix:
  `git remote set-url origin git@github-cavalryfc:reecepcavalry/CavalryFC.git`
  (keep the `github-cavalryfc` alias — it selects the right SSH key).
