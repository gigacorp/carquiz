# CarQuiz

Small single-page web app for:

1. Weekly spelling list practice
2. Multiplication table practice

All app data is stored in browser `localStorage` (no backend).

## Features

- Single-page static app (`index.html`, `styles.css`, `app.js`)
- Spelling list editor (one word per line)
- Multiplication range selection (up to `20 x 20`)
- Mistake tracking for both modes
- Weighted question selection so missed items appear more often

## Run locally

Open `index.html` in your browser.

## Deploy to GitHub Pages

1. Create a GitHub repository and push these files.
2. In GitHub, open **Settings** -> **Pages**.
3. Under **Build and deployment**, set:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your default branch), folder `/ (root)`
4. Save, then wait for Pages to publish.
5. Your app will be available at `https://<username>.github.io/<repo-name>/`.

## Notes

- Progress is saved per browser/profile/device.
- Clearing browser site data clears saved progress.
