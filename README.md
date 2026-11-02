# YoCV prototype

A standalone student concept for Yoma. Turns everyday responsibilities into a reviewed CV with a separate evidence record.

## Presentation materials

The `presentation/` folder contains the one-slide BBS-template overview in PowerPoint and PDF, the three-minute demo script, and the Yoma integration notes.

## Open it

Open `index.html` in a browser. Keep `core.js`, `app.js` and `styles.css` next to it. No installation, account or API key is required.

For a local server, run this from the app folder:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:4173`.

## Demonstrate it

1. Click **Try Amina’s story**.
2. Choose a role and click **Build my CV**.
3. Review the responsibilities and continue to supporting evidence.
4. Click **Create my draft**.
5. Accept, edit or reject every claim individually.
6. Preview the CV, print/Save as PDF, and download the text CV or evidence record.

Use **Reset demo** to clear the session. Reloading also clears the draft. The app does not save CV content automatically.

## Working versus simulated

Review, category tracking, preview and downloads work. Generation uses local rules and templates, not live AI. All issuer credentials are synthetic. Files are not uploaded or read. Yoma integration and real credential verification remain future work. User acceptance confirms wording, not independent verification.

An internet connection can load the optional Google Fonts stylesheet. System fonts work when offline. The app sends no CV content to a model provider or Yoma.

## Source layout

- `index.html`: application shell and explanatory dialogs
- `styles.css`: mobile and desktop layout, accessible focus states and print layout
- `core.js`: source-linked suggestions, review decisions and export rules
- `app.js`: five-step journey and downloads
- `tests/core.test.cjs`: behavioral tests, run with `node --test tests/core.test.cjs`

The proposed integration reference is [Devin-Fitzpatrick06/yoma](https://github.com/Devin-Fitzpatrick06/yoma). This app does not modify that repository and is not endorsed by UNICEF or Yoma.
