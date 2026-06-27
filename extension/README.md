# Resume Builder AI Bridge

This extension lets Resume Builder send your PDF to **your existing logged-in web session** on Claude or ChatGPT. For Gemini, Resume Builder extracts the PDF locally to markdown and sends that text because Gemini's hidden-tab upload menu does not create a file input reliably.

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
- Repository imports use explicit JSON delimiters, background backup polling, and app-visible diagnostics so response capture failures can be debugged without asking the user to paste console output.
- Waiting status distinguishes a background provider tab that has not visibly started generating from a model that is already streaming. ChatGPT capture uses CDP focus emulation, assistant DOM mutation events, and immediate complete-JSON detection so normal sends do not require activating or focusing the provider tab. The v1.5.21 CDP wake is the confirmed fix for ChatGPT hidden-tab response materialization. Gemini keeps the CDP wake for background text-send/capture throttling, but PDF input uses local markdown extraction instead of Gemini's hidden-tab upload menu.
- The extension requests Chrome's `debugger` permission for CDP focus/lifecycle emulation. It must not call tab activation APIs or CDP `Page.bringToFront`.
- After changing extension files, reload the unpacked extension and refresh the Resume Builder tab.
