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
        var v = viewUrl(doc), view = li.querySelector(".view"), dl = li.querySelector(".download")
        if (v) view.href = v
        else view.hidden = true
        dl.href = fileUrl(doc.path)
        dl.setAttribute("download", doc.path.split("/").pop())
        view.setAttribute("aria-label", "View " + doc.title)
        dl.setAttribute("aria-label", "Download " + doc.title)
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
            data.documents.slice().sort(function (a, b) { return b.added.localeCompare(a.added) }).slice(0, 4).forEach(function (d) {
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
            var total = data.documents.reduce(function (s, d) { return s + d.size }, 0)
            $("stats").textContent = data.documents.length + " documents · " + data.courses.length + " courses · " + fmtSize(total) +
                " · updated " + fmtDate(data.generated)
            data.courses.forEach(function (c) {
                var o = document.createElement("option")
                o.value = c.folder
                o.textContent = courseLabel(c)
                $("course").appendChild(o)
            })
            $("course").value = state.course
            render()
        })
        .catch(function () {
            $("stats").textContent = "The document list couldn't be loaded."
            $("list").innerHTML = '<div class="empty"><h2>The list isn\'t available</h2>' +
                "<p>If you opened this file directly, run <code>python tools/build_catalog.py</code> and open <code>_site/index.html</code> through a local server.</p></div>"
        })
})()
