const STORAGE_KEY = "eisenhower_matrix_tasks_v4";

const QUADS = [
  { key:"q1", title:"Wichtig & dringend", colorVar:"--q1", className:"q1" },
  { key:"q2", title:"Wichtig & nicht dringend", colorVar:"--q2", className:"q2" },
  { key:"q3", title:"Nicht wichtig & dringend", colorVar:"--q3", className:"q3" },
  { key:"q4", title:"Nicht wichtig & nicht dringend", colorVar:"--q4", className:"q4" },
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

  aboutLink: document.getElementById("aboutLink"),
  menuBtn: document.getElementById("menuBtn"),
  footer: document.getElementById("footer"),
};

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function nowHHMM(){
  const d=new Date();
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function defaultState(){
  return {
    version:4,
    _lastSaved:null,
    _seq:0,
    settings:{ hideDone:false },
    q1:[], q2:[], q3:[], q4:[]
  };
}

let state = loadState() || defaultState();
if (!state.settings) state.settings = { hideDone:false };
els.hideDone.checked = !!state.settings.hideDone;

function setSavingUi(mode){
  els.saveState.textContent = mode;
  if (mode==="gespeichert"){
    els.dot.style.background = "var(--ok)";
    els.dot.style.boxShadow = "0 0 0 4px rgba(45,212,191,.14)";
  } else if (mode==="speichere…"){
    els.dot.style.background = "var(--warn)";
    els.dot.style.boxShadow = "0 0 0 4px rgba(251,191,36,.14)";
  } else if (mode==="ungespeichert"){
    els.dot.style.background = "var(--bad)";
    els.dot.style.boxShadow = "0 0 0 4px rgba(251,113,133,.14)";
  } else {
    els.dot.style.background = "var(--neutral)";
    els.dot.style.boxShadow = "0 0 0 4px rgba(156,163,175,.14)";
  }
}

function saveStateToStorage({quiet=false}={}){
  setSavingUi("speichere…");
  state._lastSaved = nowHHMM();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.lastSaved.textContent = state._lastSaved;
  setSavingUi("gespeichert");
  if (!quiet) openFooterTemporarily();
}

let t=null;
function markDirtyAndMaybeAutosave(){
  setSavingUi("ungespeichert");
  if (!els.autosave.checked) return;
  clearTimeout(t);
  t=setTimeout(()=>saveStateToStorage({quiet:true}), 500);
}

function dueSortKey(due){
  if (!due) return "9999-99-99";
  return due;
}

function sortTasks(arr){
  return [...arr].sort((a,b)=>{
    const da = dueSortKey(a.due);
    const db = dueSortKey(b.due);
    if (da<db) return -1;
    if (da>db) return 1;
    const oa = (a.order ?? 0);
    const ob = (b.order ?? 0);
    return oa - ob;
  });
}

function ensureOrder(task){
  if (typeof task.order === "number") return;
  state._seq = (state._seq || 0) + 1;
  task.order = state._seq;
}

function toGoogleDateTimeUTC(dateStr, timeStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);
  const local = new Date(y, (m-1), d, hh, mm, 0);
  const pad = (n)=> String(n).padStart(2,"0");
  return (
    String(local.getUTCFullYear()).padStart(4,"0") +
    pad(local.getUTCMonth()+1) +
    pad(local.getUTCDate()) + "T" +
    pad(local.getUTCHours()) +
    pad(local.getUTCMinutes()) +
    "00Z"
  );
}

function googleCalendarUrl(task, timeStr, durationMin){
  const text = (task.text || "Aufgabe").trim();
  const details = task.quadTitle ? `Quadrant: ${task.quadTitle}` : "Eisenhower-Matrix";

  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const date = task.due || new Date().toISOString().slice(0,10);
  const time = timeStr || "09:00";
  const dur = Number(durationMin || 30);

  const [y,m,d] = date.split("-").map(Number);
  const [hh,mm] = time.split(":").map(Number);
  const startLocal = new Date(y, m-1, d, hh, mm, 0);
  const endLocal = new Date(startLocal.getTime() + dur*60*1000);

  const pad = (n)=> String(n).padStart(2,"0");
  const endDateStr =
    String(endLocal.getFullYear()).padStart(4,"0") + "-" +
    pad(endLocal.getMonth()+1) + "-" +
    pad(endLocal.getDate());
  const endTimeStr = pad(endLocal.getHours()) + ":" + pad(endLocal.getMinutes());

  const dates = `${toGoogleDateTimeUTC(date, time)}/${toGoogleDateTimeUTC(endDateStr, endTimeStr)}`;
  return `${base}&text=${encodeURIComponent(text)}&details=${encodeURIComponent(details)}&dates=${encodeURIComponent(dates)}`;
}

