// -------------------------
// Helpers
// -------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const pad2 = (n) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
};
const nowHHMM = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const safeParseTimes = (txt) => {
  return (txt || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => {
      const m = t.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      return m ? t : null;
    })
    .filter(Boolean);
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const downloadText = (filename, text) => {
  const blob = new Blob([text], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const parseHHMMToMinutes = (hhmm) => {
  const m = (hhmm || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if(!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// -------------------------
// Theme
// -------------------------
const THEME_KEY = "saude_theme_v1";
const applyTheme = (t) => {
  document.documentElement.dataset.theme = t;
  $("#btnTheme").textContent = (t === "light") ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, t);
};
applyTheme(localStorage.getItem(THEME_KEY) || "dark");

$("#btnTheme").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});

// -------------------------
// Profiles (modo cuidador)
// Cada perfil tem seu próprio estado.
// -------------------------
const PROFILES_KEY = "saude_profiles_v1";
const currentProfileKey = "saude_current_profile_v1";
const stateKeyFor = (profileId) => `saude_state_v2_${profileId}`;

const loadProfiles = () => {
  const raw = localStorage.getItem(PROFILES_KEY);
  if(!raw){
    const first = { id: uid(), name: "Meu Perfil" };
    localStorage.setItem(PROFILES_KEY, JSON.stringify([first]));
    localStorage.setItem(currentProfileKey, first.id);
    return [first];
  }
  try{
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : [{id: uid(), name: "Meu Perfil"}];
  }catch{
    return [{id: uid(), name: "Meu Perfil"}];
  }
};

const saveProfiles = (profiles) => localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

let profiles = loadProfiles();
let currentProfileId = localStorage.getItem(currentProfileKey) || profiles[0].id;

// -------------------------
// Default state model
// -------------------------
const DEFAULTS = {
  version: 2,
  waterGoal: 2000,
  waterConfig: {
    wakeTime: "07:00",
    sleepTime: "23:00",
    slackMl: 250
  },
  meds: [
    // {id, name, dose, times:[HH:MM], stock: number|null, perDose: number|null, lowAlert:number|null}
  ],
  day: {
    key: todayKey(),
    waterToday: 0,
    waterLog: [],   // {ts, ml}
    taken: {}       // slotId -> {ts, autoDecremented:boolean}
  }
};

const mergeDefaults = (s) => {
  const out = structuredClone(DEFAULTS);
  if(s && typeof s === "object"){
    if(typeof s.waterGoal === "number") out.waterGoal = s.waterGoal;
    if(s.waterConfig && typeof s.waterConfig === "object"){
      out.waterConfig = {...out.waterConfig, ...s.waterConfig};
    }
    if(Array.isArray(s.meds)) out.meds = s.meds;
    if(s.day && typeof s.day === "object"){
      out.day = {...out.day, ...s.day};
      if(!Array.isArray(out.day.waterLog)) out.day.waterLog = [];
      if(!out.day.taken || typeof out.day.taken !== "object") out.day.taken = {};
      if(!out.day.key) out.day.key = todayKey();
    }
  }
  return out;
};

const loadState = () => {
  const raw = localStorage.getItem(stateKeyFor(currentProfileId));
  if(!raw) return structuredClone(DEFAULTS);
  try { return mergeDefaults(JSON.parse(raw)); }
  catch { return structuredClone(DEFAULTS); }
};

let state = loadState();

const saveState = () => localStorage.setItem(stateKeyFor(currentProfileId), JSON.stringify(state));

const ensureToday = () => {
  const k = todayKey();
  if(state.day.key !== k){
    state.day = { key: k, waterToday: 0, waterLog: [], taken: {} };
    saveState();
  }
};
ensureToday();

// -------------------------
// PWA Install
// -------------------------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#btnInstall").hidden = false;
});
$("#btnInstall").addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#btnInstall").hidden = true;
});

// -------------------------
// Notifications helper
// -------------------------
const notify = async (title, body) => {
  if(!("Notification" in window)){
    alert(`${title}\n\n${body}`);
    return;
  }
  if(Notification.permission !== "granted"){
    // fallback
    // (evita spam de alerta; só chama alert quando usuário pedir algo)
    return;
  }
  try{
    new Notification(title, { body });
  } catch {
    // iOS pode bloquear; sem fallback agressivo
  }
};

