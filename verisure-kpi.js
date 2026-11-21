// Verisure — stato condiviso, bonus e KPI del mese
// Usato da verisure.html (calcolatore), attivita.html (KPI completi) e index.html (riepilogo).
// Dati: Supabase social_appunti, chiave 'verisure_calc' (JSON). Solo numeri, nessun dato cliente.
(function () {
  const URL_ = 'https://lbizlnuzlesrkvsobzqz.supabase.co';
  const KEY_ = 'sb_publishable_2Rd36YkPvlsQI1BkdY0PrQ_od0d115R';
  const H = { 'apikey': KEY_, 'Authorization': 'Bearer ' + KEY_, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
  const CHIAVE = 'verisure_calc', LS = 'verisure_calc_v1';

  // Obiettivo mensile (confermato da Emanuela 21/11/2026)
  const GOAL = {
    app:  { re: 5, rp: 10, rpb: 10 },
    vend: { re: 2, rp: 3,  rpb: 2 },
    conv: { re: 0.375, rp: 0.30, rpb: 0.20 },
  };
  const NOMI = { re: 'RE · dall\'azienda', rp: 'RP Home', rpb: 'RP Business' };

  const periodoOggi = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const meseVuoto = () => ({ periodo: periodoOggi(), rp: 0, rpb: 0, re: 0, app_re: 0, app_rp: 0, app_rpb: 0, provv: 0 });

  function base() {
    return { cliente: 'res', origine: 'rp', installo: false, grandiConti: false, wp3: false, minimo: true, righe: {}, mese: meseVuoto(), storico: [] };
  }

  // normalizza + cambio mese automatico
  function normalizza(s) {
    s = Object.assign(base(), s || {});
    s.mese = Object.assign(meseVuoto(), s.mese || {});
    if (s.mese.booking !== undefined) { if (!s.mese.app_rp) s.mese.app_rp = s.mese.booking; delete s.mese.booking; }
    if (!s.mese.periodo) s.mese.periodo = periodoOggi();
    if (s.mese.periodo !== periodoOggi()) {
      const c = calcola(s);
      s.storico = [{ ...s.mese, bonus: c.bonus.tot, maturato: c.maturato, pagato: c.pagato }, ...(s.storico || [])].slice(0, 24);
      s.mese = meseVuoto();
      s._daSalvare = true;
    }
    return s;
  }

  let _esiste = false, _timer = null, _st = null;
  async function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {}
    try {
      const r = await fetch(`${URL_}/rest/v1/social_appunti?chiave=eq.${CHIAVE}&limit=1`, { headers: H });
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) { _esiste = true; s = JSON.parse(rows[0].valore || '{}'); }
    } catch (e) {}
    _st = normalizza(s);
    if (_st._daSalvare) { delete _st._daSalvare; save(_st, true); }
    return _st;
  }
  function loadLocale() { let s = null; try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {} _st = normalizza(s); delete _st._daSalvare; return _st; }

  async function push(s) {
    const body = JSON.stringify({ chiave: CHIAVE, valore: JSON.stringify(s) });
    try {
      if (_esiste) await fetch(`${URL_}/rest/v1/social_appunti?chiave=eq.${CHIAVE}`, { method: 'PATCH', headers: H, body });
      else { const r = await fetch(`${URL_}/rest/v1/social_appunti`, { method: 'POST', headers: H, body }); if (r.ok) _esiste = true; }
    } catch (e) {}
  }
  function save(s, subito) {
    _st = s;
    try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {}
    clearTimeout(_timer);
    if (subito) push(s); else _timer = setTimeout(() => push(s), 700);
  }

  // ── BONUS piano nuovo venditore (M1-M4) ──
  const bonusRP = n => n < 2 ? 0 : n <= 9 ? 300 + (n - 2) * 100 : 1000 + (n - 9) * 100;
  const bonusRE = n => n < 2 ? 0 : Math.min(n, 5) * 100;
  const bonusRPB = (n, rp) => rp >= 2 ? Math.min(n, 3) * 200 : 0;      // solo con target minimo RP (2 RP)
  const booking = m => (m.app_rp || 0) + (m.app_rpb || 0);
  const bonusBook = m => (m.rp >= 2 && booking(m) > 0 && (m.rp + m.rpb) / booking(m) >= 0.5) ? 150 : 0;
  const bonus3wp = n => n >= 2 ? 1000 : n === 1 ? 500 : 0;
  function bonusTot(m, wp3) {
    if (wp3) { const b = bonus3wp(m.rp + m.rpb + m.re); return { tot: b, det: [['Bonus formazione (3 settimane)', b]] }; }
    const det = [
      ['Bonus RP Home', bonusRP(m.rp)],
      ['Bonus RP Business', bonusRPB(m.rpb, m.rp)],
      ['Bonus RE', bonusRE(m.re)],
      ['Bonus RP/booking ≥ 0,5', bonusBook(m)],
    ];
    return { tot: det.reduce((s, d) => s + d[1], 0), det };
  }

  function calcola(s) {
    const m = s.mese;
    const bonus = bonusTot(m, s.wp3);
    const maturato = (m.provv || 0) + bonus.tot;
    const minimo = s.minimo ? minimoMese(m.periodo, insDi(s)) : 0;
    const pagato = Math.max(minimo, maturato);
    return { bonus, maturato, pagato, minimo };
  }

  // ── UI ──
  const eur = n => (n < 0 ? '− ' : '') + '€ ' + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;

  function avanzamentoMese() {
    const d = new Date(), tot = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() / tot;
  }

  const CSS = `
    .vk-wrap { font-size: 0.86rem; }
    .vk-types { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
    .vk-type { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
    .vk-type-nome { font-weight: 700; margin-bottom: 8px; }
    .vk-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; }
    .vk-k { color: var(--text-muted); font-size: 0.78rem; }
    .vk-step { display: inline-flex; align-items: center; gap: 6px; }
    .vk-step button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); font-size: 1rem; cursor: pointer; color: var(--text); }
    .vk-step b { min-width: 44px; text-align: center; }
    .vk-bar { height: 8px; border-radius: 20px; background: var(--border); overflow: hidden; margin: 4px 0 2px; }
    .vk-bar > div { height: 100%; background: var(--accent); border-radius: 20px; }
    .vk-bar > div.ok { background: #4a9e6b; }
    .vk-conv { font-size: 0.74rem; color: var(--text-muted); margin-top: 6px; }
    .vk-conv b.ok { color: #2e7d4f; } .vk-conv b.ko { color: #8b3a3a; }
    .vk-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .vk-box { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
    .vk-box h4 { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
    .vk-big { font-size: 1.6rem; font-weight: 800; color: #2e7d4f; }
    .vk-note { font-size: 0.76rem; color: var(--text-muted); margin-top: 6px; line-height: 1.45; }
    .vk-storico { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 6px; }
    .vk-storico td, .vk-storico th { padding: 5px 6px; text-align: center; border-top: 1px solid var(--border); }
    .vk-storico th { font-size: 0.62rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.08em; }
    .vk-link { display: inline-block; margin-top: 10px; font-size: 0.78rem; color: var(--accent); font-weight: 600; text-decoration: none; }
    @media (max-width: 800px) { .vk-types, .vk-bottom { grid-template-columns: 1fr; } }
  `;
  function css() { if (document.getElementById('vk-css')) return; const st = document.createElement('style'); st.id = 'vk-css'; st.textContent = CSS; document.head.appendChild(st); }

  function barra(v, g) { const p = Math.min(pct(v, g), 100); return `<div class="vk-bar"><div class="${v >= g ? 'ok' : ''}" style="width:${p}%"></div></div>`; }

  // KPI completi (pagina Task) — modificabili
  function renderKPI(el, s) {
    css();
    const m = s.mese, c = calcola(s), av = avanzamentoMese();
    const totApp = m.app_re + m.app_rp + m.app_rpb, totV = m.re + m.rp + m.rpb;
    const gApp = GOAL.app.re + GOAL.app.rp + GOAL.app.rpb, gV = GOAL.vend.re + GOAL.vend.rp + GOAL.vend.rpb;
    const proiez = av > 0 ? Math.round(totV / av) : totV;
    const tipi = ['re', 'rp', 'rpb'].map(t => {
      const app = m['app_' + t], v = m[t], conv = app > 0 ? v / app : null, target = GOAL.conv[t];
      return `<div class="vk-type">
        <div class="vk-type-nome">${NOMI[t]}</div>
        <div class="vk-row"><span class="vk-k">Appuntamenti</span>
          <span class="vk-step"><button type="button" onclick="VK.step('app_${t}',-1)">−</button><b>${app} / ${GOAL.app[t]}</b><button type="button" onclick="VK.step('app_${t}',1)">+</button></span></div>
        ${barra(app, GOAL.app[t])}
        <div class="vk-row"><span class="vk-k">Vendite</span>
          <span class="vk-step"><button type="button" onclick="VK.step('${t}',-1)">−</button><b>${v} / ${GOAL.vend[t]}</b><button type="button" onclick="VK.step('${t}',1)">+</button></span></div>
        ${barra(v, GOAL.vend[t])}
        <div class="vk-conv">Conversione: ${conv === null ? '—' : `<b class="${conv >= target ? 'ok' : 'ko'}">${Math.round(conv * 100)}%</b>`} · obiettivo ${Math.round(target * 100)}%</div>
      </div>`;
    }).join('');

    const book = booking(m), ratio = book > 0 ? (m.rp + m.rpb) / book : null;
    const storico = (s.storico || []).slice(0, 6);
    const nomiM = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const labelP = p => { const [y, mm] = p.split('-'); return nomiM[parseInt(mm) - 1] + ' ' + y; };

    el.innerHTML = `<div class="vk-wrap">
      <div class="vk-types">${tipi}</div>
      <div class="vk-bottom">
        <div class="vk-box">
          <h4>Obiettivo del mese — ${labelP(m.periodo)}</h4>
          <div class="vk-row"><span>Appuntamenti</span><b>${totApp} / ${gApp}</b></div>${barra(totApp, gApp)}
          <div class="vk-row"><span>Vendite</span><b>${totV} / ${gV}</b></div>${barra(totV, gV)}
          <div class="vk-note">Siamo al ${Math.round(av * 100)}% del mese. Con questo ritmo chiudi a <b>${proiez} vendite</b> ${proiez >= gV ? '✅' : `(obiettivo ${gV})`}.
          ${ratio !== null ? `<br>Rapporto RP/booking: <b>${ratio.toFixed(2).replace('.', ',')}</b> ${ratio >= 0.5 ? '✅ bonus +150 €' : '(serve almeno 0,5)'}` : ''}</div>
        </div>
        <div class="vk-box">
          <h4>Guadagno del mese</h4>
          <div class="vk-row"><span class="vk-k">Provvigioni + installazioni</span><span>${eur(m.provv)}</span></div>
          ${c.bonus.det.filter(d => d[1]).map(d => `<div class="vk-row"><span class="vk-k">${d[0]}</span><span>${eur(d[1])}</span></div>`).join('') || '<div class="vk-row"><span class="vk-k">Bonus</span><span>€ 0</span></div>'}
          <div class="vk-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:6px"><span>Maturato</span><b>${eur(c.maturato)}</b></div>
          <div class="vk-row"><span>${c.minimo ? `Ti arriva (minimo ${eur(c.minimo)})` : 'Ti arriva'}</span><span class="vk-big">${eur(c.pagato)}</span></div>
          <label class="vk-note" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${s.minimo ? 'checked' : ''} onchange="VK.setMinimo(this.checked)"> Conta il minimo garantito (si calcola da solo mese per mese)</label>
        </div>
      </div>
      ${storico.length ? `<div class="vk-box" style="margin-top:12px"><h4>Mesi chiusi</h4>
        <table class="vk-storico"><tr><th>Mese</th><th>App.</th><th>Vendite</th><th>RE</th><th>RP</th><th>RPB</th><th>Maturato</th><th>Pagato</th></tr>
        ${storico.map(r => `<tr><td>${labelP(r.periodo)}</td><td>${r.app_re + r.app_rp + r.app_rpb}</td><td>${r.re + r.rp + r.rpb}</td><td>${r.re}</td><td>${r.rp}</td><td>${r.rpb}</td><td>${eur(r.maturato || 0)}</td><td>${eur(r.pagato || 0)}</td></tr>`).join('')}
        </table></div>` : ''}
      <a class="vk-link" href="verisure.html">→ Calcolatore: costruisci un'offerta e registra la vendita</a>
    </div>`;
  }

  // Riepilogo compatto (Dashboard)
  function renderMini(el, s) {
    css();
    const m = s.mese, c = calcola(s);
    const totApp = m.app_re + m.app_rp + m.app_rpb, totV = m.re + m.rp + m.rpb;
    const gApp = GOAL.app.re + GOAL.app.rp + GOAL.app.rpb, gV = GOAL.vend.re + GOAL.vend.rp + GOAL.vend.rpb;
    el.innerHTML = `<div class="vk-wrap">
      <div class="vk-row"><span>Appuntamenti</span><b>${totApp} / ${gApp}</b></div>${barra(totApp, gApp)}
      <div class="vk-row"><span>Vendite</span><b>${totV} / ${gV}</b></div>${barra(totV, gV)}
      <div class="vk-note">RE ${m.re}/${GOAL.vend.re} · RP Home ${m.rp}/${GOAL.vend.rp} · RP Business ${m.rpb}/${GOAL.vend.rpb}</div>
      <div class="vk-row" style="margin-top:8px"><span>Guadagno del mese</span><span class="vk-big">${eur(c.pagato)}</span></div>
      <div class="vk-note">Maturato ${eur(c.maturato)}${c.minimo && c.maturato < c.minimo ? ` · coperto dal minimo di ${eur(c.minimo)}` : ''}</div>
      ${(() => { const b = stato3wp(s); return b.mancano >= 0 ? `<div class="vk-note" style="color:#c8102e;font-weight:600">🎯 Bonus formazione: ${b.vendite3wp}/2 vendite · ${eur(b.bonus)} · mancano ${b.mancano} giorni</div>` : ''; })()}
      <a class="vk-link" href="mara.html">→ Bonus e rimborsi</a> · <a class="vk-link" href="attivita.html">KPI completi</a>
    </div>`;
  }

  // ── BONUS, RIMBORSI E AUTO (piano provvigionale nuovo venditore + addendum newbies, firmati 20/11/2026) ──
  const INSERIMENTO = '2026-11-20';
  const extraBase = () => ({ inserimento: INSERIMENTO, fine3wp: '2026-12-06', vendite3wp: 0, costoAuto: 0, certInstallatore: false });
  const insDi = s => ((s && s.extra && s.extra.inserimento) || INSERIMENTO);
  const gg = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const fmtData = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

  // Mesi di permanenza: il mese di inserimento conta come 1° solo se si sono fatte almeno 2 settimane + 1 giorno
  // entro la chiusura contabile; altrimenti anche il mese dopo è "1° mese".
  function pianoMesi(insIso) {
    const ins = new Date(insIso || INSERIMENTO), y = ins.getFullYear(), m = ins.getMonth();
    const fineMese = new Date(y, m + 1, 0), giorni = fineMese.getDate();
    const presenti = giorni - ins.getDate() + 1;
    const nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const out = [{ y, m, fase: presenti >= 15 ? 'M1' : 'M1 (parziale)', quota: presenti / giorni, presenti, giorni }];
    let n = presenti >= 15 ? 2 : 1;
    for (let i = 1; out.length < 6; i++) {
      const dt = new Date(y, m + i, 1);
      out.push({ y: dt.getFullYear(), m: dt.getMonth(), fase: n <= 4 ? 'M' + n : 'dal 5° mese', quota: 1 });
      n++;
    }
    return out.map(r => ({ ...r, label: nomi[r.m] + ' ' + r.y }));
  }

  // minimo garantito del mese: 1.000 € da M1 a M4, in proporzione ai giorni nel mese di inserimento, 0 dopo
  function minimoMese(periodo, insIso) {
    const r = pianoMesi(insIso).find(x => x.y + '-' + String(x.m + 1).padStart(2, '0') === periodo);
    if (!r) return new Date(periodo + '-01') < new Date(INSERIMENTO) ? 0 : 0;
    return /^M[1-4]/.test(r.fase) ? Math.round(1000 * r.quota) : 0;
  }

  function renderBonus(el, s) {
    css();
    const x = Object.assign(extraBase(), s.extra || {});
    const oggi = new Date().toISOString().slice(0, 10);
    const mancano = gg(oggi, x.fine3wp);
    const b3 = x.vendite3wp >= 2 ? 1000 : x.vendite3wp === 1 ? 500 : 0;
    const mesi = pianoMesi(x.inserimento);
    const auto30 = x.costoAuto ? Math.round(x.costoAuto * 0.3) : null;

    const righe = mesi.map(r => {
      const nuovo = /^M[1-4]/.test(r.fase);
      const minimo = nuovo ? Math.round(1000 * r.quota) : null;
      const rimbAuto = nuovo ? Math.round(150 * r.quota) : null;
      const altro = [];
      if (r.fase.includes('parziale')) altro.push('Carburante formazione 110 €');
      if (r.fase.includes('parziale')) altro.push(`Bonus formazione ${b3 ? eur(b3) : '(0 vendite finora)'}`);
      if (r.fase === 'M4') altro.push('Certificazione specialista 200 € (a fine mese)');
      const nomiP = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
      const pag = new Date(r.y, r.m + 1, 15);
      const totMese = (minimo || 0) + (rimbAuto || 0) + (r.fase.includes('parziale') ? 110 + b3 : 0);
      const auto = nuovo ? '100% coperta' : `70% coperta${auto30 !== null ? ` · a tuo carico ~${eur(auto30)}/mese` : ' · 30% a tuo carico'}`;
      return `<tr><td><b>${r.label}</b><br><span class="vk-k">${r.fase}${r.presenti ? ` · ${r.presenti} gg su ${r.giorni}` : ''}</span></td>
        <td>${minimo !== null ? eur(minimo) : '—'}</td><td>${rimbAuto !== null ? eur(rimbAuto) : '—'}</td>
        <td style="text-align:left">${altro.join('<br>') || '—'}</td><td style="text-align:left">${auto}</td>
        <td><b>15 ${nomiP[pag.getMonth()]} ${pag.getFullYear()}</b>${totMese ? `<br><span class="vk-k">almeno ${eur(totMese)}</span>` : ''}</td></tr>`;
    }).join('');

    el.innerHTML = `<div class="vk-wrap">
      <div class="vk-bottom">
        <div class="vk-box" style="border-color:${mancano >= 0 ? '#c8102e' : 'var(--border)'}">
          <h4>🎯 Bonus formazione (3 Week Program)</h4>
          <div class="vk-row"><span>Scadenza</span><b>${fmtData(x.fine3wp)} ${mancano >= 0 ? `· mancano ${mancano} giorni` : '· chiusa'}</b></div>
          <div class="vk-row"><span class="vk-k">Vendite fatte in formazione</span>
            <span class="vk-step"><button type="button" onclick="VK.setExtra('vendite3wp', Math.max(0, ${x.vendite3wp} - 1))">−</button><b>${x.vendite3wp} / 2</b><button type="button" onclick="VK.setExtra('vendite3wp', Math.min(2, ${x.vendite3wp} + 1))">+</button></span></div>
          ${barra(x.vendite3wp, 2)}
          <div class="vk-row"><span>Bonus</span><span class="vk-big">${eur(b3)}</span></div>
          <div class="vk-note">1 vendita = 500 € · 2 vendite = 1.000 €. Arriva con il pagamento del 15 dicembre. Queste vendite non danno provvigione diretta.
            <br>Fine formazione: <input type="date" value="${x.fine3wp}" onchange="VK.setExtra('fine3wp', this.value)" style="font:inherit;font-size:0.76rem;border:1px solid var(--border);border-radius:6px;padding:2px 4px;background:var(--bg-card)"></div>
        </div>
        <div class="vk-box">
          <h4>🚗 Auto e rimborsi</h4>
          <div class="vk-row"><span class="vk-k">Carburante formazione (una tantum)</span><b>110 €</b></div>
          <div class="vk-row"><span class="vk-k">Rimborso auto (primi 4 mesi)</span><b>150 €/mese</b></div>
          <div class="vk-row"><span class="vk-k">Auto aziendale, primi 4 mesi</span><b>100% coperta</b></div>
          <div class="vk-row"><span class="vk-k">Auto aziendale, dopo</span><b>70% (100% se Elite/Executive)</b></div>
          <div class="vk-row"><span class="vk-k">Costo mensile auto (€)</span><input type="number" min="0" value="${x.costoAuto || ''}" placeholder="da sapere" onchange="VK.setExtra('costoAuto', parseFloat(this.value)||0)" style="width:90px;font:inherit;border:1px solid var(--border);border-radius:6px;padding:4px 6px;background:var(--bg-card)"></div>
          <div class="vk-note">Il carburante (110 €) copre i 4 giorni di formazione in aula a Livorno, dal 16 al 19/11: si riconosce dopo la prima settimana e arriva con le provvigioni di fine mese. Rimborso auto pieno solo per i mesi interi, altrimenti in proporzione ai giorni.</div>
        </div>
      </div>

      <div class="vk-box" style="margin-top:12px;overflow-x:auto">
        <h4>📅 Mese per mese: cosa ti spetta oltre alle vendite</h4>
        <table class="vk-storico"><tr><th style="text-align:left">Mese</th><th>Minimo garantito</th><th>Rimborso auto</th><th style="text-align:left">Altro</th><th style="text-align:left">Auto aziendale</th><th>Pagato il</th></tr>${righe}</table>
        <div class="vk-note">Ogni mese si paga il 15 del mese dopo. "Almeno" = minimo + rimborso auto (a novembre anche carburante e bonus formazione), senza contare provvigioni e bonus delle vendite. Il minimo scatta solo se provvigioni e bonus del mese restano sotto quella cifra. Data di inserimento: <input type="date" value="${x.inserimento}" onchange="VK.setExtra('inserimento', this.value)" style="font:inherit;font-size:0.76rem;border:1px solid var(--border);border-radius:6px;padding:2px 4px;background:var(--bg-card)">. Se nel primo mese fai meno di 15 giorni, conta in proporzione e anche il mese dopo vale come 1° mese. Da confermare con Francesco: firma del contratto (20/11) o inizio formazione (16/11).</div>
      </div>

      <div class="vk-bottom" style="margin-top:12px">
        <div class="vk-box">
          <h4>🏅 Certificazioni</h4>
          <div class="vk-row"><span class="vk-k">Specialista di sicurezza (fine 4° mese)</span><b>200 €</b></div>
          <div class="vk-row"><span class="vk-k">Corso venditore installatore</span><b>300 €</b></div>
          <label class="vk-note" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${x.certInstallatore ? 'checked' : ''} onchange="VK.setExtra('certInstallatore', this.checked)"> Ho la certificazione da installatrice</label>
          <div class="vk-row"><span class="vk-k">Installazione fino a 12 elementi / da 13</span><b>60 € / 100 €</b></div>
          <div class="vk-row"><span class="vk-k">Manutenzione con / senza ampliamento</span><b>25 € / 15 €</b></div>
        </div>
        <div class="vk-box">
          <h4>⭐ Più avanti</h4>
          <div class="vk-row"><span class="vk-k">Elite: 12 RP in 2 mesi (min. 4 al mese)</span><b>carburante 300 €/mese</b></div>
          <div class="vk-row"><span class="vk-k">Executive</span><b>+ bonus vacanza 500 €</b></div>
          <div class="vk-row"><span class="vk-k">Porti una persona che vende il 1° mese</span><b>500 € (750 € con 3 vendite)</b></div>
          <div class="vk-row"><span class="vk-k">…e arriva al target al 4° mese</span><b>premio 750 € o 500 €</b></div>
          <div class="vk-row"><span class="vk-k">Agente di commercio, 100 vendite l'anno per 3 anni</span><b>2.000 €</b></div>
        </div>
      </div>
    </div>`;
  }

  // azioni dalla pagina Task
  let _el = null, _elB = null;
  async function montaKPI(el) { _el = el; const s = await load(); renderKPI(el, s); }
  async function montaBonus(el) { _elB = el; const s = await load(); renderBonus(el, s); }
  function ridisegna(s) { if (_el) renderKPI(_el, s); if (_elB) renderBonus(_elB, s); }
  function step(campo, d) { const s = _st; s.mese[campo] = Math.max(0, (s.mese[campo] || 0) + d); save(s); ridisegna(s); }
  function setMinimo(v) { const s = _st; s.minimo = v; save(s); ridisegna(s); }
  function setExtra(k, v) { const s = _st; s.extra = Object.assign(extraBase(), s.extra || {}, { [k]: v }); save(s); ridisegna(s); }
  function stato3wp(s) { const x = Object.assign(extraBase(), s.extra || {}); return { ...x, bonus: x.vendite3wp >= 2 ? 1000 : x.vendite3wp === 1 ? 500 : 0, mancano: gg(new Date().toISOString().slice(0, 10), x.fine3wp) }; }

  window.VK = { GOAL, NOMI, load, loadLocale, save, normalizza, bonusTot, calcola, booking, renderKPI, renderMini, renderBonus, montaKPI, montaBonus, step, setMinimo, setExtra, stato3wp };
})();