function promptTimeAndDuration(task){
  const date = task.due || new Date().toISOString().slice(0,10);
  const time = prompt(`Uhrzeit für "${task.text}" am ${date} (HH:MM)`, "09:00");
  if (time === null) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) {
    alert("Bitte Uhrzeit im Format HH:MM eingeben (z. B. 09:00).");
    return null;
  }
  const dur = prompt("Dauer in Minuten", "30");
  if (dur === null) return null;
  const durNum = Number(dur);
  if (!Number.isFinite(durNum) || durNum < 5) {
    alert("Bitte eine Dauer (Minuten) >= 5 eingeben.");
    return null;
  }
  return { time, dur: Math.round(durNum) };
}

// Drag & Drop (inkl. Reorder innerhalb des Quadranten)
let dragPayload = null; // { fromKey, taskId }
function onDragStart(e, fromKey, taskId){
  dragPayload = { fromKey, taskId };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", JSON.stringify(dragPayload));
  e.currentTarget.classList.add("dragging");
}
function onDragEnd(e){
  e.currentTarget.classList.remove("dragging");
  dragPayload = null;
  document.querySelectorAll("ul.tasks.dropTarget").forEach(u=>u.classList.remove("dropTarget"));
}

function getTaskIndexById(arr, id){ return arr.findIndex(t=>t.id===id); }

function moveTask({fromKey, toKey, taskId, beforeTaskId=null}){
  if (!fromKey || !toKey || !taskId) return;

  const fromArr = state[fromKey] || [];
  const idx = getTaskIndexById(fromArr, taskId);
  if (idx<0) return;

  const [task] = fromArr.splice(idx,1);
  task.quadTitle = QUADS.find(q=>q.key===toKey)?.title || task.quadTitle;
  ensureOrder(task);

  const toArr = state[toKey] || (state[toKey]=[]);
  if (beforeTaskId){
    const bIdx = getTaskIndexById(toArr, beforeTaskId);
    if (bIdx >= 0){
      toArr.splice(bIdx,0,task);
      renumberOrders(toKey);
      return;
    }
  }
  toArr.push(task);
  renumberOrders(toKey);
}

function renumberOrders(key){
  const arr = state[key] || [];
  let seq = state._seq || 0;
  for (const t of arr){
    seq += 1;
    t.order = seq;
    if (!t.quadTitle) t.quadTitle = QUADS.find(q=>q.key===key)?.title || "";
  }
  state._seq = seq;
  markDirtyAndMaybeAutosave();
  render();
}

function allowDrop(e){ e.preventDefault(); e.dataTransfer.dropEffect = "move"; }

function handleDropToList(e, toKey){
  e.preventDefault();
  const raw = e.dataTransfer.getData("text/plain");
  let p = dragPayload;
  try{ if (raw) p = JSON.parse(raw); }catch{}
  if (!p) return;
  moveTask({ fromKey:p.fromKey, toKey, taskId:p.taskId, beforeTaskId:null });
}

function handleDropBeforeTask(e, toKey, beforeTaskId){
  e.preventDefault();
  const raw = e.dataTransfer.getData("text/plain");
  let p = dragPayload;
  try{ if (raw) p = JSON.parse(raw); }catch{}
  if (!p) return;
  moveTask({ fromKey:p.fromKey, toKey, taskId:p.taskId, beforeTaskId });
}

