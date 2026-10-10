;(function () {
    "use strict"
    var state = { q: "", type: "", course: "", sort: "course" }
    var data = { courses: [], documents: [] }
    var $ = function (id) { return document.getElementById(id) }

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
        return { folder: folder, code: "", name: folder }
    }
    function courseLabel(c) { return c.code && c.name ? c.code + " · " + c.name : c.code || c.name }

    /* ---------------- state ↔ URL ---------------- */
    function readHash() {
        var params = new URLSearchParams(location.hash.slice(1))
        state.q = params.get("q") || ""
        state.type = params.get("type") || ""
        state.course = params.get("course") || ""
        state.sort = params.get("sort") || "course"
    }
    function writeHash() {
        var params = new URLSearchParams()
        Object.keys(state).forEach(function (k) { if (state[k] && !(k === "sort" && state[k] === "course")) params.set(k, state[k]) })
        var h = params.toString()
        history.replaceState(null, "", h ? "#" + h : location.pathname + location.search)
    }

    /* ---------------- filtering ---------------- */
    function matches(doc) {
        if (state.type && doc.type !== state.type) return false
        if (state.course && doc.course !== state.course) return false
        if (!state.q) return true
        var c = courseOf(doc.course)
        var hay = [doc.title, doc.description, doc.type, doc.semester, c.code, c.name, doc.tags.join(" "), doc.path].join(" ").toLowerCase()
        return state.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1 })
    }

    function row(doc, showCourse) {
        var li = $("row-tpl").content.firstElementChild.cloneNode(true)
        var ext = li.querySelector(".ext")
        ext.textContent = doc.ext || "file"
        ext.classList.add(doc.ext)
        li.querySelector(".doc-title").textContent = doc.title
        li.querySelector(".doc-desc").textContent = doc.description
        var meta = li.querySelector(".doc-meta")
        var badge = document.createElement("span")
        badge.className = "badge"
        badge.textContent = doc.type
        meta.appendChild(badge)
        var bits = []
        if (showCourse) bits.push(courseLabel(courseOf(doc.course)))
        if (doc.semester) bits.push(doc.semester)
        bits.push(fmtSize(doc.size))
        bits.push("added " + fmtDate(doc.added))
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

    function render() {
        writeHash()
        var docs = data.documents.filter(matches)
        var list = $("list")
        list.innerHTML = ""

        // type chips (counts follow the course + search filters)
        var counts = {}
        data.documents.forEach(function (d) {
            var saved = state.type; state.type = ""
            if (matches(d)) counts[d.type] = (counts[d.type] || 0) + 1
            state.type = saved
        })
        var types = $("types")
        types.innerHTML = ""
        ;[""].concat(Object.keys(counts).sort()).forEach(function (t) {
            var b = document.createElement("button")
            b.type = "button"
            b.setAttribute("aria-pressed", state.type === t ? "true" : "false")
            var n = t ? counts[t] : Object.keys(counts).reduce(function (s, k) { return s + counts[k] }, 0)
            b.innerHTML = (t || "All") + "<span>" + n + "</span>"
            b.addEventListener("click", function () { state.type = t; render() })
            types.appendChild(b)
        })

        // recently added: only on the unfiltered home view
        var plain = !state.q && !state.type && !state.course && state.sort === "course" && data.documents.length > 6
        $("recent").hidden = !plain
        if (plain) {
            var rl = $("recent-list")
            rl.innerHTML = ""
            data.documents.filter(function (d) { return !d.locked }).sort(function (a, b) { return b.added.localeCompare(a.added) }).slice(0, 4).forEach(function (d) {
                var li = document.createElement("li"), a = document.createElement("a")
                a.href = viewUrl(d) || fileUrl(d.path)
                a.target = "_blank"
                a.rel = "noopener"
                a.innerHTML = "<b></b><small></small>"
                a.querySelector("b").textContent = d.title
                a.querySelector("small").textContent = courseLabel(courseOf(d.course)) + " · " + d.type
                li.appendChild(a)
                rl.appendChild(li)
            })
        }

        if (!data.documents.length) {
            list.innerHTML = '<div class="empty"><h2>No documents yet</h2>' +
                "<p>Upload files into a course folder, for example <code>files/CSE445 - Machine Learning/Notes/</code>. " +
                "The site rebuilds itself and they appear here within a few minutes.</p></div>"
            return
        }
        if (!docs.length) {
            list.innerHTML = '<div class="empty"><h2>Nothing matches</h2><p>Try a different word, or clear the filters.</p></div>'
            return
        }

        if (state.sort === "course") {
            data.courses.forEach(function (c) {
                var mine = docs.filter(function (d) { return d.course === c.folder })
                if (!mine.length) return
                var sec = document.createElement("section")
                sec.className = "course"
                sec.id = "course-" + c.folder.replace(/[^A-Za-z0-9]+/g, "-")
                var head = document.createElement("div")
                head.className = "course-head"
                if (c.code) {
                    var code = document.createElement("span")
                    code.className = "code"
                    code.textContent = c.code
                    head.appendChild(code)
                }
                var h = document.createElement("h2")
                h.textContent = c.name || c.code
                head.appendChild(h)
                var count = document.createElement("span")
                count.className = "count"
                count.textContent = mine.length + (mine.length === 1 ? " document" : " documents") + (c.semester ? " · " + c.semester : "")
                head.appendChild(count)
                sec.appendChild(head)
                if (c.description) {
                    var p = document.createElement("p")
                    p.className = "course-desc"
                    p.textContent = c.description
                    sec.appendChild(p)
                }
                var ul = document.createElement("ul")
                ul.className = "docs"
                mine.sort(function (a, b) { return a.type.localeCompare(b.type) || a.title.localeCompare(b.title, undefined, { numeric: true }) })
                    .forEach(function (d) { ul.appendChild(row(d, false)) })
                sec.appendChild(ul)
                list.appendChild(sec)
            })
        } else {
            var ul = document.createElement("ul")
            ul.className = "docs"
            docs.sort(state.sort === "new"
                ? function (a, b) { return b.added.localeCompare(a.added) }
                : function (a, b) { return a.title.localeCompare(b.title, undefined, { numeric: true }) })
                .forEach(function (d) { ul.appendChild(row(d, true)) })
            list.appendChild(ul)
        }
    }

    function showStats() {
        var total = data.documents.reduce(function (s, d) { return s + d.size }, 0)
        $("stats").textContent = data.documents.length + " documents · " + data.courses.length + " courses · " + fmtSize(total) +
            " · updated " + fmtDate(data.generated)
    }
    function fillCourses() {
        var sel = $("course")
        while (sel.options.length > 1) sel.remove(1)
        data.courses.forEach(function (c) {
            var o = document.createElement("option")
            o.value = c.folder
            o.textContent = courseLabel(c)
            sel.appendChild(o)
        })
        sel.value = state.course
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
        fillCourses()
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

    function setupUnlock() {
        var btn = $("unlock"), dlg = $("unlock-dlg"), form = $("unlock-form"), pw = $("unlock-pw"), err = $("unlock-err"), go = $("unlock-go")
        if (!data.slides || !window.crypto || !crypto.subtle || typeof dlg.showModal !== "function") return
        btn.hidden = false
        btn.addEventListener("click", function () {
            if (slideKeys) {   // already unlocked: lock again
                try { sessionStorage.removeItem(SESSION_KEY) } catch (e) {}
                location.reload()
                return
            }
            err.hidden = true
            pw.value = ""
            dlg.showModal()
        })
        $("unlock-cancel").addEventListener("click", function () { dlg.close() })
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
    $("sort").value = state.sort
    $("q").addEventListener("input", function (e) { state.q = e.target.value.trim(); render() })
    $("course").addEventListener("change", function (e) { state.course = e.target.value; render() })
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; render() })

    fetch("catalog.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(function (json) {
            data = json
            showStats()
            fillCourses()
            render()
            setupUnlock()
        })
        .catch(function () {
            $("stats").textContent = "The document list couldn't be loaded."
            $("list").innerHTML = '<div class="empty"><h2>The list isn\'t available</h2>' +
                "<p>If you opened this file directly, run <code>python tools/build_catalog.py</code> and open <code>_site/index.html</code> through a local server.</p></div>"
        })
})()
