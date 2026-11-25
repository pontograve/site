/* Ponto Grave · botão "Ouvir" nas tablaturas do blog (24/11/2026).
   Lê a tablatura do próprio texto e toca com amostras reais de baixo (licença CC0, em /assets/audio/tab/). */
(() => {
  const caixas = document.querySelectorAll('.tab-ouvir');
  if (!caixas.length) return;
  const SONS = { eletrico: 'Elétrico (dedo)', jazz: 'Jazz Bass', flat: 'Flatwound', palheta: 'Palheta', palm: 'Palheta + palm mute' };
  const ABERTA = { B: 23, E: 28, A: 33, D: 38, G: 43 };
  const BASE = '/assets/audio/tab/';
  let ctx, MAPA = null, ativo = null; const bufs = {};
  const mapa = () => MAPA ? Promise.resolve(MAPA) : fetch(BASE + 'mapa.json').then(r => r.json()).then(m => (MAPA = m));
  const perto = (l, m) => l.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a);
  const carregar = url => bufs[url] ? Promise.resolve(bufs[url]) : fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => (bufs[url] = b));
  function amostra(som, e) {
    const set = e.slap ? e.slap : (e.ghost || e.x) && som === 'eletrico' ? 'ghost' : som;
    const base = perto(MAPA[set], e.midi); return [base, `${BASE}${set}_${base}.mp3`];
  }
  function tocarNota(t, som, e, dur) {
    const [base, url] = amostra(som, e), b = bufs[url]; if (!b) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = Math.pow(2, (e.midi - base) / 12);
    const leve = e.ghost || e.x, d = e.slap ? Math.min(dur, e.x ? .12 : .9) : leve ? (som === 'eletrico' ? .25 : .07) : som === 'palm' ? .22 : Math.min(dur, 1.6);
    const v = e.slap ? (e.x ? .5 : 1) : leve ? (som === 'eletrico' ? .8 : .22) : 1;
    g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + d); g.gain.linearRampToValueAtTime(.0001, t + d + .06);
    s.connect(g).connect(ctx.destination); s.start(t); s.stop(t + d + .1);
  }
  function clique(t, forte) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = forte ? 1500 : 1000; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .04); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .05); }

  // Lê a tablatura: linhas de corda (G|, D|, A|, E|, B|), contagem opcional (1 e 2 e…) e linha de slap (T/P)
  function ler(texto) {
    const L = texto.replace(/\r/g, '').split('\n');
    const cordas = L.map((l, i) => [l, i]).filter(([l]) => /^[GDAEB]\|/.test(l));
    const cont = L.find(l => /^\s+1(\s|$)/.test(l) && !/[|]/.test(l));
    const slapL = L.find(l => /^\s+[TP](\s+[TP])+\s*$/.test(l));
    const notas = [];
    for (const [l, li] of cordas) for (let c = 2; c < l.length; c++) {
      const ch = l[c];
      if (/\d/.test(ch) && !/\d/.test(l[c - 1])) { const n = /\d/.test(l[c + 1]) ? +(ch + l[c + 1]) : +ch; notas.push({ col: c, linha: li, midi: ABERTA[l[0]] + n }); }
      else if (ch === 'x' || ch === 'g') { let p = 0; for (let k = c - 1; k > 1; k--) if (/\d/.test(l[k])) { p = +l[k]; break; } notas.push({ col: c, linha: li, midi: ABERTA[l[0]] + p, x: ch === 'x', ghost: ch === 'g' }); }
    }
    // slap: T = polegar, P = pop, tocados com as gravações reais de slap (BMC, CC BY 3.0)
    if (slapL) notas.forEach(n => { const k = slapL[n.col] || slapL[n.col - 1] || slapL[n.col + 1]; if (k === 'T') n.slap = 'thumb'; else if (k === 'P') n.slap = 'pop'; });
    let tempos;   // tempo (em batidas) de cada coluna
    if (cont) {
      const toks = []; for (const m of cont.matchAll(/\S+/g)) toks.push({ col: m.index, t: m[0] });
      let batida = -1, dentro = [];
      const grupos = [];
      toks.forEach(k => { if (/^[1-9]$/.test(k.t)) { dentro = [k]; grupos.push(dentro); } else if (dentro.length) dentro.push(k); });
      const pos = []; grupos.forEach((g, bi) => g.forEach((k, j) => pos.push({ col: k.col, tempo: bi + j / g.length })));
      tempos = col => pos.reduce((a, p) => Math.abs(p.col - col) < Math.abs(a.col - col) ? p : a, pos[0]).tempo;
      var total = grupos.length;
    } else {
      // sem contagem: uma nota por colcheia, da esquerda para a direita; se duas cordas dividem a mesma coluna
      // (desenho de escala), lê corda por corda, da mais grave para a mais aguda
      const cols = [...new Set(notas.map(n => n.col))].sort((a, b) => a - b);
      if (cols.length < notas.length) {
        const ordem = notas.slice().sort((a, b) => b.linha - a.linha || a.col - b.col);
        ordem.forEach((n, i) => n.tempo = i / 2);
        return { notas, total: Math.ceil(ordem.length / 2), linhas: cordas.map(([, i]) => i) };
      }
      tempos = col => cols.indexOf(col) / 2; total = cols.length / 2;
    }
    notas.forEach(n => n.tempo = tempos(n.col));
    return { notas, total: Math.ceil(total), linhas: cordas.map(([, i]) => i) };
  }

  caixas.forEach(cx => {
    const pre = cx.querySelector('pre'), dados = ler(pre.textContent);
    if (!dados.notas.length) return;
    // cada caractere vira um <span> para acender a nota que está tocando
    const linhas = pre.textContent.split('\n');
    pre.innerHTML = linhas.map(l => [...l].map((c, i) => `<span data-c="${i}">${c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('')).join('\n');
    let som = cx.dataset.som || 'eletrico', bpm = +cx.dataset.bpm || 80, lento = true, loop = false, met = true, timers = [];
    const temSlap = dados.notas.some(n => n.slap);
    const barra = document.createElement('div'); barra.className = 'tab-barra';
    barra.innerHTML = `<button class="tb-play" type="button">▶ Ouvir</button>
      <button class="tb-vel sel" type="button" data-l="1">Devagar</button><button class="tb-vel" type="button" data-l="0">No tempo</button>
      <button class="tb-loop" type="button">Repetir</button><button class="tb-met sel" type="button">Metrônomo</button>
      <select class="tb-som" aria-label="Som do baixo">${Object.entries(SONS).map(([k, v]) => `<option value="${k}"${k === som ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <span class="tb-st"></span>${temSlap ? '<span class="tb-aviso">Slap: <a href="https://ccmixter.org/files/bmccosar/13742" target="_blank" rel="noopener">BMC slap bass samples</a>, Bruce H. McCosar, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a></span>' : ''}`;
    cx.appendChild(barra);
    const btn = barra.querySelector('.tb-play'), st = barra.querySelector('.tb-st');
    barra.querySelectorAll('.tb-vel').forEach(b => b.onclick = () => { lento = b.dataset.l === '1'; barra.querySelectorAll('.tb-vel').forEach(x => x.classList.toggle('sel', x === b)); });
    barra.querySelector('.tb-loop').onclick = e => { loop = !loop; e.target.classList.toggle('sel', loop); };
    barra.querySelector('.tb-met').onclick = e => { met = !met; e.target.classList.toggle('sel', met); };
    barra.querySelector('.tb-som').onchange = e => { som = e.target.value; };
    const acende = col => { pre.querySelectorAll('.on').forEach(x => x.classList.remove('on')); if (col == null) return; pre.querySelectorAll(`[data-c="${col}"]`).forEach(x => { if (/[\dxgTP]/.test(x.textContent)) x.classList.add('on'); }); };
    const parar = () => { timers.forEach(clearTimeout); timers = []; acende(null); st.textContent = ''; btn.textContent = '▶ Ouvir'; if (ativo === parar) ativo = null; };
    const tocar = contar => {
      const b = 60 / (lento ? Math.round(bpm * .7) : bpm), t0 = ctx.currentTime + .15; let ini = t0;
      if (contar) { for (let k = 0; k < 4; k++) { clique(t0 + k * b, !k); timers.push(setTimeout(() => st.textContent = 'Contagem: ' + (k + 1), k * b * 1000)); } ini += 4 * b; }
      if (met) for (let k = 0; k < dados.total; k++) clique(ini + k * b, k % 4 === 0);
      const ord = dados.notas.slice().sort((a, c) => a.tempo - c.tempo);
      ord.forEach((n, i) => { const prox = ord.find(o => o.tempo > n.tempo); const dur = ((prox ? prox.tempo : dados.total) - n.tempo) * b;
        tocarNota(ini + n.tempo * b, som, n, dur);
        timers.push(setTimeout(() => { st.textContent = ''; acende(n.col); }, (ini - ctx.currentTime + n.tempo * b) * 1000)); });
      timers.push(setTimeout(() => loop ? tocar(false) : parar(), (ini - ctx.currentTime + dados.total * b) * 1000));
    };
    btn.onclick = async () => {
      if (btn.textContent.includes('Parar')) return parar();
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume();
      if (ativo) ativo(); ativo = parar; btn.textContent = '❚❚ Parar'; st.textContent = 'Carregando…';
      try { await mapa(); await Promise.all(dados.notas.map(n => carregar(amostra(som, n)[1]))); } catch (e) { st.textContent = 'Não deu para carregar o som.'; return; }
      tocar(true);
      if (window.gtag) gtag('event', 'tab_ouvir', { som, pagina: location.pathname });
    };
  });
})();
