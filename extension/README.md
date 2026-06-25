# Resume Builder AI Bridge

This extension lets Resume Builder send your PDF to **your existing logged-in web session** on Claude, ChatGPT, or Gemini.

No API keys. It automates the chat website you already use in the browser.

## Install (one time)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `ResumeBuilder/extension`
5. Keep the extension enabled
6. **Refresh the Resume Builder tab** (`Cmd+R` / `Ctrl+R`)

If you already loaded the extension but the app says "Extension needed", just refresh the resume page — Chrome only injects the bridge into tabs that were open after the extension loaded.

### CSP note

The bridge loads `page-bridge.js` from the extension (not inline script) so it works with Vite's Content Security Policy.

## Use

1. Run the resume app: `npm run dev`
2. Log into Claude / ChatGPT / Gemini in Chrome as you normally would
3. In Resume Builder:
   - Pick a provider
   - Click **Connect** (opens your web session)
   - Click **Send PDF**, import, or generate from repository. The extension opens
     the provider tab in the background and sends/captures without switching tabs.

## Notes

- This is a proof of concept. Chat UIs change often, so selectors may need updates.
- The extension only runs when you start an AI send/import action.
- Your login cookies stay in the browser — nothing is sent to a third-party API.
