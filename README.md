# Resume Builder

Resume Builder is an app that writes a one-page resume for a specific job. You paste in a job posting, and the app uses an AI chatbot (Claude, ChatGPT, or Gemini) to write a resume that fits that job. It can also write a matching cover letter.

It runs on your own computer. Your information is saved on your computer, not on a website.

## What problem it solves

Most people have one resume and send it to every job. A better resume is tailored to each job: it puts the most relevant work first and uses the words the job posting uses. Doing that by hand for every application takes a long time. This app does most of that work for you, and then lets you check and edit the result.

## How it works, in plain terms

1. **You write down everything you have done, once.** On the Repository page, you describe each job, internship, and project in your own words. These notes can be long and messy. They are raw material, not a finished resume. You also enter your school, GPA, and courses on the Education page.
2. **You paste a job posting.** The app reads what the employer is asking for.
3. **The app asks an AI to write the resume.** It sends the AI your notes, the job posting, and a long list of writing rules. The rules say things like "start each bullet with an action verb", "never make up numbers", and "the first bullet of each project must make sense to someone who does not study computer science".
4. **You review the result.** The app shows the new resume and a list of every change. You can accept it, ask the AI for more changes, or edit any line yourself, the same way you would edit a document.
5. **You download a PDF.** The final resume is a clean, one-page PDF.

### How the app talks to the AI

The app does not use a paid AI account key. Instead, it uses a small Chrome extension that opens the AI chat website you are already logged into (for example, claude.ai), types the request for you, waits for the answer, and brings the answer back into the app. You can watch this happen in a browser tab.

### Getting a second and third opinion ("LLM Council")

Different AI chatbots write differently, and each one makes different mistakes. In Council mode, the app asks two or three AIs to write the resume separately. Then a separate AI chat acts as a judge. The judge does not know which AI wrote which draft. It gives each draft a score out of 100, explains the score, and combines the best parts into one final resume. You can still look at every draft and pick a different one.

## Main features

- **Build from your notes:** writes a new resume from your Repository notes for one job posting.
- **Improve an existing resume:** upload a resume PDF and a job posting, and get back an improved version with a before and after comparison.
- **Cover letters:** writes a one-page cover letter that matches the resume and adds details that did not fit on the resume.
- **Many jobs at once:** the Bulk page takes several job postings and builds a resume for each one.
- **Recruiter check:** after a resume is built, a fresh AI chat that has never seen your notes reads the resume for ten seconds and describes you in one or two sentences. If that description is wrong, the resume is not saying what you meant.
- **Job match notes:** a side panel explains which lines of the resume match which parts of the job posting.
- **Import:** pull your past work into the Repository from an old resume PDF or from your LinkedIn profile.
- **History:** every resume you build is saved, so you can open old versions later.
- **Style settings:** change fonts, sizes, spacing, and section order.
- **Private chats:** an option to use the AI website's private or temporary chat mode, so your resume is not saved in your chat history.

## Pages in the app

| Page | What it is for |
| --- | --- |
| Resume | Build, review, and edit a resume or cover letter. |
| Bulk | Build resumes for several job postings in one run. |
| Repository | Your notes about every job, internship, and project. |
| Education | Your school, degree, GPA, courses, and skills. |
| History | Resumes you built before. |
| Settings | Default fonts, sizes, and layout. |
| Privacy | Explains that your data stays on your computer. |

## Project structure

```
ResumeBuilder/
├── frontend/            The app you see in the browser (React and TypeScript)
│   └── src/
│       ├── pages/       One file per page (Resume, Repository, Education, ...)
│       ├── components/  Building blocks of the pages (the resume editor, pop-up windows, toolbars)
│       ├── utils/       The logic: AI instructions, reading AI answers, PDF output
│       ├── personal/    Your contact details and personal examples (see below)
│       ├── hooks/       Shared app state, such as undo and the link to the extension
│       ├── types/       Descriptions of the data, such as what a resume contains
│       └── data/        The starter resume shown before you build one
├── backend/             A small local server that saves your data and makes PDFs
├── extension/           The Chrome extension that talks to the AI chat websites
├── llm-launcher/        An older, simpler extension that opens an AI site and pastes a prompt
├── gemini-attach-test/  A test used to check how files are attached in Gemini
├── scripts/             Helper script that estimates how many words fit on a resume line
└── docs/                Detailed technical notes for developers
```

### The files that matter most

- `frontend/src/utils/resumeWritingRules.ts`: the writing rules every AI must follow. Change these to change how resumes are written.
- `frontend/src/utils/aiPrompt.ts`: puts together the full request sent to the AI, including the judge's instructions in Council mode.
- `frontend/src/utils/resumeHouseStyle.ts`: fixes a few formatting rules in code after the AI answers (no bold text, a period at the end of each bullet, no job locations, graduation date only), in case the AI missed them.
- `frontend/src/utils/coverLetterWritingRules.ts`: the writing rules for cover letters.
- `frontend/src/components/ResumeDocument.tsx`: the resume page you edit on screen.
- `backend/index.cjs`: the local server.
- `extension/`: the code that opens the AI websites, sends the request, and reads the reply.

### Where your data is kept

- Your notes, education, and history are saved in a database file on your computer at `~/.resume-builder/data.db`. It is not part of this project folder.
- Your name, email, phone, links, and the examples taken from your own experience are in `frontend/src/personal/personal.local.ts`. This file is listed in `.gitignore`, so it is never uploaded to GitHub. If the file is missing, the app uses placeholder details from `personal.example.ts`.

## Running it

You need Node.js, Google Chrome, and an account on at least one of Claude, ChatGPT, or Gemini.

1. Install and start the app:
   ```bash
   npm install
   npm run dev
   ```
   Then open `http://localhost:5173` in Chrome.
2. Load the extension: go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension` folder. Refresh the app tab after loading it.
3. To download PDFs, install the Tectonic program, which turns the resume into a PDF: `brew install tectonic`.
4. To use your own details, copy `frontend/src/personal/personal.example.ts` to `personal.local.ts` in the same folder, change `export const examplePersonalProfile` to `export default`, and fill in your information.

## Built with

React, TypeScript, and Vite for the app; Express and SQLite for the local server; a Chrome extension for the AI connection; LaTeX (through Tectonic) for the PDF.

## More detail

For developers, `docs/TECHNICAL_NOTES.md` explains how each part works in depth.
