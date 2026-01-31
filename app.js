const STORAGE_KEY = "eisenhower_matrix_tasks_v5";

/* Quadranten – NUR Titel, keine Erklärungen */
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

  menuBtn: document.getElementById("menuBtn"),
  footer: document.getElementById("footer"),
};

function uid(){ return Math.random().toString(16).slice(2)+Date.now().toString(16); }
function nowHHMM(){
  const d=new Date();
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}

function defaultState(){
  return {
    _seq:0,
    _lastSaved:null,
    settings:{ hideDone:false },
    q1:[], q2:[], q3:[], q4:[]
  };
}

let state;
try{
  state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState();
}catch{
  state = defaultState();
}

els.hideDone.checked = !!state.settings.hideDone;

function setSavingUi(mode){
  els.saveState.textContent = mode;
}

function saveState(quiet=false){
  state._lastSaved = nowHHMM();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.lastSaved.textContent = state._lastSaved;
  setSavingUi("gespeichert");
  if (!quiet) openFooter();
}

let saveTimer=null;
function markDirty(){
  setSavingUi("ungespeichert");
  if (!els.autosave.checked) return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveState(true),400);
}

function render(){
  els.grid.innerHTML="";

  if (!els.globalQuad.options.length){
    QUADS.forEach(q=>{
      const o=document.createElement("option");
      o.value=q.key; o.textContent=q.title;
      els.globalQuad.appendChild(o);
    });
  }

  QUADS.forEach(q=>{
    const card=document.createElement("section");
    card.className=`card ${q.className}`;
    card.innerHTML=`
      <div class="cardHead">
        <strong>${q.title}</strong>
        <span class="colorBadge" style="background:var(${q.colorVar})"></span>
      </div>
      <div class="cardBody">
        <ul class="tasks"></ul>
      </div>
    `;
    els.grid.appendChild(card);

    const ul=card.querySelector("ul");
    ul.ondragover=e=>{e.preventDefault();};
    ul.ondrop=e=>{
      const id=e.dataTransfer.getData("id");
      moveTask(id,q.key);
    };

    (state[q.key]||[]).forEach(t=>{
      if (state.settings.hideDone && t.done) return;

      const li=document.createElement("li");
      li.className="task"+(t.done?" done":"");
      li.draggable=true;
      li.ondragstart=e=>e.dataTransfer.setData("id",t.id);

      li.innerHTML=`
        <div class="tLeft">
          <input type="checkbox" ${t.done?"checked":""}>
          <div class="tTextWrap">
            <div class="tText">${t.text}</div>
            <div class="tMeta">${t.due||""}</div>
          </div>
        </div>
        <div class="tRight">
          <button class="iconBtn danger">✕</button>
        </div>
      `;

      li.querySelector("input").onchange=e=>{
        t.done=e.target.checked;
        markDirty(); render();
      };
      li.querySelector("button").onclick=()=>{
        state[q.key]=state[q.key].filter(x=>x.id!==t.id);
        markDirty(); render();
      };

      ul.appendChild(li);
    });
  });

  els.lastSaved.textContent = state._lastSaved || "–";
}

function moveTask(id,to){
  for (const q of QUADS){
    const arr=state[q.key];
    const i=arr.findIndex(t=>t.id===id);
