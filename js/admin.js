/*
 * Admin mode: add and delete documents from the site itself.
 *
 * There is no server. Changes are made as commits to the GitHub repository through the GitHub API,
 * using a fine-grained access key that only the owner has (Contents: read and write, this repo only).
 * GitHub checks the key, so visitors can't change anything even though this script is public.
 * The key stays in the owner's browser. After a commit, the publish workflow rebuilds the site in
 * about two minutes; this script watches catalog.json and refreshes the page when it's done.
 */
;(function () {
    "use strict"
    var OWNER = "Israt24hub", REPO = "study-hub", BRANCH = "main"
    var API = "https://api.github.com/repos/" + OWNER + "/" + REPO
    var KEY = "studyhub-admin-key"
    var MAX_BYTES = 95 * 1000 * 1000   // GitHub refuses files of 100 MB or more
    var DEFAULT_TYPES = ["Notes", "Assignments", "Reports", "Lab Reports", "Papers", "Exams"]
    var $ = function (id) { return document.getElementById(id) }
    var SH = window.StudyHub
    if (!SH) return

    /* ---------------- the key ---------------- */
    function getKey() {
        try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) } catch (e) { return null }
    }
    function saveKey(key, remember) {
        try {
            sessionStorage.setItem(KEY, key)
            if (remember) localStorage.setItem(KEY, key)
            else localStorage.removeItem(KEY)
        } catch (e) {}
    }
    function forgetKey() {
        try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY) } catch (e) {}
    }

    function gh(method, url, body) {
        return fetch(url.indexOf("https://") === 0 ? url : API + url, {
            method: method,
            headers: {
                Authorization: "Bearer " + getKey(),
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        }).then(function (r) {
            if (r.status === 204) return null
            return r.json().catch(function () { return {} }).then(function (j) {
                if (!r.ok) {
                    var err = new Error(j.message || "HTTP " + r.status)
                    err.status = r.status
                    throw err
                }
                return j
            })
        })
    }
    function explain(err) {
        if (err.status === 401) return "GitHub didn't accept the key. It may have expired: make a new one."
        if (err.status === 403 || err.status === 404) return "This key can't change Study Hub. Give it access to the study-hub repository with Contents: Read and write."
        if (err.status === 422 && /too large|size/i.test(err.message)) return "A file is too large for GitHub (100 MB or more)."
        if (!err.status) return "Couldn't reach GitHub. Check your connection and try again."
        return "GitHub said: " + err.message
    }

    /* ---------------- signing in ---------------- */
    function enterAdmin() {
        document.body.classList.add("is-admin")
        if (SH.data().generated) SH.render()
    }
    function leaveAdmin() {
        forgetKey()
        document.body.classList.remove("is-admin")
        if (SH.data().generated) SH.render()
        SH.toast("Signed out of admin.")
    }
    function signIn(key, remember) {
        saveKey(key, false)
        return gh("GET", "https://api.github.com/user").then(function (user) {
            if (!user.login || user.login.toLowerCase() !== OWNER.toLowerCase()) {
                var e = new Error("This key belongs to @" + user.login + ", not the site owner.")
                e.status = 0
                e.custom = true
                throw e
            }
            return gh("GET", "")
        }).then(function () {
            saveKey(key, remember)
            enterAdmin()
        }).catch(function (e) {
            forgetKey()
            throw e
        })
    }

    /* ---------------- committing changes ----------------
       changes: [{ path, base64 } | { path, text } | { path, remove: true }]  → one commit */
    function commit(message, changes, attempt) {
        attempt = attempt || 1
        var headSha, baseTree
        return gh("GET", "/git/ref/heads/" + BRANCH).then(function (ref) {
            headSha = ref.object.sha
            return gh("GET", "/git/commits/" + headSha)
        }).then(function (c) {
            baseTree = c.tree.sha
            return Promise.all(changes.map(function (ch) {
                if (ch.remove) return Promise.resolve({ path: ch.path, mode: "100644", type: "blob", sha: null })
                var body = ch.base64 != null ? { content: ch.base64, encoding: "base64" } : { content: ch.text, encoding: "utf-8" }
                return gh("POST", "/git/blobs", body).then(function (b) {
                    return { path: ch.path, mode: "100644", type: "blob", sha: b.sha }
                })
            }))
        }).then(function (tree) {
            return gh("POST", "/git/trees", { base_tree: baseTree, tree: tree })
        }).then(function (t) {
            return gh("POST", "/git/commits", { message: message, tree: t.sha, parents: [headSha] })
        }).then(function (c) {
            return gh("PATCH", "/git/refs/heads/" + BRANCH, { sha: c.sha }).then(function () { return c })
        }).catch(function (e) {
            // someone else changed the repository at the same moment: start again from the new state
            if ((e.status === 422 || e.status === 409) && attempt < 3 && !/too large|size/i.test(e.message)) return commit(message, changes, attempt + 1)
            throw e
        })
    }

    function readText(path) {   // current text of a small file in the repository, or null
        return gh("GET", "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + BRANCH)
            .then(function (f) {
                var bin = atob(f.content.replace(/\s/g, "")), bytes = new Uint8Array(bin.length)
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                return new TextDecoder().decode(bytes)
            })
            .catch(function (e) { if (e.status === 404) return null; throw e })
    }
    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader()
            r.onload = function () { resolve(String(r.result).split(",")[1] || "") }
            r.onerror = function () { reject(r.error) }
            r.readAsDataURL(file)
        })
    }

    /* small CSV helpers for library.csv and courses.csv */
    function parseCsv(text) {
        var rows = [], row = [], cur = "", q = false
        text = (text || "").replace(/^﻿/, "")
        for (var i = 0; i < text.length; i++) {
            var ch = text[i]
            if (q) {
                if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
                else if (ch === '"') q = false
                else cur += ch
            } else if (ch === '"') q = true
            else if (ch === ",") { row.push(cur); cur = "" }
            else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && text[i + 1] === "\n") i++
                row.push(cur); rows.push(row); row = []; cur = ""
            } else cur += ch
        }
        if (cur !== "" || row.length) { row.push(cur); rows.push(row) }
        return rows.filter(function (r) { return r.length > 1 || r[0] !== "" })
    }
    function csvLine(cells) {
        return cells.map(function (c) {
            c = String(c == null ? "" : c)
            return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c
        }).join(",")
    }
    function toCsv(rows) { return rows.map(csvLine).join("\n") + "\n" }

    /* ---------------- after a change: wait for the rebuild ---------------- */
    var watching = null
    function watchForPublish() {
        var before = SH.data().generated
        var tries = 0
        clearInterval(watching)
        watching = setInterval(function () {
            if (++tries > 30) { clearInterval(watching); return }   // give up after ~10 minutes
            fetch("catalog.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null }).then(function (json) {
                if (!json || json.generated === before) return
                clearInterval(watching)
                SH.useCatalog(json)
                SH.toast("The site is updated.")
            }).catch(function () {})
        }, 20000)
    }

    /* ---------------- add ---------------- */
    var addDlg = $("add-dlg")
    function typesKnown() {
        var set = {}
        DEFAULT_TYPES.forEach(function (t) { set[t] = 1 })
        SH.data().documents.forEach(function (d) { if (!d.locked && d.type !== "Other") set[d.type] = 1 })
        return Object.keys(set).sort()
    }
    function openAdd(folder) {
        $("add-form").reset()
        var sel = $("add-course")
        sel.innerHTML = ""
        SH.data().courses.slice().sort(function (a, b) { return (a.code || "~").localeCompare(b.code || "~") }).forEach(function (c) {
            var o = document.createElement("option")
            o.value = c.folder
            o.textContent = SH.courseLabel(c)
            sel.appendChild(o)
        })
        var nc = document.createElement("option")
        nc.value = "__new"
        nc.textContent = "＋ New course…"
        sel.appendChild(nc)
        sel.value = folder || SH.state.course || sel.options[0].value
        var ts = $("add-type")
        ts.innerHTML = ""
        typesKnown().forEach(function (t) {
            var o = document.createElement("option")
            o.value = o.textContent = t
            ts.appendChild(o)
        })
        var nt = document.createElement("option")
        nt.value = "__new"
        nt.textContent = "＋ New type…"
        ts.appendChild(nt)
        ts.value = SH.state.type && SH.state.type !== "Slides" && typesKnown().indexOf(SH.state.type) !== -1 ? SH.state.type : "Notes"
        $("nc-year").value = new Date().getFullYear()
        syncAddForm()
        $("add-err").hidden = true
        $("add-progress").hidden = true
        $("add-go").disabled = false
        addDlg.showModal()
    }
    function syncAddForm() {
        var isNew = $("add-course").value === "__new"
        $("new-course").hidden = !isNew
        $("nc-code").required = $("nc-name").required = isNew
        var newType = $("add-type").value === "__new"
        $("add-type-new").hidden = !newType
        $("add-type-new").required = newType
        var files = $("add-files").files
        var list = $("picked")
        list.innerHTML = ""
        Array.prototype.forEach.call(files, function (f) {
            var li = document.createElement("li")
            li.textContent = f.name + " (" + (f.size < 1e6 ? Math.round(f.size / 1e3) + " KB" : (f.size / 1e6).toFixed(1) + " MB") + ")"
            if (f.size > MAX_BYTES) li.className = "too-big"
            list.appendChild(li)
        })
        $("drop-text").textContent = files.length ? files.length + (files.length === 1 ? " file chosen" : " files chosen") + ", click to change" : "Choose files, or drop them here"
        $("single-title").hidden = files.length !== 1
    }
    function cleanName(name) {
        return name.replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim()
    }
    function submitAdd(e) {
        e.preventDefault()
        var err = $("add-err"), prog = $("add-progress"), go = $("add-go")
        err.hidden = true
        var data = SH.data()
        var folder = $("add-course").value, course = null, newCourseRow = null
        if (folder === "__new") {
            var code = $("nc-code").value.trim().toUpperCase().replace(/\s+/g, ""), name = $("nc-name").value.trim()
            if (!/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) return fail("Course code should look like CSE332 or CSE225L.")
            folder = cleanName(code + " - " + name)
            var sem = $("nc-term").value ? $("nc-term").value + " " + $("nc-year").value : ""
            course = { folder: folder, code: code, name: name, semester: sem, description: $("nc-desc").value.trim() }
            newCourseRow = [folder, name, sem, course.description]
        } else {
            course = SH.courseOf(folder)
        }
        var type = $("add-type").value === "__new" ? cleanName($("add-type-new").value) : $("add-type").value
        if (!type) return fail("Choose a type.")
        if (/slide/i.test(type)) return fail("Teachers' slides must stay locked. Add them with the lock script, not here.")
        var files = Array.prototype.slice.call($("add-files").files)
        if (!files.length) return fail("Choose at least one file.")
        var big = files.filter(function (f) { return f.size > MAX_BYTES })
        if (big.length) return fail(big[0].name + " is too large. GitHub accepts files under 100 MB.")
        var paths = files.map(function (f) { return "files/" + folder + "/" + type + "/" + cleanName(f.name) })
        var existing = paths.filter(function (p) { return data.documents.some(function (d) { return d.path === p }) })
        if (existing.length && !confirm(existing.length + (existing.length === 1 ? " file has" : " files have") + " the same name as a document already there. Replace " + (existing.length === 1 ? "it" : "them") + "?")) return
        var title = files.length === 1 ? $("add-title-text").value.trim() : ""
        var desc = $("add-desc").value.trim()

        go.disabled = true
        prog.hidden = false
        var changes = []
        var i = 0
        function readNext() {
            if (i >= files.length) return Promise.resolve()
            prog.textContent = "Reading " + (i + 1) + " of " + files.length + ": " + files[i].name + "…"
            var f = files[i], p = paths[i]
            i++
            return fileToBase64(f).then(function (b64) { changes.push({ path: p, base64: b64 }) }).then(readNext)
        }
        readNext().then(function () {
            prog.textContent = "Uploading to GitHub…"
            var extra = []
            if (title || desc) extra.push(readText("library.csv").then(function (text) {
                var rows = parseCsv(text || "path,title,description,semester,tags\n")
                if (!rows.length) rows = [["path", "title", "description", "semester", "tags"]]
                paths.forEach(function (p, k) {
                    rows = rows.filter(function (r, n) { return n === 0 || r[0] !== p })
                    rows.push([p, k === 0 && title ? title : "", desc, "", ""])
                })
                changes.push({ path: "library.csv", text: toCsv(rows) })
            }))
            if (newCourseRow) extra.push(readText("courses.csv").then(function (text) {
                var rows = parseCsv(text || "folder,name,semester,description\n")
                if (!rows.length) rows = [["folder", "name", "semester", "description"]]
                rows = rows.filter(function (r, n) { return n === 0 || r[0] !== newCourseRow[0] })
                rows.push(newCourseRow)
                changes.push({ path: "courses.csv", text: toCsv(rows) })
            }))
            return Promise.all(extra)
        }).then(function () {
            var label = course ? (course.code || course.name) : folder
            return commit("Add " + files.length + (files.length === 1 ? " document" : " documents") + " to " + label + " (from the site)", changes)
        }).then(function () {
            // show them straight away, marked as publishing
            if (newCourseRow && !SH.courseOf(folder)) data.courses.push(course)
            data.documents = data.documents.filter(function (d) { return paths.indexOf(d.path) === -1 })
            files.forEach(function (f, k) {
                var nm = cleanName(f.name)
                data.documents.push({
                    path: paths[k], course: folder, type: type, title: (k === 0 && title) || nm.replace(/\.[^.]+$/, ""),
                    description: desc, semester: "", tags: [], ext: (nm.split(".").pop() || "").toLowerCase(),
                    size: f.size, added: new Date().toISOString(), updated: new Date().toISOString(), pending: true,
                })
            })
            addDlg.close()
            SH.render()
            SH.toast("Uploaded. The site will show " + (files.length === 1 ? "it" : "them") + " in about 2 minutes.")
            watchForPublish()
        }).catch(function (e2) {
            fail(e2.custom ? e2.message : explain(e2))
        }).then(function () {
            go.disabled = false
            prog.hidden = true
        })

        function fail(msg) {
            err.textContent = msg
            err.hidden = false
            return false
        }
    }

    /* ---------------- delete ---------------- */
    function deleteDoc(doc) {
        if (!document.body.classList.contains("is-admin") || doc.locked) return
        var c = SH.courseOf(doc.course)
        if (!confirm("Delete “" + doc.title + "”" + (c ? " from " + (c.code || c.name) : "") + "?\n\nIt disappears from the site in about 2 minutes. (It stays in the repository's history.)")) return
        SH.toast("Deleting…")
        readText("library.csv").then(function (text) {
            var changes = [{ path: doc.path, remove: true }]
            if (text) {
                var rows = parseCsv(text)
                var kept = rows.filter(function (r, n) { return n === 0 || r[0] !== doc.path })
                if (kept.length !== rows.length) changes.push({ path: "library.csv", text: toCsv(kept) })
            }
            return commit("Delete " + doc.path.split("/").pop() + " (from the site)", changes)
        }).then(function () {
            var data = SH.data()
            data.documents = data.documents.filter(function (d) { return d.path !== doc.path })
            SH.render()
            SH.toast("Deleted. The site will update in about 2 minutes.")
            watchForPublish()
        }).catch(function (e) {
            SH.toast("Couldn't delete: " + explain(e))
        })
    }

    /* ---------------- wiring ---------------- */
    var adminDlg = $("admin-dlg")
    $("admin-link").addEventListener("click", function () {
        if (document.body.classList.contains("is-admin")) return
        if (typeof adminDlg.showModal !== "function") return
        $("admin-err").hidden = true
        $("admin-token").value = ""
        adminDlg.showModal()
    })
    $("admin-cancel").addEventListener("click", function () { adminDlg.close() })
    $("admin-form").addEventListener("submit", function (e) {
        e.preventDefault()
        var go = $("admin-go")
        go.disabled = true
        go.textContent = "Checking…"
        signIn($("admin-token").value.trim(), $("admin-remember").checked).then(function () {
            adminDlg.close()
            SH.toast("Signed in as admin. You can now add and delete documents.")
        }).catch(function (err) {
            $("admin-err").textContent = err.custom ? err.message : explain(err)
            $("admin-err").hidden = false
        }).then(function () {
            go.disabled = false
            go.textContent = "Sign in"
        })
    })
    $("admin-signout").addEventListener("click", leaveAdmin)
    Array.prototype.forEach.call(document.querySelectorAll(".add-docs"), function (b) {
        b.addEventListener("click", function () { openAdd(b.id === "course-add" ? SH.state.course : "") })
    })
    $("add-cancel").addEventListener("click", function () { addDlg.close() })
    $("add-course").addEventListener("change", syncAddForm)
    $("add-type").addEventListener("change", syncAddForm)
    $("add-files").addEventListener("change", syncAddForm)
    $("add-form").addEventListener("submit", submitAdd)
    var drop = $("drop")
    ;["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over") }) })
    ;["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("over") }) })
    drop.addEventListener("drop", function (e) {
        e.preventDefault()
        if (e.dataTransfer && e.dataTransfer.files.length) {
            $("add-files").files = e.dataTransfer.files
            syncAddForm()
        }
    })
    document.addEventListener("studyhub:delete", function (e) { deleteDoc(e.detail) })

    // still signed in from earlier (this tab, or "remember on this device")
    if (getKey()) enterAdmin()
})()
