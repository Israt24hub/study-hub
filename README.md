# Study Hub

**Live:** https://israt24hub.github.io/study-hub/

My course notes, summaries and reports from North South University, organised by course, searchable, and free to read and download.

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
- **Only with permission:** teachers' slides and handouts.
- **No:** textbooks, solution manuals and other copyrighted PDFs. Link to the official source instead. Keep private copies in cloud storage.

## How it works

`tools/build_catalog.py` scans `files/`, reads the optional CSVs, and writes `catalog.json` with each document's course, type, size and the date it was added (from git history). A GitHub Actions workflow (`.github/workflows/publish.yml`) runs it on every upload and publishes the site to GitHub Pages. The page (`index.html`, `js/app.js`) loads the catalogue and handles search, filters and links: PDFs open in the browser, Word and PowerPoint files open in Microsoft's online viewer, and notebooks open in nbviewer.

## License

My own notes and reports: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (reuse with credit). Site code: MIT.
