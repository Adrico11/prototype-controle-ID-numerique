/* Prototype de contrôle d'identité numérique à l'accueil — Theodo / France Identité.
   Moteur de lecture mdoc : mdoc-web-verifier de Stelau (Apache-2.0), dossier js/. */
(function () {
"use strict";
const BUILD_DATE = "2026-11-04";
const CERT_STALE_DAYS = 90;
const SHARE_TIMEOUT_MS = 60000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CBOR = self.CBOR || self.cbor;
window.CBOR = CBOR;

/* ---------- stockage ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const K = { reg: "fi_registre", cert: "fi_cert_date", mode: "fi_mode", anon: "fi_anon" };
const getReg = () => LS.get(K.reg, []);
const certDate = () => LS.get(K.cert, BUILD_DATE);

/* ---------- état ---------- */
const S = {
  screen: "debut", started: false, hidden: false,
  checks: [], mode: LS.get(K.mode, "camera"), anon: LS.get(K.anon, true),
  ctrl: null, ecartKind: "nom", ckPhys: [false, false, false], physDecision: "valide", physMotif: "",
  toast: "", demo: false,
};
let camStream = null, camRunning = false, camTok = 0;
let ble = { svcUUID: null, deBytes: null, mdocPubKey: null, readerKeyPair: null, skDevice: null, deferred: null, timer: null };

/* ---------- utilitaires ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtISODate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const fmtDur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${pad(s % 60)}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IC = {
  chk: (w = 18, sw = 3) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`,
  x: (w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  dash: (w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>`,
  warn: (w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/></svg>`,
  info: (w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>`,
  list: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01"/></svg>`,
  out: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  person: `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`,
  qr: `<svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/></svg>`,
  clock: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  okc: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.5 3.5L17 9"/></svg>`,
  koc: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
  warnb: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/></svg>`,
};
function toast(t) { S.toast = t; renderToast(); setTimeout(() => { if (S.toast === t) { S.toast = ""; renderToast(); } }, 3500); }
function renderToast() { let e = $("#toast"); if (!S.toast) { if (e) e.remove(); return; } if (!e) { e = document.createElement("div"); e.id = "toast"; e.className = "toast"; document.body.appendChild(e); } e.textContent = S.toast; }

/* ---------- registre ---------- */
function addRecord(r) {
  const reg = getReg();
  reg.push(Object.assign({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), mode: "numérique", decision: "", motif: "", durationMs: null, lastName: "", firstName: "", usage: "" }, r));
  LS.set(K.reg, reg);
}
function counts() {
  const reg = getReg(); const num = reg.filter((r) => r.mode === "numérique");
  return {
    total: reg.length,
    valid: reg.filter((r) => /^Entrée validée/.test(r.decision) || r.decision === "Validée malgré l'écart" || r.decision === "Validée malgré l'expiration").length,
    ok: reg.filter((r) => r.mode === "numérique" && r.result === "Authentique").length,
    refus: reg.filter((r) => /refusée/i.test(r.decision)).length,
    repli: reg.filter((r) => r.mode === "physique").length,
    numOk: num.filter((r) => r.result === "Authentique").length,
    pct: (q) => { const d = reg.map((r) => r.durationMs).filter((x) => x != null).sort((a, b) => a - b); if (!d.length) return null; const pos = (d.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return d[lo] + (d[hi] - d[lo]) * (pos - lo); },
    get median() { return this.pct(0.5); },
  };
}
function csvEscape(v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCsv() {
  const reg = getReg(); const cols = ["date", "heure", "mode", "résultat", "décision", "motif", "durée_s"];
  if (!S.anon) cols.push("nom", "prénom", "nom_usage");
  const lines = [cols.join(";")];
  for (const r of reg) {
    const d = new Date(r.ts);
    const row = [fmtDate(d), fmtTime(d), r.mode, r.result, r.decision, r.motif, r.durationMs == null ? "" : Math.round(r.durationMs / 1000)];
    if (!S.anon) row.push(r.lastName, r.firstName, r.usage);
    lines.push(row.map(csvEscape).join(";"));
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  const d = new Date(); a.download = `registre-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${S.anon ? "-anonymise" : ""}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); LS.set("fi_exported", Date.now());
  toast(S.anon ? "Registre exporté (anonymisé)" : "Registre exporté (avec noms et prénoms)");
}

/* ---------- vérifications de début de service ---------- */
const CHECK_LABEL = { cert: "Certificats", clock: "Heure du poste", bt: "Bluetooth", qr: "Lecteur de QR code", reg: "Registre du jour" };
let liveTok = 0;
async function liveChecks() {
  const tok = ++liveTok; S.started = false; S.checksDone = false; S.reveal = 0; S.checks = [];
  const res = await runChecks(); S.checks = res;
  if (S.screen !== "debut") go("debut"); else render();
  for (let i = 0; i < res.length; i++) {
    S.reveal = i; if (S.screen === "debut") render();
    await sleep(750); if (tok !== liveTok) return;
  }
  S.reveal = res.length; S.checksDone = true; if (S.screen === "debut") render(); else renderHeaderOnly();
}
function renderHeaderOnly() { $("#hdr").innerHTML = header(); }
async function runChecks() {
  const now = new Date(); const out = [];
  const cd = certDate(); const ageDays = Math.floor((now - new Date(cd + "T00:00:00")) / 86400000);
  const hasIaca = (window.IacaManager?.getActiveIACAs?.() || []).length > 0;
  out.push({ key: "cert", title: hasIaca && ageDays <= CERT_STALE_DAYS ? "Certificats à jour" : "Certificats trop anciens", ok: hasIaca && ageDays <= CERT_STALE_DAYS, level: "o",
    desc: hasIaca ? `Liste des émetteurs mise à jour le ${fmtISODate(cd)}` + (ageDays > CERT_STALE_DAYS ? ` (il y a ${ageDays} jours). Des identités valides risquent d'être refusées.` : "") : "Aucun certificat d'émetteur chargé.", act: ageDays > CERT_STALE_DAYS || !hasIaca ? "maj" : null });
  const clockOk = now >= new Date(BUILD_DATE + "T00:00:00");
  out.push({ key: "clock", title: clockOk ? "Heure du poste" : "Heure du poste incohérente", ok: clockOk, level: "r",
    desc: clockOk ? `${fmtDate(now)}, ${fmtTime(now)}, cohérente avec la liste des certificats` : `Le poste indique le ${fmtDate(now)}, antérieur à la liste des certificats. Les contrôles de validité seraient faux.`, act: clockOk ? null : "help" });
  let btOk = false, btDesc = "Web Bluetooth indisponible : utilisez Edge ou Chrome sur ordinateur, en HTTPS ou sur localhost.";
  try { if (navigator.bluetooth) { btOk = await navigator.bluetooth.getAvailability(); btDesc = btOk ? "Actif et autorisé par le navigateur" : "Bluetooth désactivé ou bloqué par le navigateur. Sans lui, aucun partage n'est possible."; } } catch {}
  out.push({ key: "bt", title: btOk ? "Bluetooth" : "Bluetooth indisponible", ok: btOk, level: "r", desc: btDesc, act: btOk ? null : "help" });
  let cams = 0; try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length; } catch {}
  out.push({ key: "qr", title: "Lecteur de QR code", ok: true, level: "o",
    desc: cams ? "Caméra du poste disponible. La douchette (saisie clavier) est utilisable en mode « Douchette »." : "Aucune caméra détectée : seule la douchette est utilisable.", act: null });
  const reg = getReg(); const today = new Date().toISOString().slice(0, 10);
  const old = reg.filter((r) => r.ts.slice(0, 10) !== today).length;
  out.push({ key: "reg", title: "Registre du jour", ok: true, level: "o", desc: old ? `${old} ligne(s) d'un jour précédent encore présentes : exportez puis supprimez-les en fin de service.` : (reg.length ? `${reg.length} contrôle(s) déjà enregistré(s) aujourd'hui` : "Vide : prêt pour le service"), act: null });
  S.checks = out; return out;
}

/* ---------- lecture du QR code ---------- */
function stopCamera() {
  camTok++; camRunning = false;
  if (camStream) { for (const t of camStream.getTracks()) t.stop(); camStream = null; }
  const v = $("#cam"); if (v) { try { v.pause(); } catch {} v.srcObject = null; }
}
async function startCamera() {
  const v = $("#cam"); if (!v || camRunning) return;
  const tok = ++camTok;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch (e) { toast("Caméra indisponible : " + (e.message || e)); return; }
  if (tok !== camTok || !document.body.contains(v)) { for (const t of stream.getTracks()) t.stop(); return; }
  camStream = stream; v.srcObject = stream; try { await v.play(); } catch {}
  if (tok !== camTok) return;
  camRunning = true;
  const cv = document.createElement("canvas"); const cx = cv.getContext("2d", { willReadFrequently: true });
  const tick = () => {
    if (!camRunning) return;
    if (v.videoWidth) {
      cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0);
      const img = cx.getImageData(0, 0, cv.width, cv.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code && code.data) { stopCamera(); onQr(code.data); return; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
let wedge = "", wedgeT = 0;
document.addEventListener("keydown", (e) => {
  if (S.screen === "appairage" && S.ctrl?.needGesture && e.key === "Enter") { e.preventDefault(); document.querySelector('[data-act="assoc"]')?.click(); return; }
  if (S.screen !== "scan" || S.mode !== "douchette") return;
  if (e.target && /TEXTAREA|INPUT/.test(e.target.tagName) && e.target.id !== "wedge") return;
  const now = Date.now(); if (now - wedgeT > 400) wedge = ""; wedgeT = now;
  if (e.key === "Enter") { const p = wedge; wedge = ""; if (p.startsWith("mdoc:")) { e.preventDefault(); onQr(p); } }
  else if (e.key.length === 1) wedge += e.key;
});

/* ---------- session mdoc (BLE) — adapté de visitor.html de Stelau ---------- */
async function bleReset() {
  try { if (window.BLE?.isConnected?.()) { await window.BLE.writeState(0x02); await sleep(120); } } catch {}
  try { window.BLE?.disconnect?.(); } catch {}
  ble.readerKeyPair = null; ble.skDevice = null; window.skDevice = null;
  clearTimeout(ble.timer);
}
function newCtrl() { return { t0: performance.now(), attempt: 1, sent: false, err: "" }; }
async function onQr(raw) {
  const payload = String(raw || "").trim();
  if (!payload.startsWith("mdoc:")) { toast("QR code non reconnu : il doit commencer par « mdoc: »"); if (S.mode === "camera") { S.scanning = true; render(); setTimeout(startCamera, 300); } return; }
  stopCamera(); await bleReset();
  S.ctrl = newCtrl(); S.ctrl.qrAt = new Date();
  try {
    const res = window.DeviceEngagement.parseMdocUriAndDE(payload);
    ble.deBytes = res.deBytes; ble.mdocPubKey = res.x && res.y ? { x: res.x, y: res.y } : null; ble.svcUUID = res.uuid;
    if (!ble.svcUUID || !ble.mdocPubKey) throw new Error("QR code incomplet");
  } catch (e) { toast("QR code illisible : " + (e.message || e)); go("scan"); return; }
  runAttempt(1);
}
function fail(msg) { return Promise.reject(new Error(msg)); }
async function runAttempt(n) {
  const c = S.ctrl; c.attempt = n; c.sent = false; c.needGesture = false;
  go("appairage");
  ble.deferred = {}; ble.deferred.p = new Promise((res, rej) => { ble.deferred.res = res; ble.deferred.rej = rej; });
  try {
    await connectAndSend();
    c.sent = true; go("partage");
    ble.timer = setTimeout(() => ble.deferred.rej(new Error("Délai dépassé : pas de réponse du téléphone")), SHARE_TIMEOUT_MS);
    const deviceResponse = await ble.deferred.p;
    clearTimeout(ble.timer);
    await handleResponse(deviceResponse);
  } catch (e) {
    console.warn("Tentative", n, "échouée :", e);
    if (S.ctrl !== c || S.screen === "scan") return;
    await bleReset(); c.err = String(e.message || e);
    if (e && e.__gesture) { c.needGesture = true; c.retryAttempt = n; go("appairage"); return; }
    if (n < 2) { c.needGesture = true; c.retryAttempt = 2; c.afterFail = true; go("appairage"); }
    else go("connexion");
  } 
}
async function connectAndSend() {
  const B = window.BLE;
  if (!B) throw new Error("Module Bluetooth indisponible");
  if (!navigator.bluetooth) throw new Error("Web Bluetooth indisponible dans ce navigateur");
  B.init({ onAssembled: processAssembled, logger: window.log, defaultChunk: 185 });
  try { await B.connect(ble.svcUUID); }
  catch (e) {
    if (e && (e.name === "SecurityError" || /user gesture/i.test(String(e.message)))) { e.__gesture = true; throw e; }
    await bleReset(); await sleep(300); await B.connect(ble.svcUUID);
  }
  await sleep(300); await B.writeState(0x01); await sleep(300);
  ble.readerKeyPair = await window.SessionEstablishment.makeReaderEphemeralKeyPair();
  await window.SessionEstablishment.exportReaderPublicToCoseKey(ble.readerKeyPair);
  let aad = await window.SessionEstablishment.buildTranscriptAAD(ble.deBytes);
  const { message, keys, transcriptAAD } = await window.SessionEstablishment.buildLegacySessionEstablishmentWithData({
    deBytes: ble.deBytes, mdocPubKey: ble.mdocPubKey, readerKeyPair: ble.readerKeyPair, transcriptAAD: aad, skReader: null,
    buildRequestByType: () => window.RequestBuilder.buildRequestByType(["pid_visitor", "mdl_visitor"]), log: window.log, CBOR,
  });
  if (keys) { ble.skDevice = keys.deviceKey; window.skDevice = keys.deviceKey; }
  await B.sendFragmented(message, 185);
}
async function processAssembled(assembled) {
  try {
    const decoded = CBOR.decode(assembled);
    const m = decoded instanceof Map ? decoded : new Map(Object.entries(decoded || {}));
    const status = m.get("status");
    const data = m.get("data");
    if (!data && status && status !== 0) throw new Error("Le téléphone a refusé ou interrompu la session (statut " + status + ")");
    const toBytes = (v) => { if (v && v.constructor && v.constructor.name === "Tagged") v = v.value; if (v instanceof Uint8Array) return v; if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength); if (Array.isArray(v)) return new Uint8Array(v); return null; };
    const bytes = toBytes(data);
    if (!bytes || !bytes.length) throw new Error("Réponse vide du téléphone");
    // clés de session
    const mdocPub = await window.SessionCrypto.importMdocPubKeyXY(ble.mdocPubKey.x, ble.mdocPubKey.y);
    const shared = await window.SessionCrypto.deriveSharedSecretBits(ble.readerKeyPair.privateKey, mdocPub);
    const aad = await window.SessionEstablishment.buildTranscriptAAD(ble.deBytes);
    const keys = await window.SessionCrypto.deriveSessionKey(new Uint8Array(shared), aad);
    window.skDevice = keys.deviceKey; ble.skDevice = keys.deviceKey;
    const iv = new Uint8Array(12); iv.set([0, 0, 0, 0, 0, 0, 0, 1], 0); new DataView(iv.buffer, 8, 4).setUint32(0, 1, false);
    const key = await crypto.subtle.importKey("raw", new Uint8Array(keys.deviceKey), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new Uint8Array(0), tagLength: 128 }, key, bytes);
    ble.deferred?.res(CBOR.decode(new Uint8Array(plain)));
  } catch (e) { ble.deferred?.rej(e); }
}

/* ---------- analyse du résultat ---------- */
const gf = (o, k) => (o instanceof Map ? o.get(k) : o?.[k]);
function itemsOf(doc) {
  const out = []; const ns = doc?.issuerSigned?.nameSpaces || {};
  for (const k of Object.keys(ns)) for (const it of (Array.isArray(ns[k]) ? ns[k] : [])) out.push(it);
  return out;
}
function personOf(doc) {
  const v = {}; let photo = null;
  for (const it of itemsOf(doc)) {
    const id = String(it.elementIdentifier || "");
    if (it.binary && it.binary.dataUri && /portrait/i.test(id)) photo = it.binary.dataUri;
    else if (typeof it.text === "string") v[id] = it.text;
  }
  const fam = v.family_name || ""; const birth = v.family_name_birth || "";
  let last = fam, usage = "Aucun";
  if (birth && fam && birth.toUpperCase() !== fam.toUpperCase()) { last = birth; usage = fam; }
  return { lastName: String(last).toUpperCase(), firstName: v.given_name || "", usage, photo, expiry: v.expiry_date ? String(v.expiry_date).slice(0, 10) : null, raw: v };
}
async function handleResponse(deviceResponse) {
  const c = S.ctrl; await bleReset();
  const model = window.WalletResponse.buildResponseViewModel(deviceResponse);
  const docs = Array.isArray(model?.documents) ? model.documents : [];
  if (!docs.length) throw new Error("Aucun document dans la réponse du téléphone");
  let doc = docs[0], res = null;
  try { res = await window.Verification.verifyCredentialSignature(doc); } catch (e) { res = { signatureValid: false, errors: [String(e.message || e)] }; }
  const person = personOf(doc);
  const sigOk = res.signatureValid !== false;
  const integrityOk = res.claims?.allMatched !== false && res.mdocAuthValid !== false;
  const chainOk = res.chainValid === true;
  const expired = !!(person.expiry && person.expiry < new Date().toISOString().slice(0, 10));
  c.person = person; c.verif = { sigOk, integrityOk, chainOk, expired, issuer: res.chainInfo?.matchedIACA?.name || res.chainInfo?.matchedIACA || "", errors: res.errors || [] };
  c.durationMs = performance.now() - c.t0;
  console.log("Vérification :", c.verif, res);
  if (!sigOk || !integrityOk) c.kind = "nonauth"; else if (!chainOk) c.kind = "emetteur"; else if (expired) c.kind = "expire"; else c.kind = "ok";
  go({ ok: "ok", nonauth: "nonauth", emetteur: "emetteur", expire: "expire" }[c.kind]);
}

/* ---------- gabarits d'écrans ---------- */
function header() {
  const now = new Date();
  const pill = !S.checksDone ? `<span class="pill in"><i></i>Tests en cours</span>` : S.checks.every((c) => c.ok) ? `<span class="pill ok"><i></i>Outil prêt</span>` : `<span class="pill er"><i></i>Outil non prêt</span>`;
  return `<header class="top"><div class="logos"><img src="assets/logo-rf.png" alt="République française" height="52"><img src="assets/logo-fi.png" alt="France Identité" height="26"></div><div class="sp"></div>${pill}
<div class="metas"><span>Certificats à jour au ${fmtISODate(certDate())}</span><span id="clk">Horloge poste d'accueil · ${fmtDate(now)} ${fmtTime(now)}</span></div>
<button class="hb ${S.screen === "registre" ? "act" : ""}" data-act="registre">${IC.list}Registre du jour</button><button class="hb ${S.screen === "fin" ? "act" : ""}" data-act="fin">${IC.out}Terminer le service</button></header>`;
}
function steps(cur, bad) {
  const L = ["Scanner le QR code", "Appairer le téléphone", "Partage par le visiteur", "Résultat"];
  return `<ol class="steps">${L.map((t, i) => { const n = i + 1; if (n < cur) return `<li class="done"><span class="n">${IC.chk(16)}</span>${t}</li>`; if (n === cur) return `<li class="${bad ? "bad" : "cur"}"><span class="n">${n}</span>${t}</li>`; return `<li><span class="n">${n}</span>${t}</li>`; }).join("")}</ol>`;
}
function photoBox(p, w = 150, h = 190) {
  const inner = p && p.photo ? `<img src="${esc(p.photo)}" alt="Photo du titre" style="width:100%;height:100%;object-fit:cover">` : IC.person;
  return `<div style="flex:none;width:${w}px"><div style="width:${w}px;height:${h}px;background:#e5e5e5;display:flex;align-items:center;justify-content:center">${inner}</div><p class="muted" style="margin-top:8px">Photo du titre</p></div>`;
}
function vline(state, text) {
  const col = { ok: "#18753c", ko: "#ce0500", wa: "#b34000", dash: "#666" }[state];
  const ic = state === "ok" ? IC.chk() : state === "dash" ? IC.dash() : IC.x();
  const t = state === "ko" || state === "wa" ? `<b>${text}</b>` : text;
  return `<div class="v"><span style="color:${col};display:flex">${ic}</span><span ${state === "dash" ? 'style="color:#666"' : ""}>${t}</span></div>`;
}
function vlines(c, partial) {
  const v = c.verif || {}; const L = [];
  L.push(v.sigOk ? vline("ok", "Signature de l'émetteur valide") : vline("ko", "Signature de l'émetteur invalide"));
  if (!v.sigOk) { L.push(vline("dash", "Émetteur reconnu : non évalué")); L.push(vline("dash", "Validité du titre : non évaluée")); }
  else { L.push(v.chainOk ? vline("ok", `Émetteur reconnu (liste du ${fmtISODate(certDate())})`) : vline("ko", `Émetteur absent de la liste du ${fmtISODate(certDate())}`)); L.push(v.chainOk ? (v.expired ? vline("ko", "Titre expiré") : vline("ok", "Titre en cours de validité")) : vline("dash", "Validité du titre : non évaluée")); }
  L.push(v.integrityOk ? vline("ok", "Données reçues intactes") : vline("ko", "Données altérées ou incomplètes"));
  return L.join("");
}
const durLine = (c) => `Temps de contrôle : ${fmtDur(c.durationMs || 0)}, du scan du QR code au résultat`;

const SCREENS = {
  debut() {
    const n = S.checks.length, rev = S.reveal, done = !!S.checksDone;
    const ok = done && S.checks.every((c) => c.ok); const bad = S.checks.filter((c) => !c.ok).length;
    const rows = S.checks.map((c, i, a) => {
      const bs = i === a.length - 1 ? 'style="border-bottom:1px solid #ddd"' : "";
      if (!done && i > rev) return `<div class="chk" ${bs}><span class="ic" style="background:#e5e5e5;color:#666">${IC.dash()}</span><div class="grow"><b style="color:#666">${CHECK_LABEL[c.key]}</b><span class="d2">En attente</span></div></div>`;
      if (!done && i === rev) return `<div class="chk" ${bs}><span class="spin"></span><div class="grow"><b>${CHECK_LABEL[c.key]}</b><span class="d2">Vérification en cours…</span></div></div>`;
      const cls = c.ok ? "g" : c.level; const ic = c.ok ? IC.chk() : c.level === "r" ? IC.x() : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17v.01"/></svg>`;
      const right = c.ok ? `<span class="pill ok">OK</span>` : c.act === "maj" ? `<button class="btn s" data-act="maj">Mettre à jour (internet requis)</button>` : `<button class="btn s" data-act="help" data-k="${c.key}">Voir comment corriger</button>`;
      return `<div class="chk ${c.ok ? "pop" : ""}" ${bs}><span class="ic ${cls}">${ic}</span><div class="grow"><b>${esc(c.title)}</b><span class="d2">${esc(c.desc)}</span></div>${right}</div>`;
    }).join("");
    const sub = !done ? `Vérification en cours… ${Math.min(rev + 1, n)} sur ${n}` : ok ? "Tout est en ordre." : `${bad} point${bad > 1 ? "s" : ""} sur ${n} à corriger.`;
    return `${done && !ok ? `<div class="alert o"><div class="ia">${IC.warn(24)}</div><div class="tx"><h2 style="font-size:18px;margin-bottom:4px">Le contrôle des identités numériques n'est pas disponible</h2><p class="txt2">Tant que ces points ne sont pas corrigés, contrôlez tous les titres selon la procédure habituelle, sans l'outil. Aucun visiteur n'est refusé pour cette raison.</p></div></div>` : ""}
<div class="row2"><section class="card" style="flex:2 1 560px"><h1 style="font-size:28px;line-height:1.3">Début de service</h1><p style="color:#3a3a3a;margin:8px 0 24px">${sub}</p>${rows}
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:32px">${!done ? "" : ok ? `<button class="btn p" data-act="start">Commencer le service</button><button class="btn s" data-act="recheck">Relancer les vérifications</button>` : `<button class="btn p" data-act="recheck">Relancer les vérifications</button><button class="btn s" data-act="sansoutil">Contrôler les titres sans l'outil</button>`}</div></section>
<aside class="card" style="flex:1 1 300px;padding:24px;display:flex;flex-direction:column;gap:16px"><h2 style="font-size:18px">À savoir</h2><p class="txt2">Cet écran s'affiche une seule fois, à l'ouverture. L'état de l'outil reste visible en haut de chaque écran.</p><p class="txt2">Les données des visiteurs sont conservées uniquement dans ce navigateur, jusqu'à la suppression de fin de service.</p><p class="txt2">Titre physique : contrôle habituel, l'outil n'intervient pas.</p></aside></div>`;
  },
  sansoutil() {
    return `<section class="card" style="max-width:640px;display:flex;flex-direction:column;gap:16px"><h1 style="font-size:28px">Outil masqué pour la journée</h1><p style="color:#3a3a3a">Contrôlez les titres selon la procédure habituelle. Aucun visiteur n'est refusé à cause de l'outil.</p><div><button class="btn p" data-act="recheck">Rouvrir l'outil</button></div></section>`;
  },
  scan() {
    const n = counts(); const cam = S.mode === "camera";
    const box = cam && S.scanning ? `<div style="position:relative;width:320px;height:240px;background:#161616;color:#000091"><video id="cam" muted playsinline></video><span class="corner" style="top:0;left:0;border-top-width:4px;border-left-width:4px"></span><span class="corner" style="top:0;right:0;border-top-width:4px;border-right-width:4px"></span><span class="corner" style="bottom:0;left:0;border-bottom-width:4px;border-left-width:4px"></span><span class="corner" style="bottom:0;right:0;border-bottom-width:4px;border-right-width:4px"></span></div>`
      : `<div style="position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:#000091"><span class="corner" style="top:0;left:0;border-top-width:4px;border-left-width:4px"></span><span class="corner" style="top:0;right:0;border-top-width:4px;border-right-width:4px"></span><span class="corner" style="bottom:0;left:0;border-bottom-width:4px;border-right-width:0;border-left-width:4px"></span><span class="corner" style="bottom:0;right:0;border-bottom-width:4px;border-right-width:4px"></span>${IC.qr}</div>`;
    const seg = `<div class="seg">${cam ? `<button class="btn s" data-act="mode" data-m="douchette">Douchette</button><div class="on">${IC.chk()}Caméra du poste</div>` : `<div class="on">${IC.chk()}Douchette</div><button class="btn s" data-act="mode" data-m="camera">Caméra du poste</button>`}</div>`;
    const pills = cam ? `<span class="pill ok"><i></i>Caméra du poste sélectionnée</span>` : `<span class="pill ok"><i></i>Douchette active : scannez le QR code</span>`;
    return `${steps(1)}<div class="row2"><section class="card" style="flex:2 1 560px;display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center;padding:48px 32px 32px">${box}
<div><h1 style="font-size:28px;line-height:1.3">Prêt à contrôler une identité numérique</h1><p style="color:#3a3a3a;margin-top:8px;max-width:520px">Demandez au visiteur de présenter le QR code au dos de sa carte d'identité dans l'application France Identité, puis scannez-le avec le lecteur de QR code.</p></div>
${cam ? (S.scanning ? `<p class="txt2">Présentez le QR code devant la caméra.</p>` : `<button class="btn p" data-act="scan" style="min-width:240px">Scanner</button>`) : ""}
<div style="display:flex;flex-direction:column;gap:12px;align-items:center;width:100%"><span class="txt2">Lecteur de QR code utilisé</span>${seg}<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${pills}<span class="pill ok"><i></i>Bluetooth actif</span></div><span class="muted">Douchette en panne ou absente ? Choisissez « Caméra du poste ».</span></div>
<details style="width:100%;max-width:520px;text-align:left"><summary class="muted" style="cursor:pointer">Test : coller le contenu d'un QR code</summary><textarea id="paste" rows="2" placeholder="mdoc:…" style="margin-top:8px"></textarea><button class="btn s" data-act="paste" style="margin-top:8px">Lancer le contrôle</button></details>
<div style="border-top:1px solid #ddd;padding-top:16px;width:100%"><p class="muted">Titre physique ou pas d'identité numérique :</p><button class="btn s" data-act="phys" data-m="Visiteur sans identité numérique" style="margin-top:8px">Contrôler un titre physique</button></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:16px">Aujourd'hui</h2><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><div class="stat"><b>${n.total}</b><span>Contrôles</span></div><div class="stat"><b>${n.valid}</b><span>Validés</span></div><div class="stat"><b>${n.refus}</b><span>Refusés</span></div><div class="stat"><b>${n.repli}</b><span>Replis sur titre physique</span></div></div></aside></div>`;
  },
  appairage() {
    const c = S.ctrl; const n = c.attempt;
    const qrAt = c.qrAt ? `${pad(c.qrAt.getHours())}:${pad(c.qrAt.getMinutes())}:${pad(c.qrAt.getSeconds())}` : "";
    const btn = c.needGesture ? `<button class="btn p" data-act="assoc">${c.afterFail ? "Réessayer (essai 2 sur 2)" : "Ouvrir la fenêtre d'association"} (Entrée)</button>` : "";
    const msg = c.needGesture ? (c.afterFail ? `<div class="alert o"><div class="ia">${IC.warn()}</div><div class="tx"><h2 style="font-size:16px;margin-bottom:4px">Le téléphone n'a pas répondu</h2><p class="txt2">Demandez au visiteur de garder l'application ouverte et l'écran allumé, puis réessayez.</p></div></div>` : `<div class="alert"><div class="ia">${IC.info()}</div><div class="tx"><p class="txt2">Le navigateur exige une action de votre part avant d'ouvrir la fenêtre Bluetooth : cliquez sur le bouton ou appuyez sur Entrée.</p></div></div>`) : `<div class="alert"><div class="ia">${IC.info()}</div><div class="tx"><h2 style="font-size:16px;margin-bottom:4px">Plusieurs appareils dans la liste ?</h2><p class="txt2">D'autres visiteurs ont peut-être déjà ouvert leur QR code. Demandez-leur de le fermer, puis recommencez : n'associez que l'appareil du visiteur devant vous.</p></div></div>`;
    return `${steps(2)}<div class="row2"><section class="card" style="flex:1 1 520px;display:flex;flex-direction:column;gap:20px"><span class="pill ok" style="align-self:flex-start"><i></i>QR code lu à ${qrAt}</span><h1 style="font-size:28px;line-height:1.3">Associez le téléphone du visiteur</h1><p style="color:#3a3a3a;font-size:18px">Une fenêtre du navigateur s'ouvre. Choisissez l'appareil du visiteur, puis cliquez sur « Associer ».</p>${msg}<div style="display:flex;gap:12px;flex-wrap:wrap">${btn}<button class="btn s" data-act="cancel">Annuler et scanner à nouveau</button></div></section>
<aside style="flex:1 1 360px"><p class="muted" style="margin-bottom:8px">Aperçu de la fenêtre du navigateur</p><div style="background:#fff;border:1px solid #929292;box-shadow:0 6px 18px rgba(0,0,0,.18);max-width:420px"><div style="padding:14px;font-size:14px;border-bottom:1px solid #ddd"><b>Cette page souhaite s'associer à un appareil Bluetooth</b></div><div class="dev"><span style="width:16px;height:16px;border-radius:50%;border:2px solid #000091;background:#000091;box-shadow:inset 0 0 0 3px #fff;flex:none"></span><span style="flex:1">Appareil 1 (téléphone)</span></div><div class="dev"><span style="width:16px;height:16px;border-radius:50%;border:2px solid #929292;flex:none"></span><span style="flex:1;color:#3a3a3a">Appareil 2 (téléphone)</span></div><div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 14px;border-top:1px solid #ddd"><span style="padding:6px 16px;font-size:14px;border:1px solid #929292">Annuler</span><span style="padding:6px 16px;font-size:14px;background:#000091;color:#fff">Associer</span></div></div></aside></div>`;
  },
  partage() {
    const c = S.ctrl;
    return `${steps(3)}<div class="row2"><section class="card" style="flex:2 1 560px;display:flex;flex-direction:column;gap:20px"><h1 style="font-size:28px;line-height:1.3">Le visiteur valide sur son téléphone</h1><p style="color:#3a3a3a;font-size:18px">Invitez-le à garder l'application ouverte et l'écran allumé, à accepter le partage puis à déverrouiller son téléphone.</p>
<div><div class="ph"><span class="c" style="background:#18753c;color:#fff">${IC.chk(16)}</span><span style="flex:1"><b>Demande envoyée</b><br><span class="txt2">Le téléphone est connecté</span></span></div><div class="ph" style="border-bottom:1px solid #ddd"><span class="spin" style="width:28px;height:28px;flex:none"></span><span style="flex:1"><b>Le visiteur accepte le partage puis déverrouille son téléphone</b></span></div></div>
<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#e8edff"><span style="font-size:24px;font-weight:700;color:#000091">Essai ${c.attempt} sur 2</span><span style="display:flex;gap:6px"><i style="width:14px;height:14px;border-radius:50%;background:#000091"></i><i style="width:14px;height:14px;border-radius:50%;${c.attempt === 2 ? "background:#000091" : "border:2px solid #000091"}"></i></span></div><p class="txt2">Si le partage n'aboutit pas, un second essai puis le titre physique vous seront proposés.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn s" data-act="phys" data-m="Choix de l'agent pendant le partage">Passer au titre physique</button><button class="btn s" data-act="cancel">Annuler</button></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px;display:flex;flex-direction:column;gap:16px"><h2 style="font-size:18px">Données demandées</h2><p class="txt2">Le visiteur voit cette demande et peut la refuser.</p><div style="background:#f6f6f6;padding:4px 16px"><div style="padding:10px 0;border-bottom:1px solid #ddd">Nom</div><div style="padding:10px 0;border-bottom:1px solid #ddd">Prénom</div><div style="padding:10px 0;border-bottom:1px solid #ddd">Nom d'usage</div><div style="padding:10px 0">Photo</div></div><p class="txt2">Demandeur affiché au visiteur : [nom de l'accueil à renseigner]</p></aside></div>`;
  },
  ok() {
    const c = S.ctrl, p = c.person;
    return `${steps(4)}<div class="row2"><section style="flex:2 1 560px;display:flex;flex-direction:column"><div class="res g">${IC.okc}<div><h1>Identité authentique</h1><p style="font-size:14px">${durLine(c)}</p></div></div><div class="card" style="border-top:0"><p class="txt2" style="margin-bottom:8px">Comparez ces informations avec la pré-annonce du visiteur.</p>
<div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1 1 280px"><div class="f"><span>Nom</span><b>${esc(p.lastName)}</b></div><div class="f"><span>Prénom</span><b>${esc(p.firstName)}</b></div><div class="f" style="border-bottom:1px solid #ddd"><span>Nom d'usage</span><b>${esc(p.usage)}</b></div></div>${photoBox(p)}</div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:32px"><button class="btn p" data-act="decide" data-d="Entrée validée">Valider l'entrée</button><button class="btn s" data-act="ecart">Signaler un écart ou refuser</button></div><p class="muted" style="margin-top:12px">Votre choix est enregistré dans le journal. Les informations s'effacent de l'écran ensuite.</p></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:8px">Vérifications effectuées</h2>${vlines(c)}<div style="border-top:1px solid #ddd;margin-top:0"></div><p class="txt2" style="margin-top:16px">Ces vérifications garantissent l'origine des données. Elles ne remplacent pas la comparaison avec la pré-annonce.</p></aside></div>`;
  },
  ecart() {
    const c = S.ctrl, p = c.person; const o = [["nom", "Nom différent de la pré-annonce"], ["prenom", "Prénom différent de la pré-annonce"], ["absent", "Visiteur absent de la pré-annonce"], ["autre", "Autre écart"]];
    return `<div class="row2"><section class="card" style="flex:2 1 560px"><h1 style="font-size:28px;line-height:1.3">Écart avec la pré-annonce</h1><p style="color:#3a3a3a;margin:8px 0 24px;font-size:18px">L'identité est authentique, mais elle ne correspond pas à ce que vous attendiez. Indiquez la nature de l'écart.</p>
<div class="mini"><div style="width:56px;height:70px;background:#e5e5e5;display:flex;align-items:center;justify-content:center;overflow:hidden">${p.photo ? `<img src="${esc(p.photo)}" style="width:100%;height:100%;object-fit:cover" alt="">` : IC.person.replace(/64/g, "32")}</div><div><span>Nom</span><b>${esc(p.lastName)}</b></div><div><span>Prénom</span><b>${esc(p.firstName)}</b></div><div><span>Nom d'usage</span><b>${esc(p.usage)}</b></div><div><span>Temps de contrôle</span><b>${fmtDur(c.durationMs || 0)}</b></div></div>
<p class="muted" style="margin:-8px 0 16px">Le temps de contrôle, du scan au résultat, est enregistré dans le journal.</p>
${o.map(([k, t], i) => `<div class="rd ${S.ecartKind === k ? "on" : ""}" data-act="ek" data-k="${k}" ${i === 3 ? 'style="border-bottom:1px solid #ddd"' : ""}><i></i><span>${t}</span></div>`).join("")}
<label for="com" style="display:block;font-weight:500;margin:24px 0 8px">Commentaire <span style="font-weight:400;color:#666">(facultatif)</span></label><textarea id="com" rows="3"></textarea>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><button class="btn d" data-act="ecartdec" data-d="Entrée refusée">Refuser l'entrée</button><button class="btn s" data-act="ecartdec" data-d="Validée malgré l'écart">Valider malgré l'écart</button><button class="btn s" data-act="rescan" data-d="Nouvel essai">Recommencer le contrôle</button></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px;display:flex;flex-direction:column;gap:16px"><h2 style="font-size:18px">Conduite à tenir</h2><p class="txt2">Un écart n'est pas forcément une fraude : nom d'usage, prénom composé, faute de saisie dans la pré-annonce.</p><p class="txt2">En cas de doute, appelez la personne visitée ou appliquez la consigne de l'accueil.</p><p class="txt2">Valider malgré l'écart demande de choisir la nature de l'écart. Le choix est enregistré dans le journal.</p></aside></div>`;
  },
  nonauth() {
    const c = S.ctrl;
    return `${steps(4, true)}<div class="row2"><section style="flex:2 1 560px;display:flex;flex-direction:column"><div class="res r">${IC.koc}<div><h1>Authenticité non confirmée</h1><p style="font-size:14px">${durLine(c)}. Les informations reçues ne sont pas affichées</p></div></div><div class="card" style="border-top:0;display:flex;flex-direction:column;gap:16px"><p style="font-size:18px">Cette identité numérique ne peut pas être acceptée. Ne vous fiez à aucune information présentée par le visiteur sur son téléphone.</p><p style="color:#3a3a3a">Demandez au visiteur de présenter un titre d'identité physique, ou appliquez la consigne de l'accueil.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px"><button class="btn p" data-act="phys" data-m="Authenticité non confirmée">Contrôler le titre physique</button><button class="btn s" data-act="sign" data-d="Signalement">Consigner un signalement</button><button class="btn s" data-act="rescan" data-d="Nouvel essai">Recommencer le contrôle</button></div><p class="muted">Le motif technique et le temps de contrôle sont enregistrés dans le journal.</p></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:8px">Vérifications effectuées</h2>${vlines(c)}<div style="border-top:1px solid #ddd"></div><p class="txt2" style="margin-top:16px">Une application ou un titre falsifié donne ce résultat. Une erreur de transmission aussi : un second essai est possible.</p></aside></div>`;
  },
  emetteur() {
    const c = S.ctrl;
    return `${steps(4, true)}<div class="row2"><section style="flex:2 1 560px;display:flex;flex-direction:column"><div class="res o">${IC.warnb}<div><h1>Émetteur non reconnu</h1><p style="font-size:14px">La signature est valide, mais l'émetteur n'est pas dans la liste de confiance</p></div></div><div class="card" style="border-top:0;display:flex;flex-direction:column;gap:16px"><p style="font-size:18px">Les données ne sont pas affichées tant que l'émetteur n'est pas reconnu.</p><p style="color:#3a3a3a">Cela peut venir d'une liste de confiance ancienne (dernière mise à jour le ${fmtISODate(certDate())}) ou d'un titre émis par un organisme que l'outil ne connaît pas.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px"><button class="btn p" data-act="majretry">Mettre à jour la liste et réessayer</button><button class="btn s" data-act="rescan" data-d="Nouvel essai">Réessayer le contrôle numérique</button><button class="btn s" data-act="phys" data-m="Émetteur non reconnu">Contrôler le titre physique</button><button class="btn s" data-act="sign" data-d="Signalement">Consigner un signalement</button></div><p class="muted">La mise à jour demande une connexion internet. Le motif est enregistré dans le journal.</p></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:8px">Vérifications effectuées</h2>${vlines(c)}<div style="border-top:1px solid #ddd"></div><p class="txt2" style="margin-top:16px">Hypothèse : on n'affiche pas l'identité d'un émetteur inconnu, par prudence.</p></aside></div>`;
  },
  expire() {
    const c = S.ctrl, p = c.person;
    return `${steps(4, true)}<div class="row2"><section style="flex:2 1 560px;display:flex;flex-direction:column"><div class="res o">${IC.clock}<div><h1>Titre numérique expiré</h1><p style="font-size:14px">L'identité est authentique, mais le titre n'est plus en cours de validité</p></div></div><div class="card" style="border-top:0"><p class="txt2" style="margin-bottom:8px">Un titre expiré n'est pas forcément refusé : appliquez la consigne de l'accueil.</p>
<div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1 1 280px"><div class="f"><span>Nom</span><b style="font-size:24px">${esc(p.lastName)}</b></div><div class="f"><span>Prénom</span><b style="font-size:24px">${esc(p.firstName)}</b></div><div class="f" style="border-bottom:1px solid #ddd"><span>Titre expiré depuis le</span><b style="font-size:24px;color:#b34000">${p.expiry ? fmtISODate(p.expiry) : "–"}</b></div></div>${photoBox(p)}</div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:32px"><button class="btn p" data-act="phys" data-m="Titre numérique expiré">Contrôler le titre physique</button><button class="btn s" data-act="rescan" data-d="Nouvel essai">Réessayer le contrôle numérique</button><button class="btn s" data-act="decide" data-d="Validée malgré l'expiration">Valider malgré l'expiration</button><button class="btn s" data-act="decide" data-d="Entrée refusée">Refuser l'entrée</button></div><p class="muted" style="margin-top:12px">Valider malgré l'expiration est consigné dans le journal. Les informations s'effacent de l'écran ensuite.</p></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:8px">Vérifications effectuées</h2>${vlines(c)}<div style="border-top:1px solid #ddd"></div><p class="txt2" style="margin-top:16px">Hypothèse : on affiche l'identité d'un titre expiré pour aider la décision de l'agent. Question ouverte dans le Notion.</p></aside></div>`;
  },
  connexion() {
    const c = S.ctrl;
    return `${steps(3, true)}<div class="row2"><section class="card" style="flex:2 1 560px;display:flex;flex-direction:column;gap:20px"><span class="pill wa" style="align-self:flex-start"><i></i>Essai 2 sur 2 échoué</span><h1 style="font-size:28px;line-height:1.3">La connexion avec le téléphone s'est interrompue</h1><p style="color:#3a3a3a;font-size:18px">Aucune donnée n'a été reçue. Nous passons au contrôle du titre physique, plus fiable dans ce cas.</p>
<div class="alert o"><div class="ia">${IC.warn()}</div><div class="tx"><h2 style="font-size:16px;margin-bottom:4px">Que dire au visiteur ?</h2><p class="txt2">« Votre téléphone n'a pas répondu à temps. Veuillez présenter votre titre d'identité physique. »</p></div></div>
<div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn p" data-act="phys" data-m="Connexion interrompue">Passer au titre physique</button><button class="btn s" data-act="rescan" data-d="Nouvel essai">Réessayer le contrôle numérique</button></div><p class="muted">Le repli est consigné dans le journal avec son motif et la durée, sans donnée d'identité.</p></section>
<aside class="card" style="flex:1 1 300px;padding:24px"><h2 style="font-size:18px;margin-bottom:8px">Causes fréquentes</h2><div class="cs">Application fermée ou écran verrouillé</div><div class="cs">Bluetooth coupé ou téléphone trop éloigné</div><div class="cs">Partage refusé ou déverrouillage non effectué</div><div class="cs" style="border-bottom:1px solid #ddd">Téléphone non compatible</div>${c && c.err ? `<p class="muted" style="margin-top:16px">Détail technique : ${esc(c.err)}</p>` : ""}</aside></div>`;
  },
  repli() {
    const items = ["Photo ressemblante au visiteur", "Titre en cours de validité", "Nom et prénom conformes à la pré-annonce"];
    const dec = [["valide", "Entrée validée"], ["refuse", "Entrée refusée"], ["signal", "Signalement à la sécurité"]];
    return `<div class="row2"><section class="card" style="flex:2 1 560px"><span class="pill in"><i></i>Repli · motif : ${esc(S.physMotif)}</span><h1 style="font-size:28px;line-height:1.3;margin:16px 0 8px">Contrôle du titre physique</h1><p style="color:#3a3a3a;font-size:18px;margin-bottom:24px">Contrôlez le titre à vue, puis enregistrez le résultat. Aucune information d'identité n'est saisie dans l'outil.</p>
${items.map((t, i) => `<div class="ck ${S.ckPhys[i] ? "on" : ""}" data-act="ckp" data-i="${i}" ${i === 2 ? 'style="border-bottom:1px solid #ddd"' : ""}><i>${S.ckPhys[i] ? IC.chk(12) : ""}</i><span>${t}</span></div>`).join("")}
<h2 style="font-size:18px;margin:24px 0 4px">Décision</h2>${dec.map(([k, t], i) => `<div class="rd ${S.physDecision === k ? "on" : ""}" data-act="pd" data-k="${k}" ${i === 2 ? 'style="border-bottom:1px solid #ddd"' : ""}><i></i><span>${t}</span></div>`).join("")}
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><button class="btn p" data-act="physsave">Enregistrer la décision</button><button class="btn s" data-act="rescan" data-d="Retour au numérique">Retour au numérique</button></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px;display:flex;flex-direction:column;gap:16px"><h2 style="font-size:18px">Pourquoi ce repli ?</h2><p class="txt2">Le motif est enregistré avec la durée du contrôle, pour mesurer la part de contrôles numériques réussis.</p><p class="txt2">Le contrôle physique reste le parcours actuel. Cet écran ne le remplace pas, il le consigne.</p></aside></div>`;
  },
  registre() {
    const n = counts(); const reg = getReg().slice().reverse();
    const pill = { "Authentique": "ok", "Non authentique": "er", "Émetteur non reconnu": "wa", "Titre expiré": "wa", "Écart pré-annonce": "wa", "Connexion interrompue": "wa", "Titre physique": "in" };
    const rows = reg.map((r) => { const d = new Date(r.ts); return `<tr><td>${fmtTime(d)}</td><td>${esc(r.mode === "numérique" ? "Numérique" : "Physique")}</td><td><span class="pill ${pill[r.result] || "in"}"><i></i>${esc(r.result)}</span></td><td>${esc(r.decision)}</td><td>${esc(r.motif || "–")}</td><td>${r.durationMs == null ? "–" : fmtDur(r.durationMs)}</td></tr>`; }).join("") || `<tr><td colspan="6" style="padding:24px;color:#666">Aucun contrôle enregistré pour l'instant.</td></tr>`;
    return `<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap"><div style="flex:1 1 400px"><h1 style="font-size:28px;line-height:1.3">Registre du jour</h1><p style="color:#3a3a3a">Cet écran n'affiche ni nom ni prénom. L'export les inclut seulement si l'anonymisation est désactivée.</p></div><button class="btn s" data-act="export">Exporter (CSV${S.anon ? " anonymisé" : ""})</button><button class="btn p" data-act="back">Retour au contrôle</button></div>
<div style="display:flex;gap:16px;flex-wrap:wrap"><div class="kp"><span>Contrôles</span><b>${n.total}</b></div><div class="kp"><span>Numériques réussis</span><b>${n.numOk}</b></div><div class="kp"><span>Replis physiques</span><b>${n.repli}</b></div><div class="kp"><span>Refus</span><b>${n.refus}</b></div><div class="kp"><span>Durée à 25 %</span><b>${n.pct(0.25) == null ? "–" : fmtDur(n.pct(0.25))}</b></div><div class="kp"><span>Durée médiane</span><b>${n.median == null ? "–" : fmtDur(n.median)}</b></div><div class="kp"><span>Durée à 75 %</span><b>${n.pct(0.75) == null ? "–" : fmtDur(n.pct(0.75))}</b></div></div>
<section class="card" style="padding:0;overflow:auto"><table><thead><tr><th>Heure</th><th>Mode</th><th>Résultat</th><th>Décision</th><th>Motif</th><th>Durée</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  },
  fin() {
    const n = counts(); const exported = LS.get("fi_exported", 0) > 0 && getReg().length > 0 && LS.get("fi_exported", 0) > new Date(getReg().slice(-1)[0].ts).getTime();
    return `<div class="row2"><section class="card" style="flex:2 1 560px;display:flex;flex-direction:column;gap:20px"><h1 style="font-size:28px;line-height:1.3">Terminer le service</h1><p style="color:#3a3a3a;font-size:18px">Exportez le registre du jour, puis supprimez les données du poste. La suppression est définitive.</p>
<div><div class="k"><span>Contrôles du jour</span><b>${n.total}</b></div><div class="k"><span>Numériques réussis</span><b>${n.numOk}${n.total ? ` (${Math.round((100 * n.numOk) / n.total)} %)` : ""}</b></div><div class="k"><span>Replis physiques</span><b>${n.repli}</b></div><div class="k" style="border-bottom:1px solid #ddd"><span>Refus</span><b>${n.refus}</b></div></div>
<div style="display:flex;align-items:center;gap:16px;padding:16px;background:#f6f6f6;cursor:pointer" data-act="anon"><span style="flex:none;width:48px;height:26px;border-radius:13px;background:${S.anon ? "#000091" : "#929292"};position:relative"><span style="position:absolute;top:3px;${S.anon ? "right" : "left"}:3px;width:20px;height:20px;border-radius:50%;background:#fff"></span></span><span style="flex:1"><b>Anonymiser l'export</b><br><span class="txt2">Activé : l'export ne contient ni noms ni prénoms, seulement les résultats et les durées. Désactivé : il les inclut.</span></span></div>
${exported ? "" : `<div class="alert"><div class="ia">${IC.info()}</div><div class="tx"><h2 style="font-size:16px;margin-bottom:4px">Export non téléchargé</h2><p class="txt2">Le registre n'a pas encore été exporté. La suppression l'effacera sans retour possible.</p></div></div>`}
<div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn p" data-act="export">Exporter le registre (CSV)</button><button class="btn d" data-act="delask">Supprimer les données du poste</button><button class="btn s" data-act="back">Retour au contrôle</button></div></section>
<aside class="card" style="flex:1 1 300px;padding:24px;display:flex;flex-direction:column;gap:16px"><h2 style="font-size:18px">Ce qui est effacé</h2><p class="txt2">Le registre du jour et les préférences du poste (mode de lecture). Les certificats intégrés restent.</p><p class="txt2">Le registre contient les noms et prénoms des visiteurs du jour, uniquement dans ce navigateur. Ils disparaissent à la suppression.</p></aside></div>`;
  },
};

/* ---------- navigation / rendu ---------- */
const RESULT_LABEL = { ok: "Authentique", nonauth: "Non authentique", emetteur: "Émetteur non reconnu", expire: "Titre expiré", connexion: "Connexion interrompue", ecart: "Écart pré-annonce" };
function go(screen) {
  stopCamera(); S.scanning = false;
  S.screen = screen;
  if (screen === "connexion" && S.ctrl) S.ctrl.kind = "connexion";
  render();
}
function render() {
  $("#hdr").innerHTML = header();
  $("#app").innerHTML = (SCREENS[S.screen] || SCREENS.debut)();
  renderDemo(); window.scrollTo(0, 0);
}
function renderDemo() {
  $("#demo").innerHTML = `<b>Prototype · simuler :</b>` + [["ok", "Authentique"], ["nonauth", "Non authentique"], ["emetteur", "Émetteur inconnu"], ["expire", "Titre expiré"], ["connexion", "Connexion interrompue"]].map(([k, t]) => `<button data-act="demo" data-k="${k}">${t}</button>`).join("") + `<span style="opacity:.7;margin-left:auto">Les boutons ci-dessus ne sont là que pour la démonstration</span>`;
}
function person0(extra) { return Object.assign({ lastName: "LEFEBVRE", firstName: "Camille", usage: "Aucun", photo: null, expiry: "2026-09-12" }, extra || {}); }
function demo(kind) {
  bleReset(); stopCamera();
  const c = { t0: performance.now() - 14000, attempt: 2, sent: true, durationMs: kind === "nonauth" ? 27000 : 14000, qrAt: new Date(), kind, person: person0(), verif: { sigOk: true, integrityOk: true, chainOk: true, expired: false } };
  if (kind === "nonauth") c.verif = { sigOk: false, integrityOk: false, chainOk: false, expired: false };
  if (kind === "emetteur") c.verif.chainOk = false;
  if (kind === "expire") c.verif.expired = true;
  S.ctrl = c; go(kind);
}
function logResult(decision, extra) {
  const c = S.ctrl; if (!c || !c.kind) return;
  const p = c.person || {};
  addRecord(Object.assign({ result: RESULT_LABEL[c.kind] || c.kind, decision, durationMs: c.durationMs != null ? c.durationMs : performance.now() - c.t0, lastName: ["ok", "expire", "ecart"].includes(c.kind) ? p.lastName || "" : "", firstName: ["ok", "expire", "ecart"].includes(c.kind) ? p.firstName || "" : "", usage: ["ok", "expire", "ecart"].includes(c.kind) ? (p.usage === "Aucun" ? "" : p.usage || "") : "" }, extra || {}));
}
const ECART_LABEL = { nom: "Nom différent", prenom: "Prénom différent", absent: "Visiteur absent de la pré-annonce", autre: "Autre écart" };
const DEC_LABEL = { valide: "Entrée validée", refuse: "Entrée refusée", signal: "Signalement à la sécurité" };

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  switch (a) {
    case "registre": case "fin": await bleReset(); go(a); break;
    case "back": go(S.started ? "scan" : "debut"); break;
    case "recheck": liveChecks(); break;
    case "start": S.started = true; go("scan"); break;
    case "sansoutil": go("sansoutil"); break;
    case "maj": case "majretry":
      if (!navigator.onLine) { toast("Pas de connexion internet : la mise à jour n'est pas possible"); break; }
      LS.set(K.cert, new Date().toISOString().slice(0, 10)); toast("Liste de confiance mise à jour (simulation : la liste intégrée est conservée)");
      if (a === "maj") { liveChecks(); } else { S.ctrl = null; go("scan"); }
      break;
    case "help": toast(d.k === "bt" ? "Activez le Bluetooth du poste et utilisez Edge ou Chrome (HTTPS ou localhost)" : "Corrigez la date et l'heure du poste dans les paramètres Windows, puis relancez"); break;
    case "mode": S.mode = d.m; LS.set(K.mode, d.m); go("scan"); break;
    case "scan": S.scanning = true; render(); startCamera(); break;
    case "paste": { const v = $("#paste")?.value; if (v) onQr(v); break; }
    case "phys": await bleReset(); if (S.ctrl && !S.ctrl.kind) { S.ctrl.kind = "connexion"; S.ctrl.durationMs = performance.now() - S.ctrl.t0; } S.physMotif = d.m; S.ckPhys = [false, false, false]; S.physDecision = "valide"; go("repli"); break;
    case "ckp": S.ckPhys[+d.i] = !S.ckPhys[+d.i]; render(); break;
    case "pd": S.physDecision = d.k; render(); break;
    case "physsave": {
      const dur = S.ctrl ? (S.ctrl.durationMs != null ? S.ctrl.durationMs : performance.now() - S.ctrl.t0) : null;
      addRecord({ mode: "physique", result: "Titre physique", decision: DEC_LABEL[S.physDecision], motif: S.physMotif, durationMs: dur });
      S.ctrl = null; toast("Décision enregistrée"); go("scan"); break; }
    case "ecart": S.ecartKind = "nom"; S.ctrl.kind0 = S.ctrl.kind; S.ctrl.kind = "ecart"; go("ecart"); break;
    case "ek": S.ecartKind = d.k; render(); break;
    case "ecartdec": { const com = $("#com")?.value || ""; logResult(d.d, { motif: ECART_LABEL[S.ecartKind] + (com ? " : " + com : "") }); S.ctrl = null; toast("Décision enregistrée"); go("scan"); break; }
    case "decide": logResult(d.d); S.ctrl = null; toast("Décision enregistrée"); go("scan"); break;
    case "sign": logResult("Signalement"); S.ctrl = null; toast("Signalement consigné"); go("scan"); break;
    case "rescan": if (S.ctrl && S.ctrl.kind && S.ctrl.kind !== "ecart") logResult(d.d || "Nouvel essai"); else if (S.ctrl && S.ctrl.kind === "ecart") { S.ctrl.kind = S.ctrl.kind0; logResult("Nouvel essai"); } S.ctrl = null; go("scan"); break;
    case "cancel": await bleReset(); S.ctrl = null; go("scan"); break;
    case "assoc": { const c = S.ctrl; c.needGesture = false; runAttempt(c.afterFail ? 2 : c.retryAttempt || 1); break; }
    case "anon": S.anon = !S.anon; LS.set(K.anon, S.anon); render(); break;
    case "export": exportCsv(); if (S.screen === "fin") render(); break;
    case "delask": $("#modal").innerHTML = `<div class="modal"><div role="dialog" aria-modal="true"><h2 style="font-size:24px;line-height:1.3">Supprimer les données du poste ?</h2><p style="color:#3a3a3a">Le registre du jour (${counts().total} contrôles) et les données associées seront effacés. Cette action est définitive.</p>${LS.get("fi_exported", 0) ? "" : `<p style="font-size:14px;color:#b34000"><b>Le registre n'a pas été exporté.</b></p>`}<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;margin-top:8px"><button class="btn s" data-act="delcancel">Annuler</button><button class="btn s" data-act="export">Exporter d'abord</button><button class="btn d" data-act="delok">Supprimer définitivement</button></div></div></div>`; break;
    case "delcancel": $("#modal").innerHTML = ""; break;
    case "delok": LS.del(K.reg); LS.del("fi_exported"); LS.del(K.mode); $("#modal").innerHTML = ""; toast("Données du poste supprimées"); liveChecks(); break;
    case "demo": demo(d.k); break;
  }
});
setInterval(() => { const c = $("#clk"); if (c) { const n = new Date(); c.textContent = `Horloge poste d'accueil · ${fmtDate(n)} ${fmtTime(n)}`; } }, 15000);

/* ---------- démarrage ---------- */
(async function init() {
  try { window.IacaManager?.initializeIACAs?.(); } catch (e) { console.warn(e); }
  liveChecks();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
})();
window.__fi = { S, go, demo, counts };
})();