$("#btnNotify").addEventListener("click", async () => {
  if(!("Notification" in window)){
    alert("Seu navegador não suporta notificações.");
    return;
  }
  const perm = await Notification.requestPermission();
  if(perm === "granted"){
    alert("Notificações ativadas ✅\nObs.: funciona melhor com o app aberto.");
    try{ new Notification("Saúde", { body: "Notificações ativadas ✅" }); } catch {}
  } else {
    alert("Permissão negada. Você ainda pode usar o checklist e o painel do próximo remédio.");
  }
});

// -------------------------
// Profiles UI
// -------------------------
const renderProfiles = () => {
  const sel = $("#profileSelect");
  sel.innerHTML = "";
  profiles.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.value = currentProfileId;
};

$("#profileSelect").addEventListener("change", () => {
  currentProfileId = $("#profileSelect").value;
  localStorage.setItem(currentProfileKey, currentProfileId);
  state = loadState();
  ensureToday();
  renderAll();
});

$("#btnAddProfile").addEventListener("click", () => {
  const name = prompt("Nome do perfil (ex: Mãe, Pai, Fabio):");
  if(!name || !name.trim()) return;
  const p = { id: uid(), name: name.trim() };
  profiles.push(p);
  saveProfiles(profiles);
  currentProfileId = p.id;
  localStorage.setItem(currentProfileKey, currentProfileId);
  state = loadState();
  saveState();
  renderProfiles();
  renderAll();
});

// -------------------------
// Water
// -------------------------
const renderWater = () => {
  $("#waterGoalLbl").textContent = state.waterGoal;
  $("#waterTodayLbl").textContent = state.day.waterToday;

  const pct = state.waterGoal > 0 ? Math.min(100, Math.round((state.day.waterToday / state.waterGoal) * 100)) : 0;
  $("#waterBar").style.width = `${pct}%`;

  // pace
  const paceBox = $("#waterPace");
  const wake = parseHHMMToMinutes(state.waterConfig.wakeTime);
  const sleep = parseHHMMToMinutes(state.waterConfig.sleepTime);
  const now = parseHHMMToMinutes(nowHHMM());

  if(state.waterGoal <= 0 || wake === null || sleep === null || now === null){
    paceBox.textContent = "";
  } else {
    // se a janela atravessa meia-noite, ajusta
    let start = wake, end = sleep, cur = now;
    if(end <= start) end += 24*60;
    if(cur < start) cur += 24*60;
    const frac = clamp((cur - start) / (end - start), 0, 1);
    const expected = Math.round(state.waterGoal * frac);
    const diff = expected - state.day.waterToday;
    if(diff <= 0){
      paceBox.innerHTML = `Ritmo: <strong>em dia</strong> ✅ (esperado ${expected} ml até agora)`;
    } else {
      paceBox.innerHTML = `Ritmo: <strong>${diff} ml abaixo</strong> ⚠️ (esperado ${expected} ml até agora)`;
    }
  }

  // log
  const log = $("#waterLog");
  log.innerHTML = "";
  if(state.day.waterLog.length === 0){
    log.innerHTML = `<div class="muted small">Sem registros hoje.</div>`;
    return;
  }
  state.day.waterLog.slice().reverse().forEach(item => {
    const row = document.createElement("div");
    row.className = "logItem";
    const t = new Date(item.ts).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    row.innerHTML = `<span>${t}</span><strong>+${item.ml} ml</strong>`;
    log.appendChild(row);
  });
};

const addWater = (ml) => {
  ensureToday();
  state.day.waterToday += ml;
  state.day.waterLog.push({ts: Date.now(), ml});
  saveState();
  renderWater();

  if(state.waterGoal > 0 && state.day.waterToday >= state.waterGoal){
    notify("Meta de água batida! 💧", `Você atingiu ${state.day.waterToday} ml hoje.`);
  }
};

$$("[data-addwater]").forEach(btn => {
  btn.addEventListener("click", () => addWater(Number(btn.dataset.addwater)));
});

$("#btnAddCustom").addEventListener("click", () => {
  const v = prompt("Quantos ml você bebeu?");
  const ml = Number(v);
  if(Number.isFinite(ml) && ml > 0) addWater(Math.round(ml));
});

$("#btnSetGoal").addEventListener("click", () => {
  const v = Number($("#waterGoal").value);
  if(!Number.isFinite(v) || v <= 0){
    alert("Informe uma meta válida em ml.");
    return;
  }
  state.waterGoal = Math.round(v);
  saveState();
  renderWater();
});

