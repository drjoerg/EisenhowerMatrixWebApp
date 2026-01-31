(() => {
  "use strict";

  // Version erhöhen, um alte LocalStorage-Daten sauber zu trennen
  const STORAGE_KEY = "eisenhower_matrix_tasks_v6";

  const QUADS = [
    { key: "q1", title: "Wichtig & dringend", colorVar: "--q1", className: "q1" },
    { key: "q2", title: "Wichtig & nicht dringend", colorVar: "--q2", className: "q2" },
    { key: "q3", title: "Nicht wichtig & dringend", colorVar: "--q3", className: "q3" },
    { key: "q4", title: "Nicht wichtig & nicht dringend", colorVar: "--q4", className: "q4" },
  ];

  const els = {
    grid: document.getElementById("grid"),

    globalText: document.getElementById("globalText"),
    globalDue: document.getElementById("globalDue"),
    globalQuad: document.getElementById("globalQuad"),
    globalAdd: document.getElementById("globalAdd"),

    saveBtn: document.getElementById("saveBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    fileInput: document.getElementById("fileInput"),
    clearBtn: document.getElementById("clearBtn"),
    autosave: document.getElementById("autosave"),
    hideDone: document.getElementById("hideDone"),

    saveState: document.getElementById("saveState"),
    lastSaved: document.getElementById("lastSaved"),
    dot: document.getElementById("dot"),

    menuBtn: document.getElementById("menuBtn"),
    footer: document.getElementById("footer"),
    aboutBtn: document.getElementById("aboutBtn"),
  };

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function defaultState() {
    return {
      version: 6,
      _lastSaved: null,
      _seq: 0,
      settings: { hideDone: false },
      q1: [],
      q2: [],
      q3: [],
      q4: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const st = JSON.parse(raw);
      if (!st || !st.q1 || !st.q2 || !st.q3 || !st.q4) return null;
      if (!st.settings) st.settings = { hideDone: false };
      return st;
    } catch {
      return null;
    }
  }

  let state = loadState() || defaultState();

  // UI status
  function setSavingUi(mode) {
    els.saveState.textContent = mode;
    if (mode === "gespeichert") {
      els.dot.style.background = "var(--ok)";
      els.dot.style.boxShadow = "0 0 0 4px rgba(45,212,191,.14)";
    } else if (mode === "speichere…") {
      els.dot.style.background = "var(--warn)";
      els.dot.style.boxShadow = "0 0 0 4px rgba(251,191,36,.14)";
    } else if (mode === "ungespeichert") {
      els.dot.style.background = "var(--bad)";
      els.dot.style.boxShadow = "0 0 0 4px rgba(251,113,133,.14)";
    } else {
      els.dot.style.background = "var(--neutral)";
      els.dot.style.boxShadow = "0 0 0 4px rgba(156,163,175,.14)";
    }
  }

  function saveStateToStorage({ quiet = false } = {}) {
    setSavingUi("speichere…");
    state._lastSaved = nowHHMM();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.lastSaved.textContent = state._lastSaved;
    setSavingUi("gespeichert");
    if (!quiet) openFooterTemporarily();
  }

  let autosaveTimer = null;
  function markDirtyAndMaybeAutosave() {
    setSavingUi("ungespeichert");
    if (!els.autosave.checked) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveStateToStorage({ quiet: true }), 500);
  }

  function dueSortKey(due) {
    return due || "9999-99-99";
  }

  function ensureOrder(task) {
    if (typeof task.order === "number") return;
    state._seq = (state._seq || 0) + 1;
    task.order = state._seq;
  }

  function sortTasks(arr) {
    return [...arr].sort((a, b) => {
      const da = dueSortKey(a.due);
      const db = dueSortKey(b.due);
      if (da < db) return -1;
      if (da > db) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  function getTaskIndexById(arr, id) {
    return arr.findIndex((t) => t.id === id);
  }

  function renumberOrders(key) {
    const arr = state[key] || [];
    let seq = state._seq || 0;
    for (const t of arr) {
      seq += 1;
      t.order = seq;
      if (!t.quadTitle) t.quadTitle = QUADS.find((q) => q.key === key)?.title || "";
    }
    state._seq = seq;
  }

  function moveTask({ fromKey, toKey, taskId, beforeTaskId = null }) {
    const fromArr = state[fromKey] || [];
    const toArr = state[toKey] || (state[toKey] = []);

    const idx = getTaskIndexById(fromArr, taskId);
    if (idx < 0) return;

    const [task] = fromArr.splice(idx, 1);
    task.quadTitle = QUADS.find((q) => q.key === toKey)?.title || task.quadTitle;
    ensureOrder(task);

    if (beforeTaskId) {
      const bIdx = getTaskIndexById(toArr, beforeTaskId);
      if (bIdx >= 0) {
        toArr.splice(bIdx, 0, task);
      } else {
        toArr.push(task);
      }
    } else {
      toArr.push(task);
    }

    renumberOrders(toKey);
    markDirtyAndMaybeAutosave();
    render();
  }

  // Drag & Drop robust
  let dragPayload = null; // { fromKey, taskId }

  function allowDrop(e) {
    // Muss sein, sonst verweigert Browser den Drop
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDragStart(e, fromKey, taskId) {
    dragPayload = { fromKey, taskId };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(dragPayload));
    e.currentTarget.classList.add("dragging");
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove("dragging");
    dragPayload = null;
    document.querySelectorAll(".tasks.dropTarget").forEach((u) => u.classList.remove("dropTarget"));
  }

  function readPayload(e) {
    // bevorzugt aus dataTransfer, fallback auf dragPayload
    try {
      const raw = e.dataTransfer.getData("text/plain");
      if (raw) return JSON.parse(raw);
    } catch {}
    return dragPayload;
  }

  function handleDropToList(e, toKey, beforeTaskId = null) {
    e.preventDefault();
    const p = readPayload(e);
    if (!p || !p.fromKey || !p.taskId) return;
    moveTask({ fromKey: p.fromKey, toKey, taskId: p.taskId, beforeTaskId });
  }

  // Rendering
  function render() {
    // Dropdown füllen
    if (!els.globalQuad.options.length) {
      for (const q of QUADS) {
        const opt = document.createElement("option");
        opt.value = q.key;
        opt.textContent = q.title;
        els.globalQuad.appendChild(opt);
      }
      els.globalQuad.value = "q1";
    }

    els.grid.innerHTML = "";

    for (const q of QUADS) {
      const section = document.createElement("section");
      section.className = `card ${q.className}`;
      section.innerHTML = `
        <div class="cardHead">
          <strong>${q.title}</strong>
          <span class="colorBadge" style="background: var(${q.colorVar});"></span>
        </div>
        <div class="cardBody" data-quad="${q.key}">
          <ul class="tasks" id="${q.key}_list" data-quad="${q.key}"></ul>
        </div>
      `;
      els.grid.appendChild(section);

      const list = section.querySelector(`#${q.key}_list`);
      const body = section.querySelector(`.cardBody[data-quad="${q.key}"]`);

      // Drop: sowohl auf Body als auch auf Liste
      for (const target of [list, body]) {
        target.addEventListener("dragover", (e) => { allowDrop(e); list.classList.add("dropTarget"); });
        target.addEventListener("dragleave", () => list.classList.remove("dropTarget"));
        target.addEventListener("drop", (e) => { list.classList.remove("dropTarget"); handleDropToList(e, q.key, null); });
      }

      const tasksSorted = sortTasks(state[q.key] || []);
      for (const task of tasksSorted) {
        ensureOrder(task);
        if (!task.id) task.id = uid();
        task.quadTitle = q.title;

        if (state.settings.hideDone && task.done) continue;

        const li = document.createElement("li");
        li.className = "task" + (task.done ? " done" : "");
        li.draggable = true;

        const meta = task.due ? `Datum: ${task.due}` : "Kein Datum";

        li.innerHTML = `
          <div class="tLeft">
            <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Erledigt" />
            <div class="tTextWrap">
              <div class="tText"></div>
              <div class="tMeta"><span>${meta}</span></div>
            </div>
          </div>
          <div class="tRight">
            <button class="iconBtn danger" title="Löschen" type="button">✕</button>
          </div>
        `;

        li.querySelector(".tText").textContent = task.text || "";

        // Drag start/end
        li.addEventListener("dragstart", (e) => onDragStart(e, q.key, task.id));
        li.addEventListener("dragend", onDragEnd);

        // Drop "vor" diese Aufgabe (Reorder innerhalb des Quadranten)
        li.addEventListener("dragover", allowDrop);
        li.addEventListener("drop", (e) => handleDropToList(e, q.key, task.id));

        // Done
        li.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
          task.done = !!e.target.checked;
          markDirtyAndMaybeAutosave();
          render();
        });

        // Delete
        li.querySelector('button[title="Löschen"]').addEventListener("click", () => {
          state[q.key] = (state[q.key] || []).filter((t) => t.id !== task.id);
          markDirtyAndMaybeAutosave();
          render();
        });

        list.appendChild(li);
      }
    }

    if (state._lastSaved) els.lastSaved.textContent = state._lastSaved;
  }

  // Add task
  function addGlobalTask() {
    const text = (els.globalText.value || "").trim();
    const due = els.globalDue.value || "";
    const key = els.globalQuad.value || "q1";
    if (!text) return;

    state[key] = state[key] || [];
    state._seq = (state._seq || 0) + 1;
    state[key].push({
      id: uid(),
      text,
      due,
      done: false,
      order: state._seq,
      quadTitle: QUADS.find((q) => q.key === key)?.title || "",
    });

    els.globalText.value = "";
    markDirtyAndMaybeAutosave();
    render();
  }

  // Export/Import
  function exportJSON() {
    const payload = { version: state.version, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eisenhower-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload || !payload.data) throw new Error("Ungültig");
        const st = payload.data;
        if (!st.q1 || !st.q2 || !st.q3 || !st.q4) throw new Error("Struktur fehlt");
        if (!st.settings) st.settings = { hideDone: false };

        state = st;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        els.hideDone.checked = !!state.settings.hideDone;
        setSavingUi("gespeichert");
        render();
      } catch {
        alert("Import fehlgeschlagen (keine gültige Sicherung).");
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm("Lokale Daten für diese App wirklich löschen?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    els.hideDone.checked = false;
    els.lastSaved.textContent = "–";
    setSavingUi("bereit");
    render();
  }

  // Footer
  let footerTimer = null;
  function toggleFooter() {
    els.footer.classList.toggle("open");
  }
  function openFooterTemporarily() {
    els.footer.classList.add("open");
    clearTimeout(footerTimer);
    footerTimer = setTimeout(() => els.footer.classList.remove("open"), 1500);
  }

  // Wire events
  els.globalAdd.addEventListener("click", addGlobalTask);
  els.globalText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addGlobalTask(); }
  });

  els.menuBtn.addEventListener("click", toggleFooter);
  els.saveBtn.addEventListener("click", () => saveStateToStorage());
  els.exportBtn.addEventListener("click", exportJSON);
  els.importBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSON(f);
    e.target.value = "";
  });
  els.clearBtn.addEventListener("click", clearAll);

  els.hideDone.addEventListener("change", () => {
    state.settings.hideDone = !!els.hideDone.checked;
    markDirtyAndMaybeAutosave();
    render();
  });

  els.aboutBtn.addEventListener("click", () => {
    alert(
      "Kurzinfo:\n" +
      "- Oben Aufgabe + Datum + Ziel-Quadrant.\n" +
      "- Drag&Drop innerhalb und zwischen Quadranten.\n" +
      "- Erledigte ausblenden per Toggle.\n" +
      "- Export/Import = Backup."
    );
  });

  // Init
  els.hideDone.checked = !!state.settings.hideDone;
  setSavingUi("bereit");
  if (state._lastSaved) els.lastSaved.textContent = state._lastSaved;
  render();
})();
