# Study Hub

**Live:** https://israt24hub.github.io/study-hub/

My course notes, summaries and reports from North South University, organised by course, searchable, and free to read and download.

The home page is a dashboard: one tile per course, grouped by semester (or sorted by course code), with a thin light that runs around the tiles. Each tile opens the course's page, where documents are split into tabs by type. Every course has a **Slides** tab: it stays locked until a visitor enters the password, and anyone without it can press **Request access**.

## Add a document (2 minutes)

1. Open the [`files`](files) folder on GitHub, then the course folder (for example `CSE445 - Machine Learning`), then the type folder (for example `Notes`).
2. Click **Add file → Upload files**, drag your PDF in, and click **Commit changes**.
3. Wait 2–3 minutes. The site rebuilds itself and the document appears under its course.

**New course or new type?** Make the folders on your computer first (`CSE331 - Microprocessor Interfacing/Lab Reports/your-file.pdf`), open the `files` folder on GitHub, then drag the whole course folder onto the **Upload files** page. GitHub keeps the folders.

### Naming

- **Course folders:** `CODE - Course name`, e.g. `MAT250 - Calculus III`. The code shows as a badge.
- **Type folders:** anything you like, e.g. `Notes`, `Slides`, `Lab Reports`, `Assignments`, `Papers`. They become filter buttons.
- **File names** become titles: `Week 3 - Decision trees.pdf` shows as *Week 3 - Decision trees*.
- Each file must be under 100 MB. Keep the whole site under about 1 GB.

### Optional: descriptions and course details

`library.csv` adds a nicer title, a description, a semester and tags to any file (separate tags with `;`):

```csv
path,title,description,semester,tags
"files/CSE445 - Machine Learning/Reports/Bank Marketing paper.pdf",Bank Marketing: one column that fakes the results,IEEE-format paper on data leakage,Summer 2026,leakage;evaluation
```

`courses.csv` adds a course name, semester and short description:

```csv
folder,name,semester,description
CSE445 - Machine Learning,Machine Learning,Summer 2026,"Classical ML, evaluation, and a group project."
```

Both files can be edited on GitHub (pencil icon) or in Excel (save as CSV).

## What belongs here

- **Yes:** my own notes, summaries, cheat sheets, and my reports once the course is over (group work only with teammates' agreement).
- **Locked, password only:** teachers' slides. They live encrypted in [`slides/`](slides) and appear on the site only after the password is entered (see below). Never put them in `files/`, which is public.
- **No:** textbooks, solution manuals and other copyrighted PDFs. Link to the official source instead. Keep private copies in cloud storage.

## Locked slides

### Access requests

**Request access** collects the visitor's name, the course and a reason. To receive requests by email, open `index.html`, search for `EDIT`, and put your email address between the quotes in `data-request-email=""`. The form then opens the visitor's email app with the request written out. While it's empty, the form opens a pre-filled GitHub issue instead. Those are public, so the form leaves out email addresses and student IDs.

When you approve someone, send them the slides password privately.

### How the lock works

Teachers' slides are encrypted (AES-256) before they're uploaded, so the public repo only holds unreadable `.bin` files plus an encrypted list of titles. On the site, **🔒 Unlock slides** asks for the password; after that every course shows a *Slides* filter, PDFs open in a new tab and PowerPoint files download. Nothing is unlocked on GitHub's side: the browser does it, and the password never leaves your computer. People you give the password to can open and save the slides, so share it only with people you trust.

To add more slides later (Windows PowerShell, from the repo folder):

```powershell
.\tools\lock_slides.ps1 -Unlock                                      # asks for the current password
.\tools\lock_slides.ps1 -Encrypt -Source "E:\nsu academic\study-hub-slides"   # locks only the new files
.\tools\lock_slides.ps1 -SetPassword                                 # same or new password
```

Put new slides in `<CODE - Course name>\Slides\` inside the source folder first, then commit `slides/` and push. If you see "running scripts is disabled", start PowerShell with `powershell -ExecutionPolicy Bypass`.

## How it works

`tools/build_catalog.py` scans `files/`, reads the optional CSVs, and writes `catalog.json` with each document's course, type, size and the date it was added (from git history). A GitHub Actions workflow (`.github/workflows/publish.yml`) runs it on every upload and publishes the site to GitHub Pages. The page (`index.html`, `js/app.js`) loads the catalogue and handles search, filters and links: PDFs open in the browser, Word and PowerPoint files open in Microsoft's online viewer, and notebooks open in nbviewer. Only the small `slides/key.json` and `slides/index.enc` are published with the site; the locked slide files are fetched straight from the repo, so they don't count towards the Pages size limit.

## License

My own notes and reports: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (reuse with credit). Site code: MIT.