const renderWaterConfig = () => {
  $("#wakeTime").value = state.waterConfig.wakeTime || "07:00";
  $("#sleepTime").value = state.waterConfig.sleepTime || "23:00";
  $("#waterSlack").value = state.waterConfig.slackMl ?? 250;
};

$("#btnSaveWaterConfig").addEventListener("click", () => {
  const wake = ($("#wakeTime").value || "").trim();
  const sleep = ($("#sleepTime").value || "").trim();
  const slack = Number($("#waterSlack").value);

  if(parseHHMMToMinutes(wake) === null || parseHHMMToMinutes(sleep) === null){
    alert("Use HH:MM para horários (ex: 07:00 e 23:00).");
    return;
  }
  state.waterConfig.wakeTime = wake;
  state.waterConfig.sleepTime = sleep;
  state.waterConfig.slackMl = Number.isFinite(slack) && slack >= 0 ? Math.round(slack) : 250;
  saveState();
  renderWater();
});

// -------------------------
// Meds
// -------------------------
let scheduleSortMode = "time"; // time | med

const renderMeds = () => {
  const box = $("#medList");
  box.innerHTML = "";

  if(state.meds.length === 0){
    box.innerHTML = `<div class="muted small">Nenhum remédio cadastrado ainda.</div>`;
    return;
  }

  state.meds.forEach(m => {
    const stockText = (typeof m.stock === "number")
      ? `Estoque: <strong>${m.stock}</strong>`
      : `Estoque: <span class="muted">—</span>`;

    const perDoseText = (typeof m.perDose === "number")
      ? `Qtd/dose: <strong>${m.perDose}</strong>`
      : `Qtd/dose: <span class="muted">—</span>`;

    const lowText = (typeof m.lowAlert === "number")
      ? `Baixo em: <strong>${m.lowAlert}</strong>`
      : `Baixo em: <span class="muted">—</span>`;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <div>
          <strong>${m.name}</strong>
          ${m.dose ? `<span class="badge">${m.dose}</span>` : ""}
        </div>
        <div class="muted small">Horários: ${m.times.join(", ")}</div>
        <div class="muted small">${stockText} • ${perDoseText} • ${lowText}</div>
      </div>

      <div class="actions">
        <button class="btn ghost" data-edit="${m.id}">Editar</button>
        <button class="btn danger" data-del="${m.id}">Excluir</button>
      </div>
    `;
    box.appendChild(div);
  });

  $$("[data-del]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.del;
    state.meds = state.meds.filter(m => m.id !== id);

    // limpa slots tomados do dia que referenciam esse remédio
    Object.keys(state.day.taken).forEach(slotId => {
      if(slotId.includes(`__${id}__`)) delete state.day.taken[slotId];
    });

    saveState();
    renderMeds();
    renderSchedule();
    renderTodayBoxes();
  }));

  $$("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.edit;
    const m = state.meds.find(x => x.id === id);
    if(!m) return;

    const name = prompt("Nome do remédio:", m.name) ?? m.name;
    const dose = prompt("Dose (opcional):", m.dose ?? "") ?? (m.dose ?? "");
    const timesTxt = prompt("Horários (HH:MM, separados por vírgula):", m.times.join(", ")) ?? m.times.join(", ");

    const stockTxt = prompt("Estoque (comprimidos) — deixe vazio se não quiser controlar:", (typeof m.stock === "number") ? String(m.stock) : "") ?? "";
    const perDoseTxt = prompt("Qtd por dose (ex: 1) — vazio para não baixar automaticamente:", (typeof m.perDose === "number") ? String(m.perDose) : "") ?? "";
    const lowTxt = prompt("Alerta de baixo estoque (ex: 5) — vazio para desativar:", (typeof m.lowAlert === "number") ? String(m.lowAlert) : "") ?? "";

    const times = safeParseTimes(timesTxt);
    if(times.length === 0){
      alert("Horários inválidos. Exemplo: 08:00, 14:00, 22:00");
      return;
    }

    const stock = stockTxt.trim() === "" ? null : Number(stockTxt);
    const perDose = perDoseTxt.trim() === "" ? null : Number(perDoseTxt);
    const lowAlert = lowTxt.trim() === "" ? null : Number(lowTxt);

    m.name = (name.trim() || m.name);
    m.dose = dose.trim();
    m.times = times;

    m.stock = (stock !== null && Number.isFinite(stock) && stock >= 0) ? Math.round(stock) : null;
    m.perDose = (perDose !== null && Number.isFinite(perDose) && perDose > 0) ? Math.round(perDose) : null;
    m.lowAlert = (lowAlert !== null && Number.isFinite(lowAlert) && lowAlert >= 0) ? Math.round(lowAlert) : null;

    saveState();
    renderMeds();
    renderSchedule();
    renderTodayBoxes();
  }));
};

$("#medForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#medName").value.trim();
  const dose = $("#medDose").value.trim();
  const times = safeParseTimes($("#medTimes").value);

  const stockV = $("#medStock").value.trim();
  const perDoseV = $("#medPerDose").value.trim();
  const lowV = $("#medLow").value.trim();

  const stock = stockV === "" ? null : Number(stockV);
  const perDose = perDoseV === "" ? null : Number(perDoseV);
  const lowAlert = lowV === "" ? null : Number(lowV);

  if(!name){
    alert("Informe o nome.");
    return;
  }
  if(times.length === 0){
    alert("Horários inválidos. Exemplo: 08:00, 14:00, 22:00");
    return;
  }

  state.meds.push({
    id: uid(),
    name,
    dose,
    times,
    stock: (stock !== null && Number.isFinite(stock) && stock >= 0) ? Math.round(stock) : null,
    perDose: (perDose !== null && Number.isFinite(perDose) && perDose > 0) ? Math.round(perDose) : null,
    lowAlert: (lowAlert !== null && Number.isFinite(lowAlert) && lowAlert >= 0) ? Math.round(lowAlert) : null
  });

  saveState();

  $("#medName").value = "";
  $("#medDose").value = "";
  $("#medTimes").value = "";
  $("#medStock").value = "";
  $("#medPerDose").value = "";
  $("#medLow").value = "";

  renderMeds();
  renderSchedule();
  renderTodayBoxes();
});

// -------------------------
// Schedule (today slots)
// -------------------------
const buildTodaySlots = () => {
  ensureToday();
  const slots = [];

  for(const med of state.meds){
    for(const t of med.times){
      const slotId = `${todayKey()}__${med.id}__${t}`;
      slots.push({
        slotId,
        time: t,
        medId: med.id,
        name: med.name,
        dose: med.dose || "",
        taken: !!state.day.taken[slotId],
        takenTs: state.day.taken[slotId]?.ts || null
      });
    }
  }

  if(scheduleSortMode === "time"){
    slots.sort((a,b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  } else {
    slots.sort((a,b) => a.name.localeCompare(b.name) || a.time.localeCompare(b.time));
  }
  return slots;
};

const renderSchedule = () => {
  const box = $("#schedule");
  box.innerHTML = "";
  const slots = buildTodaySlots();

  if(slots.length === 0){
    box.innerHTML = `<div class="muted small">Cadastre remédios para aparecer a agenda.</div>`;
    return;
  }

  const now = nowHHMM();

  slots.forEach(s => {
    const div = document.createElement("div");
    div.className = `slot ${s.taken ? "done" : ""}`;
    const isDue = !s.taken && s.time <= now;

    div.innerHTML = `
      <div class="slotLeft">
        <div class="slotTime">${s.time} ${isDue ? `<span class="badge">agora/atrasado</span>` : ""}</div>
        <div><span class="pill">💊</span><strong>${s.name}</strong></div>
        ${s.dose ? `<div class="slotDose">${s.dose}</div>` : ""}
        ${s.takenTs ? `<div class="muted small">Tomado às ${new Date(s.takenTs).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>` : ""}
      </div>

      <div class="actions">
        <button class="btn ${s.taken ? "ghost" : ""}" data-take="${s.slotId}">
          ${s.taken ? "Desmarcar" : "Marcar como tomado"}
        </button>
      </div>
    `;
    box.appendChild(div);
  });

  $$("[data-take]").forEach(b => b.addEventListener("click", () => toggleTaken(b.dataset.take)));
};

const toggleTaken = (slotId) => {
  ensureToday();
  const wasTaken = !!state.day.taken[slotId];

  // identifica med e horário pelo slotId
  const parts = slotId.split("__");
  const medId = parts[1];
  const t = parts[2];
  const med = state.meds.find(m => m.id === medId);

  if(wasTaken){
    // ao desmarcar: opcionalmente devolve ao estoque se tinha sido baixado automaticamente
    const entry = state.day.taken[slotId];
    const autoDec = entry?.autoDecremented;
    delete state.day.taken[slotId];

    if(med && autoDec && typeof med.stock === "number" && typeof med.perDose === "number"){
      med.stock += med.perDose;
    }
  } else {
    // marcar tomado: baixa estoque se configurado
    let autoDec = false;
    if(med && typeof med.stock === "number" && typeof med.perDose === "number"){
      if(med.stock - med.perDose < 0){
        alert(`Estoque insuficiente para ${med.name}. Ajuste o estoque no cadastro.`);
      } else {
        med.stock -= med.perDose;
        autoDec = true;

        if(typeof med.lowAlert === "number" && med.stock <= med.lowAlert){
          notify("Estoque baixo 💊", `${med.name}: restam ${med.stock}`);
        }
      }
    }
    state.day.taken[slotId] = { ts: Date.now(), autoDecremented: autoDec };
  }

  saveState();
  renderMeds();
  renderSchedule();
  renderTodayBoxes();
};

$("#btnSort").addEventListener("click", () => {
  scheduleSortMode = scheduleSortMode === "time" ? "med" : "time";
  renderSchedule();
});

// -------------------------
// Today boxes: next med, overdue, taken
// -------------------------
const renderTodayBoxes = () => {
  const slots = buildTodaySlots();
  const now = nowHHMM();

  const overdue = slots.filter(s => !s.taken && s.time < now);
  const next = slots.find(s => !s.taken && s.time >= now) || null;

  $("#overdueCount").textContent = overdue.length;
  $("#takenCount").textContent = slots.filter(s => s.taken).length;

  const box = $("#nextMedBox");
  if(overdue.length > 0){
    const firstOver = overdue[0];
    box.innerHTML = `
      <div class="row gap wrap">
        <span class="badge">Atrasado</span>
        <span class="badge">${overdue.length} pendente(s)</span>
      </div>
      <div style="margin-top:8px">
        <div><strong>${firstOver.name}</strong> ${firstOver.dose ? `(${firstOver.dose})` : ""}</div>
        <div class="muted small">Horário: ${firstOver.time}</div>
      </div>
    `;
    return;
  }

  if(next){
    box.innerHTML = `
      <div class="row gap wrap">
        <span class="badge">Próximo</span>
        <span class="badge">${next.time}</span>
      </div>
      <div style="margin-top:8px">
        <div><strong>${next.name}</strong> ${next.dose ? `(${next.dose})` : ""}</div>
        <div class="muted small">Falta: ${timeDiffLabel(now, next.time)}</div>
      </div>
    `;
  } else {
    box.innerHTML = `<div><strong>Sem pendências</strong> ✅</div><div class="muted small">Você já concluiu os horários de hoje.</div>`;
  }
};

const timeDiffLabel = (from, to) => {
  const a = parseHHMMToMinutes(from);
  const b = parseHHMMToMinutes(to);
  if(a === null || b === null) return "";
  let diff = b - a;
  if(diff < 0) diff += 24*60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if(h <= 0) return `${m} min`;
  if(m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

// -------------------------
// Water + meds reminders while app open
// -------------------------
let lastMedReminderSlot = null;
let lastWaterNagAt = 0;

setInterval(() => {
  ensureToday();

  // Remédio: avisa quando bater o minuto exato
  const slots = buildTodaySlots();
  const now = nowHHMM();
  const due = slots.find(s => !s.taken && s.time === now);
  if(due && due.slotId !== lastMedReminderSlot){
    lastMedReminderSlot = due.slotId;
    notify("Hora do remédio 💊", `${due.name} ${due.dose ? `(${due.dose})` : ""} — ${due.time}`);
  }

  // Água: se estiver "muito abaixo do esperado", dá um toque (no máximo a cada 20 min)
  const wake = parseHHMMToMinutes(state.waterConfig.wakeTime);
  const sleep = parseHHMMToMinutes(state.waterConfig.sleepTime);
  const cur = parseHHMMToMinutes(now);
  if(state.waterGoal > 0 && wake !== null && sleep !== null && cur !== null){
    let start = wake, end = sleep, c = cur;
    if(end <= start) end += 24*60;
    if(c < start) c += 24*60;
    const frac = clamp((c - start) / (end - start), 0, 1);
    const expected = Math.round(state.waterGoal * frac);
    const diff = expected - state.day.waterToday;
    const slack = state.waterConfig.slackMl ?? 250;

    const nowMs = Date.now();
    if(diff >= slack && (nowMs - lastWaterNagAt) > 20*60*1000){
      lastWaterNagAt = nowMs;
      notify("Água 💧", `Você está ${diff} ml abaixo do esperado até agora.`);
    }
  }

  renderTodayBoxes();
  renderWater();
}, 30000);

// -------------------------
// Reset day
// -------------------------
$("#btnResetDay").addEventListener("click", () => {
  if(!confirm("Resetar registros de HOJE (água e remédios marcados)?")) return;
  state.day = { key: todayKey(), waterToday: 0, waterLog: [], taken: {} };
  saveState();
  renderAll();
});

// -------------------------
// Relatório do dia (print -> PDF no iPhone)
// -------------------------
$("#btnDailyReport").addEventListener("click", () => {
  ensureToday();
  const slots = buildTodaySlots();
  const taken = slots.filter(s => s.taken);
  const pending = slots.filter(s => !s.taken);

  const profileName = profiles.find(p => p.id === currentProfileId)?.name || "Perfil";
  const dt = new Date().toLocaleDateString("pt-BR");

  const html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Relatório - ${profileName} - ${dt}</title>
      <style>
        body{font-family: -apple-system, Segoe UI, Roboto, Arial; padding:16px; color:#0a1630}
        h1{margin:0 0 8px 0}
        .muted{color:#52657f}
        .box{border:1px solid #d9e1ef; border-radius:12px; padding:12px; margin:10px 0}
        table{width:100%; border-collapse:collapse}
        th,td{border-bottom:1px solid #e7eef9; padding:8px; text-align:left; font-size:14px}
        .ok{color:#16a34a; font-weight:700}
        .bad{color:#dc2626; font-weight:700}
      </style>
    </head>
    <body>
      <h1>Relatório do dia</h1>
      <div class="muted">${profileName} • ${dt}</div>

      <div class="box">
        <h2>Água</h2>
        <div>Meta: <strong>${state.waterGoal}</strong> ml</div>
        <div>Consumido: <strong>${state.day.waterToday}</strong> ml</div>
        <div>Status: ${state.day.waterToday >= state.waterGoal ? '<span class="ok">Meta atingida</span>' : '<span class="bad">Meta não atingida</span>'}</div>
      </div>

      <div class="box">
        <h2>Remédios</h2>
        <div>Tomados: <strong>${taken.length}</strong> • Pendentes: <strong>${pending.length}</strong></div>

        <h3>Agenda</h3>
        <table>
          <thead><tr><th>Horário</th><th>Remédio</th><th>Dose</th><th>Status</th></tr></thead>
          <tbody>
            ${slots.map(s => `
              <tr>
                <td>${s.time}</td>
                <td>${s.name}</td>
                <td>${s.dose || "-"}</td>
                <td>${s.taken ? "Tomado" : "Pendente"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="muted">Dica: no iPhone, use Compartilhar/Imprimir e “Salvar em PDF”.</div>

      <script>window.onload = () => window.print();</script>
    </body>
  </html>`;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
});

// -------------------------
// Backup export/import (por perfil atual)
// -------------------------
$("#btnExport").addEventListener("click", () => {
  const payload = {
    profile: profiles.find(p => p.id === currentProfileId) || {id: currentProfileId, name: "Perfil"},
    state
  };
  const txt = JSON.stringify(payload, null, 2);
  $("#exportBox").hidden = false;
  $("#exportBox").textContent = txt;
  downloadText(`saude-backup-${todayKey()}-${currentProfileId}.json`, txt);
});

$("#fileImport").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  const txt = await file.text();

  try{
    const obj = JSON.parse(txt);

    // aceita tanto backup "antigo" (state puro) quanto o novo (profile + state)
    let importedState = obj?.state ? obj.state : obj;
    importedState = mergeDefaults(importedState);

    state = importedState;
    saveState();

    ensureToday();
    renderAll();
    alert("Importado com sucesso ✅ (no perfil atual).");
  } catch {
    alert("Arquivo inválido.");
  }

  e.target.value = "";
});

// -------------------------
// Service worker (offline)
// -------------------------
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

// -------------------------
// Initial render
// -------------------------
const renderAll = () => {
  ensureToday();
  renderProfiles();
  renderWaterConfig();
  renderWater();
  renderMeds();
  renderSchedule();
  renderTodayBoxes();
};
renderAll();