function render(){
  if (!els.globalQuad.options.length){
    for (const q of QUADS){
      const opt = document.createElement("option");
      opt.value = q.key;
      opt.textContent = q.title;
      els.globalQuad.appendChild(opt);
    }
    els.globalQuad.value = "q1";
  }

  els.grid.innerHTML = "";

  for (const q of QUADS){
    const section = document.createElement("section");
    section.className = `card ${q.className}`;
    section.innerHTML = `
      <div class="cardHead">
        <div class="label">
          <strong>${q.title}</strong>
          <div class="hint">${q.hint}</div>
        </div>
        <span class="colorBadge" style="background: var(${q.colorVar});"></span>
      </div>
      <div class="cardBody">
        <ul class="tasks" id="${q.key}_list" data-quad="${q.key}"></ul>
      </div>
    `;
    els.grid.appendChild(section);

    const list = section.querySelector(`#${q.key}_list`);

    list.addEventListener("dragover", (e)=>{ allowDrop(e); list.classList.add("dropTarget"); });
    list.addEventListener("dragleave", ()=> list.classList.remove("dropTarget"));
    list.addEventListener("drop", (e)=>{ list.classList.remove("dropTarget"); handleDropToList(e, q.key); });

    const tasksSorted = sortTasks(state[q.key] || []);
    for (const task of tasksSorted){
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
          <input type="checkbox" ${task.done ? "checked":""} aria-label="Erledigt" />
          <div class="tTextWrap">
            <div class="tText"></div>
            <div class="tMeta"><span>${meta}</span></div>
          </div>
        </div>
        <div class="tRight">
          <button class="iconBtn" title="In Google Kalender eintragen">📅</button>
          <button class="iconBtn danger" title="Löschen">✕</button>
        </div>
      `;
      li.querySelector(".tText").textContent = task.text || "";

      li.addEventListener("dragstart", (e)=> onDragStart(e, q.key, task.id));
      li.addEventListener("dragend", onDragEnd);
      li.addEventListener("dragover", (e)=> allowDrop(e));
      li.addEventListener("drop", (e)=> handleDropBeforeTask(e, q.key, task.id));

      li.querySelector('input[type="checkbox"]').addEventListener("change", (e)=>{
        task.done = !!e.target.checked;
        markDirtyAndMaybeAutosave();
        render();
      });

      li.querySelector('button[title="In Google Kalender eintragen"]').addEventListener("click", ()=>{
        const res = promptTimeAndDuration(task);
        if (!res) return;
        const url = googleCalendarUrl(task, res.time, res.dur);
        window.open(url, "_blank", "noopener");
      });

      li.querySelector('button[title="Löschen"]').addEventListener("click", ()=>{
        state[q.key] = (state[q.key] || []).filter(t=>t.id!==task.id);
        markDirtyAndMaybeAutosave();
        render();
      });

      list.appendChild(li);
    }
  }

  if (state._lastSaved) els.lastSaved.textContent = state._lastSaved;
}

function addGlobalTask(){
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
    done:false,
    order: state._seq,
    quadTitle: QUADS.find(q=>q.key===key)?.title || ""
  });

  els.globalText.value = "";
  markDirtyAndMaybeAutosave();
  render();
}

function exportJSON(){
  const payload = { version: 4, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eisenhower-backup-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const payload = JSON.parse(reader.result);
      if (!payload || !payload.data) throw new Error("Ungültig");
      state = payload.data;
      if (!state.q1 || !state.q2 || !state.q3 || !state.q4) throw new Error("Struktur fehlt");
      if (!state.settings) state.settings = { hideDone:false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      els.hideDone.checked = !!state.settings.hideDone;
      setSavingUi("gespeichert");
      render();
    }catch{
      alert("Import fehlgeschlagen (keine gültige Sicherung).");
    }
  };
  reader.readAsText(file);
}

function clearAll(){
  if (!confirm("Lokale Daten für diese App wirklich löschen?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  els.hideDone.checked = false;
  els.lastSaved.textContent = "–";
  setSavingUi("bereit");
  render();
}

let footerTimer = null;
function toggleFooter(){ els.footer.classList.toggle("open"); }
function openFooterTemporarily(){
  els.footer.classList.add("open");
  clearTimeout(footerTimer);
  footerTimer = setTimeout(()=> els.footer.classList.remove("open"), 1500);
}

els.globalAdd.addEventListener("click", addGlobalTask);
els.globalText.addEventListener("keydown", (e)=>{
  if (e.key==="Enter"){ e.preventDefault(); addGlobalTask(); }
});

els.menuBtn.addEventListener("click", toggleFooter);
els.saveBtn.addEventListener("click", ()=> saveStateToStorage());
els.exportBtn.addEventListener("click", exportJSON);
els.importBtn.addEventListener("click", ()=> els.fileInput.click());
els.fileInput.addEventListener("change", (e)=>{
  const f = e.target.files && e.target.files[0];
  if (f) importJSON(f);
  e.target.value = "";
});
els.clearBtn.addEventListener("click", clearAll);

els.hideDone.addEventListener("change", ()=>{
  state.settings.hideDone = !!els.hideDone.checked;
  markDirtyAndMaybeAutosave();
  render();
});

els.aboutLink.addEventListener("click", ()=>{
  alert(
    "Kurzinfo:\n" +
    "- Oben neue Aufgabe + Datum + Ziel-Quadrant.\n" +
    "- Sortierung nach Datum (ohne Uhrzeit-Felder).\n" +
    "- Drag&Drop zwischen Quadranten und Reorder in Listen.\n" +
    "- 📅 fragt Uhrzeit/Dauer ab und öffnet Google Kalender.\n" +
    "- Export/Import = Backup."
  );
});

// PWA: Service Worker registrieren
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

if (state._lastSaved) els.lastSaved.textContent = state._lastSaved;
setSavingUi("bereit");
render();
