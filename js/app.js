/*
 * NSU Academic · Study Hub
 * A dashboard of courses (grouped by semester), one page per course with its documents,
 * search across everything, and locked lecture slides that need a password.
 * Plain JavaScript, no libraries. The list of documents comes from catalog.json,
 * which tools/build_catalog.py writes on every upload.
 */
;(function () {
    "use strict"
    var state = { q: "", type: "", course: "", sort: "term" }
    var data = { courses: [], documents: [] }
    var $ = function (id) { return document.getElementById(id) }
    var homeScroll = 0
    var lastView = ""
    var requestEmail = (document.body.getAttribute("data-request-email") || "").trim()
    var REPO = "https://github.com/Israt24hub/study-hub"

    function fmtSize(b) {
        if (b < 1e3) return b + " B"
        if (b < 1e6) return Math.round(b / 1e3) + " KB"
        return (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + " MB"
    }
    function fmtDate(iso) {
        var d = new Date(iso)
        return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    }
    function fileUrl(path) { return path.split("/").map(encodeURIComponent).join("/") }
    function absolute(path) { return new URL(fileUrl(path), location.href).href }
    function viewUrl(doc) {
        var e = doc.ext
        if (["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "html", "htm", "mp4"].indexOf(e) !== -1) return fileUrl(doc.path)
        if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].indexOf(e) !== -1)
            return "https://view.officeapps.live.com/op/view.aspx?src=" + encodeURIComponent(absolute(doc.path))
        if (e === "ipynb") return "https://nbviewer.org/urls/" + absolute(doc.path).replace(/^https?:\/\//, "")
        return null
    }
    function courseOf(folder) {
        for (var i = 0; i < data.courses.length; i++) if (data.courses[i].folder === folder) return data.courses[i]
        return null
    }
    function courseLabel(c) { return c.code && c.name ? c.code + " · " + c.name : c.code || c.name }
    function plural(n, one, many) { return n + " " + (n === 1 ? one : many) }
    function el(tag, cls, text) {
        var e = document.createElement(tag)
        if (cls) e.className = cls
        if (text != null) e.textContent = text
        return e
    }

    // NSU has three semesters a year: Spring (Jan–Apr), Summer (May–Aug), Fall (Sep–Dec)
    var TERM_ORDER = { spring: 1, summer: 2, fall: 3, autumn: 3 }
    function termKey(semester) {
        var m = /(spring|summer|fall|autumn)\s*(\d{4})/i.exec(semester || "")
        return m ? Number(m[2]) * 10 + TERM_ORDER[m[1].toLowerCase()] : -1
    }
    function docsOf(folder) { return data.documents.filter(function (d) { return d.course === folder }) }
    function slidesUnlocked() { return !!slideKeys }

    /* ---------------- state ↔ URL ---------------- */
    function readHash() {
        var params = new URLSearchParams(location.hash.slice(1))
        state.q = params.get("q") || ""
        state.type = params.get("type") || ""
        state.course = params.get("course") || ""
        state.sort = params.get("sort") === "code" ? "code" : "term"
    }
    function hashFor(s) {
        var params = new URLSearchParams()
        if (s.course) params.set("course", s.course)
        if (s.type) params.set("type", s.type)
        if (s.q) params.set("q", s.q)
        if (s.sort === "code") params.set("sort", "code")
        var h = params.toString()
        return h ? "#" + h : ""
    }
    function writeHash() {
        var h = hashFor(state)
        history.replaceState(null, "", h || location.pathname + location.search)
    }
    function courseHref(folder) { return hashFor({ course: folder, sort: state.sort }) }

    /* ---------------- ordering ---------------- */
    function orderedCourses() {
        var list = data.courses.slice()
        if (state.sort === "code") return list.sort(function (a, b) { return (a.code || "~").localeCompare(b.code || "~") || a.name.localeCompare(b.name) })
        return list.sort(function (a, b) { return termKey(b.semester) - termKey(a.semester) || (a.code || "~").localeCompare(b.code || "~") })
    }

    /* ---------------- document rows ---------------- */
    function row(doc, showCourse) {
        var li = $("row-tpl").content.firstElementChild.cloneNode(true)
        var ext = li.querySelector(".ext")
        ext.textContent = doc.ext || "file"
        ext.classList.add(doc.ext)
        li.querySelector(".doc-title").textContent = doc.title
        li.querySelector(".doc-desc").textContent = doc.description
        var meta = li.querySelector(".doc-meta")
        var badge = el("span", "badge", doc.type)
        meta.appendChild(badge)
        var bits = []
        var c = courseOf(doc.course)
        if (showCourse && c) bits.push(courseLabel(c))
        if (doc.semester) bits.push(doc.semester)
        bits.push(fmtSize(doc.size))
        if (doc.added) bits.push("added " + fmtDate(doc.added))
        meta.appendChild(document.createTextNode(bits.join(" · ")))
        var view = li.querySelector(".view"), dl = li.querySelector(".download")
        view.setAttribute("aria-label", "View " + doc.title)
        dl.setAttribute("aria-label", "Download " + doc.title)
        if (doc.locked) {
            badge.textContent = "🔒 " + doc.type
            view.href = dl.href = "#"
            view.removeAttribute("target")
            dl.removeAttribute("download")
            view.hidden = doc.ext !== "pdf"   // browsers can show PDFs; PowerPoint files are downloaded
            view.addEventListener("click", function (e) { e.preventDefault(); openSlide(doc, true, view) })
            dl.addEventListener("click", function (e) { e.preventDefault(); openSlide(doc, false, dl) })
            return li
        }
        var v = viewUrl(doc)
        if (v) view.href = v
        else view.hidden = true
        dl.href = fileUrl(doc.path)
        dl.setAttribute("download", doc.path.split("/").pop())
        return li
    }
    function docList(docs, showCourse) {
        var ul = el("ul", "docs")
        docs.forEach(function (d) { ul.appendChild(row(d, showCourse)) })
        return ul
    }
    function empty(title, text) {
        var box = el("div", "empty")
        box.appendChild(el("h3", null, title))
        if (text) box.appendChild(el("p", null, text))
        return box
    }

    /* ---------------- dashboard ---------------- */
    var tileIndex = 0
    function tile(c) {
        var docs = docsOf(c.folder)
        var a = el("a", "tile")
        a.href = courseHref(c.folder)
        a.style.setProperty("--i", tileIndex++)
        var top = el("span", "tile-top")
        if (c.code) top.appendChild(el("span", "code", c.code))
        if (c.semester) top.appendChild(el("span", "term-tag", c.semester))
        a.appendChild(top)
        a.appendChild(el("h4", null, c.name || c.code))
        if (c.description) a.appendChild(el("p", "tile-desc", c.description))
        var foot = el("span", "tile-foot")
        var count = el("span", "tile-count")
        count.appendChild(el("b", null, String(docs.length)))
        count.appendChild(document.createTextNode(docs.length === 1 ? "document" : "documents"))
        foot.appendChild(count)
        var counts = {}
        docs.forEach(function (d) { if (!d.locked) counts[d.type] = (counts[d.type] || 0) + 1 })
        Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x] || x.localeCompare(y) }).forEach(function (t) {
            foot.appendChild(el("span", "pill", t + " " + counts[t]))
        })
        var slides = docs.filter(function (d) { return d.locked }).length
        if (!slidesUnlocked()) foot.appendChild(el("span", "pill pill-lock", "🔒 Slides"))
        else if (slides) foot.appendChild(el("span", "pill pill-lock", "Slides " + slides))
        a.appendChild(foot)
        a.setAttribute("aria-label", courseLabel(c) + ", " + plural(docs.length, "document", "documents"))
        return a
    }

    function renderHome() {
        var dash = $("dashboard")
        dash.innerHTML = ""
        dash.classList.toggle("by-term", state.sort === "term")
        Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
            b.setAttribute("aria-pressed", b.getAttribute("data-sort") === state.sort ? "true" : "false")
        })
        tileIndex = 0
        var courses = orderedCourses()
        if (!courses.length) {
            dash.appendChild(empty("No documents yet", "Upload files into a course folder, for example files/CSE445 - Machine Learning/Notes/. The site rebuilds itself and they appear here within a few minutes."))
            return
        }
        if (state.sort === "code") {
            var grid = el("div", "tiles")
            courses.forEach(function (c) { grid.appendChild(tile(c)) })
            dash.appendChild(grid)
        } else {
            var groups = []
            courses.forEach(function (c) {
                var label = termKey(c.semester) > 0 ? c.semester : "Other courses"
                var g = groups[groups.length - 1]
                if (!g || g.label !== label) groups.push(g = { label: label, list: [] })
                g.list.push(c)
            })
            groups.forEach(function (g) {
                var sec = el("section", "term")
                var head = el("div", "term-head")
                head.appendChild(el("h3", null, g.label))
                head.appendChild(el("span", null, plural(g.list.length, "course", "courses")))
                sec.appendChild(head)
                var grid = el("div", "tiles")
                g.list.forEach(function (c) { grid.appendChild(tile(c)) })
                sec.appendChild(grid)
                dash.appendChild(sec)
            })
        }

        // recently added (only worth showing when uploads happened on different days)
        var pub = data.documents.filter(function (d) { return !d.locked && d.added })
        var days = {}
        pub.forEach(function (d) { days[d.added.slice(0, 10)] = 1 })
        var show = Object.keys(days).length > 1
        $("recent").hidden = !show
        if (show) {
            var rl = $("recent-list")
            rl.innerHTML = ""
            pub.sort(function (a, b) { return b.added.localeCompare(a.added) }).slice(0, 4).forEach(function (d) {
                var li = el("li"), a = el("a")
                a.href = viewUrl(d) || fileUrl(d.path)
                a.target = "_blank"
                a.rel = "noopener"
                a.appendChild(el("b", null, d.title))
                var c = courseOf(d.course)
                a.appendChild(el("small", null, (c ? courseLabel(c) + " · " : "") + d.type))
                li.appendChild(a)
                rl.appendChild(li)
            })
        }
    }

    /* ---------------- one course ---------------- */
    var LOCK_SVG = '<svg class="lock-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="21" width="28" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="30" r="2.6" fill="currentColor"/><path d="M24 32v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'

    function lockedPanel(c) {
        var box = el("div", "locked")
        box.innerHTML = LOCK_SVG
        box.appendChild(el("h3", null, "Slides for " + (c.code || c.name) + " are locked"))
        box.appendChild(el("p", null, "Lecture slides belong to the course teachers, so I share them only with people who ask. Request access, and if I can, I'll send you the password."))
        var actions = el("div", "locked-actions")
        var req = el("button", "btn primary", "Request access")
        req.type = "button"
        req.addEventListener("click", function () { openRequest(c.folder) })
        actions.appendChild(req)
        if (canUnlock()) {
            var have = el("button", "btn", "I have the password")
            have.type = "button"
            have.addEventListener("click", openUnlock)
            actions.appendChild(have)
        }
        box.appendChild(actions)
        return box
    }

    function renderCourse() {
        var c = courseOf(state.course)
        var body = $("course-body"), tabs = $("tabs"), pager = $("pager")
        body.innerHTML = ""
        tabs.innerHTML = ""
        pager.innerHTML = ""
        if (!c) {
            $("course-code").textContent = ""
            $("course-term").textContent = ""
            $("course-title").textContent = "Course not found"
            $("course-desc").textContent = slidesUnlocked() ? "" : "It may only have locked slides. Unlock the slides to see it."
            return
        }
        document.title = courseLabel(c) + " · NSU Academic"
        $("course-code").textContent = c.code
        $("course-code").hidden = !c.code
        $("course-term").textContent = c.semester || ""
        $("course-title").textContent = c.name || c.code
        $("course-desc").textContent = c.description || ""

        var docs = docsOf(c.folder)
        var counts = {}
        docs.forEach(function (d) { if (d.type !== "Slides") counts[d.type] = (counts[d.type] || 0) + 1 })
        var slides = docs.filter(function (d) { return d.type === "Slides" })
        var types = [""].concat(Object.keys(counts).sort(), ["Slides"])
        if (types.indexOf(state.type) === -1) state.type = ""
        types.forEach(function (t) {
            var b = el("button")
            b.type = "button"
            b.setAttribute("aria-pressed", state.type === t ? "true" : "false")
            var n = t === "" ? docs.length : t === "Slides" ? slides.length : counts[t]
            var locked = t === "Slides" && !slidesUnlocked()
            b.textContent = locked ? "🔒 Slides" : (t || "All")
            if (!locked) b.appendChild(el("span", null, String(n)))
            b.addEventListener("click", function () { state.type = t; render() })
            tabs.appendChild(b)
        })

        if (state.type === "Slides" && !slidesUnlocked()) {
            body.appendChild(lockedPanel(c))
        } else {
            var shown = docs.filter(function (d) { return !state.type || d.type === state.type })
                .sort(function (a, b) { return a.type.localeCompare(b.type) || a.title.localeCompare(b.title, undefined, { numeric: true }) })
            if (shown.length) body.appendChild(docList(shown, false))
            else if (state.type === "Slides") body.appendChild(empty("No slides for this course yet"))
            else body.appendChild(empty("No documents here yet"))
        }

        // previous / next course in the dashboard's order
        var list = orderedCourses()
        var i = list.indexOf(c)
        ;[[list[i - 1], "prev", "← Previous course"], [list[i + 1], "next", "Next course →"]].forEach(function (p) {
            if (!p[0]) return
            var a = el("a", p[1])
            a.href = courseHref(p[0].folder)
            a.appendChild(el("small", null, p[2]))
            a.appendChild(el("b", null, courseLabel(p[0])))
            pager.appendChild(a)
        })
    }

    /* ---------------- search ---------------- */
    function matches(doc) {
        var c = courseOf(doc.course) || {}
        var hay = [doc.title, doc.description, doc.type, doc.semester, c.code, c.name, c.semester, (doc.tags || []).join(" "), doc.path].join(" ").toLowerCase()
        return state.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1 })
    }
    function renderResults() {
        var body = $("results-body")
        body.innerHTML = ""
        var words = state.q.toLowerCase().split(/\s+/)
        var docs = data.documents.filter(matches)
        var courses = data.courses.filter(function (c) {
            var hay = [c.code, c.name, c.semester, c.description].join(" ").toLowerCase()
            return words.every(function (w) { return hay.indexOf(w) !== -1 })
        })
        $("results-title").textContent = plural(docs.length, "result", "results") + " for “" + state.q + "”"
        document.title = "Search: " + state.q + " · NSU Academic"
        if (courses.length) {
            var chips = el("div", "results-courses")
            courses.forEach(function (c) {
                var a = el("a", null, courseLabel(c))
                a.href = courseHref(c.folder)
                chips.appendChild(a)
            })
            body.appendChild(chips)
        }
        if (!docs.length) {
            body.appendChild(empty("Nothing matches", "Try a different word, or a course code such as CSE411."))
            return
        }
        docs.sort(function (a, b) { return a.course.localeCompare(b.course) || a.title.localeCompare(b.title, undefined, { numeric: true }) })
        body.appendChild(docList(docs, true))
    }

    /* ---------------- views ---------------- */
    function render() {
        writeHash()
        var view = state.q ? "results" : state.course ? "course" : "home"
        if (lastView === "home" && view !== "home") homeScroll = window.scrollY
        $("home").hidden = view !== "home"
        $("course-view").hidden = view !== "course"
        $("results-view").hidden = view !== "results"
        if (view === "home") {
            document.title = "NSU Academic · Israt's Study Hub"
            renderHome()
        } else if (view === "course") {
            renderCourse()
        } else {
            renderResults()
        }
        if (view !== lastView) {
            if (view === "home") window.scrollTo(0, homeScroll)
            else if (view === "course") window.scrollTo(0, 0)
        }
        lastView = view
    }

    function showStats() {
        var terms = {}
        data.courses.forEach(function (c) { if (termKey(c.semester) > 0) terms[c.semester] = 1 })
        $("stat-docs").textContent = data.documents.length
        $("stat-courses").textContent = data.courses.length
        $("stat-terms").textContent = Object.keys(terms).length
        $("stat-updated").textContent = fmtDate(data.generated)
    }

    /* ---------------- requesting access to slides ---------------- */
    function openRequest(folder) {
        var dlg = $("request-dlg"), sel = $("req-course")
        if (typeof dlg.showModal !== "function") {
            window.open(issueUrl(courseOf(folder), "", ""), "_blank", "noopener")
            return
        }
        sel.innerHTML = ""
        orderedCourses().slice().sort(function (a, b) { return (a.code || "~").localeCompare(b.code || "~") }).forEach(function (c) {
            var o = el("option", null, courseLabel(c))
            o.value = c.folder
            sel.appendChild(o)
        })
        sel.value = folder || state.course || sel.value
        var byEmail = !!requestEmail
        $("req-email").required = byEmail
        $("req-email").parentNode.hidden = !byEmail
        $("req-id").hidden = !byEmail
        $("req-id").previousElementSibling.hidden = !byEmail
        $("request-note").textContent = byEmail
            ? "This opens your email app with the request filled in. I'll reply to the email address you give."
            : "This opens a pre-filled request on GitHub (you need a free GitHub account). GitHub requests are public, so don't add your email or student ID; I'll reply there."
        $("request-go").textContent = byEmail ? "Write the email" : "Open the request on GitHub"
        dlg.showModal()
        $("req-name").focus()
    }
    function issueUrl(c, name, why) {
        var label = c ? courseLabel(c) : "a course"
        var body = "I'd like access to the lecture slides for " + label + ".\n\n" +
            (name ? "Name: " + name + "\n" : "") + (why ? "Why I need them: " + why + "\n" : "")
        return REPO + "/issues/new?title=" + encodeURIComponent("Slide access request: " + label) + "&body=" + encodeURIComponent(body)
    }
    function setupRequest() {
        var dlg = $("request-dlg"), form = $("request-form")
        $("request-cancel").addEventListener("click", function () { dlg.close() })
        form.addEventListener("submit", function (e) {
            e.preventDefault()
            var c = courseOf($("req-course").value)
            var name = $("req-name").value.trim(), why = $("req-why").value.trim()
            if (requestEmail) {
                var label = c ? courseLabel(c) : "a course"
                var body = "Hello Israt,\n\nI'd like access to the lecture slides for " + label + ".\n\n" +
                    "Name: " + name + "\nEmail: " + $("req-email").value.trim() + "\n" +
                    ($("req-id").value.trim() ? "University and student ID: " + $("req-id").value.trim() + "\n" : "") +
                    (why ? "Why I need them: " + why + "\n" : "") + "\nThank you!"
                window.location.href = "mailto:" + requestEmail + "?subject=" + encodeURIComponent("Slide access request: " + label) + "&body=" + encodeURIComponent(body)
            } else {
                window.open(issueUrl(c, name, why), "_blank", "noopener")
            }
            dlg.close()
        })
    }

    /* ---------------- locked slides ----------------
       slides/key.json holds the master key, wrapped with a key derived from the password (PBKDF2-SHA256).
       Every locked file is  "SHB1" | iv | AES-256-CBC(data) | HMAC-SHA256  (see tools/lock_slides.ps1). */
    var SESSION_KEY = "studyhub-slides"
    var slideKeys = null
    var MIME = { pdf: "application/pdf", ppt: "application/vnd.ms-powerpoint",
                 pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
    var COURSE_RE = /^([A-Za-z]{2,4}\s?\d{3}[A-Za-z]?)\s*[-–:]?\s*(.*)$/

    function b64ToBytes(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
    function bytesToB64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s) }
    function okResponse(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r }

    function importKeys(raw) {
        return Promise.all([
            crypto.subtle.importKey("raw", raw.slice(0, 32), "AES-CBC", false, ["decrypt"]),
            crypto.subtle.importKey("raw", raw.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
        ]).then(function (k) { return { aes: k[0], mac: k[1] } })
    }
    function openLocked(keys, buffer) {
        var b = new Uint8Array(buffer)
        if (b.length < 68 || b[0] !== 0x53 || b[1] !== 0x48 || b[2] !== 0x42 || b[3] !== 0x31) return Promise.reject(new Error("not a locked file"))
        var end = b.length - 32
        return crypto.subtle.verify("HMAC", keys.mac, b.slice(end), b.subarray(0, end)).then(function (good) {
            if (!good) throw new Error("wrong password")
            return crypto.subtle.decrypt({ name: "AES-CBC", iv: b.slice(4, 20) }, keys.aes, b.subarray(20, end))
        })
    }

    function unlockWithPassword(password) {
        return fetch("slides/key.json", { cache: "no-cache" }).then(okResponse).then(function (r) { return r.json() }).then(function (k) {
            return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
                .then(function (base) {
                    return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(k.salt), iterations: k.iterations }, base, 512)
                })
                .then(function (bits) { return importKeys(new Uint8Array(bits)) })
                .then(function (kek) { return openLocked(kek, b64ToBytes(k.wrapped).buffer) })
        }).then(function (master) {
            master = new Uint8Array(master)
            try { sessionStorage.setItem(SESSION_KEY, bytesToB64(master)) } catch (e) { /* private mode: unlock again next time */ }
            return loadSlides(master)
        })
    }

    function loadSlides(master) {
        return importKeys(master).then(function (keys) {
            return fetch("slides/index.enc", { cache: "no-cache" }).then(okResponse)
                .then(function (r) { return r.arrayBuffer() })
                .then(function (buf) { return openLocked(keys, buf) })
                .then(function (plain) {
                    slideKeys = keys
                    addSlides(JSON.parse(new TextDecoder().decode(plain)))
                })
        })
    }

    function addSlides(index) {
        var known = {}
        data.courses.forEach(function (c) { known[c.folder] = c })
        Object.keys(index.courses || {}).forEach(function (folder) {
            if (known[folder]) return
            var m = COURSE_RE.exec(folder)
            known[folder] = { folder: folder, code: m ? m[1].toUpperCase().replace(" ", "") : "", name: m ? m[2] : folder,
                              semester: index.courses[folder].semester || "", description: "" }
            data.courses.push(known[folder])
        })
        data.courses.sort(function (a, b) { return (a.code || "~").localeCompare(b.code || "~") || a.name.localeCompare(b.name) })
        ;(index.slides || []).forEach(function (s) {
            data.documents.push({ path: "", id: s.id, name: s.name, course: s.course, type: "Slides", title: s.title,
                                  description: "", semester: "", tags: [], ext: s.ext, size: s.size,
                                  added: s.added, updated: s.added, locked: true })
        })
        showStats()
        $("unlock").textContent = "🔓 Slides unlocked · Lock again"
        render()
    }

    function openSlide(doc, inBrowser, button) {
        var win = null
        if (inBrowser) {   // open the tab now, while the click still counts, then fill it once the file is unlocked
            win = window.open("", "_blank")
            if (win) { win.document.title = "Opening…"; win.document.body.textContent = "Unlocking " + doc.title + "…" }
        }
        var label = button.textContent
        button.textContent = "Unlocking…"
        fetch(data.slides.base + doc.id + ".bin").then(okResponse)
            .then(function (r) { return r.arrayBuffer() })
            .then(function (buf) { return openLocked(slideKeys, buf) })
            .then(function (plain) {
                var url = URL.createObjectURL(new Blob([plain], { type: MIME[doc.ext] || "application/octet-stream" }))
                if (win) { win.location.href = url; return }
                if (inBrowser) { location.href = url; return }   // new tabs blocked: show it here (Back returns, still unlocked)
                var a = document.createElement("a")
                a.href = url
                a.download = doc.name
                document.body.appendChild(a)
                a.click()
                a.remove()
                setTimeout(function () { URL.revokeObjectURL(url) }, 60000)
            })
            .catch(function () {
                if (win) win.close()
                alert("Couldn't open " + doc.title + ". Check your connection and try again.")
            })
            .then(function () { button.textContent = label })
    }

    function canUnlock() {
        return !!(data.slides && window.crypto && crypto.subtle && typeof $("unlock-dlg").showModal === "function")
    }
    function openUnlock() {
        if (slidesUnlocked() || !canUnlock()) return
        $("unlock-err").hidden = true
        $("unlock-pw").value = ""
        $("unlock-dlg").showModal()
    }

    function setupUnlock() {
        var btn = $("unlock"), dlg = $("unlock-dlg"), form = $("unlock-form"), pw = $("unlock-pw"), err = $("unlock-err"), go = $("unlock-go")
        if (!canUnlock()) return
        btn.hidden = false
        btn.addEventListener("click", function () {
            if (slideKeys) {   // already unlocked: lock again
                try { sessionStorage.removeItem(SESSION_KEY) } catch (e) {}
                location.reload()
                return
            }
            openUnlock()
        })
        $("unlock-cancel").addEventListener("click", function () { dlg.close() })
        $("unlock-request").addEventListener("click", function () { dlg.close(); openRequest(state.course) })
        form.addEventListener("submit", function (e) {
            e.preventDefault()
            go.disabled = true
            go.textContent = "Unlocking…"
            err.hidden = true
            unlockWithPassword(pw.value)
                .then(function () { dlg.close() })
                .catch(function (ex) {
                    err.textContent = /wrong password/.test(ex.message) ? "That password isn't right." : "Couldn't load the slides. Check your connection and try again."
                    err.hidden = false
                    pw.select()
                })
                .then(function () { go.disabled = false; go.textContent = "Unlock" })
        })
        var saved = null
        try { saved = sessionStorage.getItem(SESSION_KEY) } catch (e) {}
        if (saved) loadSlides(b64ToBytes(saved)).catch(function () { try { sessionStorage.removeItem(SESSION_KEY) } catch (e) {} })
    }

    /* ---------------- start ---------------- */
    readHash()
    $("q").value = state.q
    $("q").addEventListener("input", function (e) {
        state.q = e.target.value.trim()
        if (state.q) state.course = ""
        render()
    })
    $("q").addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.target.value = ""; state.q = ""; render(); e.target.blur() }
    })
    document.addEventListener("keydown", function (e) {
        var t = e.target.tagName
        if (e.key === "/" && t !== "INPUT" && t !== "TEXTAREA" && t !== "SELECT" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            $("q").focus()
        }
    })
    Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
        b.addEventListener("click", function () { state.sort = b.getAttribute("data-sort"); render() })
    })
    function goHome(e) {
        e.preventDefault()
        $("q").value = ""
        state.q = ""
        state.course = ""
        state.type = ""
        history.pushState(null, "", location.pathname + location.search + (state.sort === "code" ? "#sort=code" : ""))
        render()
    }
    $("home-link").addEventListener("click", goHome)
    $("back-link").addEventListener("click", goHome)
    window.addEventListener("hashchange", function () { readHash(); $("q").value = state.q; render() })
    window.addEventListener("popstate", function () { readHash(); $("q").value = state.q; render() })
    setupRequest()

    fetch("catalog.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(function (json) {
            data = json
            showStats()
            render()
            setupUnlock()
        })
        .catch(function () {
            $("stat-docs").textContent = "–"
            $("dashboard").innerHTML = ""
            $("dashboard").appendChild(empty("The list isn't available", "If you opened this file directly, run python tools/build_catalog.py and open _site/index.html through a local server."))
        })
})()
