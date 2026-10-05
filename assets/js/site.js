/* Ponto Grave · interações do site (sem bibliotecas). */
(() => {
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toque = matchMedia('(hover: none)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Som: cordas de baixo sintetizadas (Karplus-Strong) ---------- */
  let ctx = null, somLigado = false;
  try { somLigado = localStorage.getItem('pg-som') === '1'; } catch (e) {}
  const audio = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  // Corda de baixo por modelo físico (Karplus-Strong estendido):
  // excitação de dedo com o ponto de toque (filtro em pente), perda de agudos dentro do laço da corda,
  // afinação fracionária, "thump" do dedo; depois corpo, amplificador valvulado leve e compressor.
  const cache = {};
  function buffer(freq) {
    const ac = audio(), sr = ac.sampleRate, chave = Math.round(freq * 10);
    if (cache[chave]) return cache[chave];
    const n = Math.floor(sr * 3.4), P = sr / freq;                     // período em amostras (fracionário)
    const N = Math.floor(P - 0.5), frac = P - 0.5 - N;                // atraso inteiro + parte fracionária
    const ap = (1 - frac) / (1 + frac);                               // passa-tudo para a afinação exata
    const buf = ac.createBuffer(1, n, sr), y = buf.getChannelData(0);
    // excitação: ruído suave (polpa do dedo) com o ponto de toque a ~18% da corda
    const exc = new Float32Array(N + 2); let lp = 0;
    for (let i = 0; i < exc.length; i++) { lp += 0.22 * ((Math.random() * 2 - 1) - lp); exc[i] = lp; }
    const pt = Math.max(1, Math.round(N * 0.18));
    for (let i = exc.length - 1; i >= pt; i--) exc[i] -= exc[i - pt];
    // laço da corda: perda que aumenta com a frequência (cordas graves soam mais)
    const g = Math.pow(0.001, 1 / (freq * (freq < 60 ? 3.6 : freq < 90 ? 3.0 : 2.4)));
    const brilho = 0.5 + Math.min(0.12, freq / 2000);
    let apX = 0, apY = 0, ant = 0;
    for (let i = 0; i < n; i++) {
      const atr = i - N, v = atr >= 0 ? y[atr] : 0;
      const filtrado = brilho * v + (1 - brilho) * ant; ant = v;          // perda de agudos no laço
      const afinado = ap * filtrado + apX - ap * apY; apX = filtrado; apY = afinado;
      y[i] = (i < exc.length ? exc[i] : 0) + g * afinado;
    }
    // "thump": batida grave e curta do dedo contra a corda e o captador
    for (let i = 0; i < sr * 0.03; i++) { const tt = i / sr; y[i] += 0.35 * Math.sin(2 * Math.PI * freq * tt) * Math.exp(-tt * 120); }
    let pico = 0; for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(y[i]));
    for (let i = 0; i < n; i++) y[i] /= pico || 1;
    return (cache[chave] = buf);
  }
  let saida = null;
  function cadeia() {   // corpo do baixo, amplificador e compressor, criados uma vez
    if (saida) return saida;
    const ac = audio();
    const corpo1 = ac.createBiquadFilter(); corpo1.type = 'peaking'; corpo1.frequency.value = 100; corpo1.Q.value = 1.1; corpo1.gain.value = 4;
    const corpo2 = ac.createBiquadFilter(); corpo2.type = 'peaking'; corpo2.frequency.value = 250; corpo2.Q.value = 1.4; corpo2.gain.value = 2.5;
    const caixa = ac.createBiquadFilter(); caixa.type = 'lowpass'; caixa.frequency.value = 3200; caixa.Q.value = 0.6;   // falante de baixo
    const valvula = ac.createWaveShaper(); const curva = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curva[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
    valvula.curve = curva; valvula.oversample = '2x';
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    const vol = ac.createGain(); vol.gain.value = 0.8;
    corpo1.connect(corpo2).connect(valvula).connect(caixa).connect(comp).connect(vol).connect(ac.destination);
    return (saida = corpo1);
  }
  // Gravações reais de baixo elétrico tocado com os dedos (FluidR3 GM, CC BY 3.0), uma por nota do Desenho 1.
  // Se alguma não carregar, a nota sai pelo modelo físico acima.
  const AMOSTRAS = { 28: 'E1', 33: 'A1', 36: 'C2', 38: 'D2', 40: 'E2', 43: 'G2', 45: 'A2', 48: 'C3', 50: 'D3' };
  const gravadas = {};
  let carregando = null;
  const carregarAmostras = () => carregando || (carregando = Promise.all(Object.entries(AMOSTRAS).map(([m, nome]) =>
    fetch(`/assets/audio/baixo/${nome}.mp3`).then(r => r.arrayBuffer()).then(b => audio().decodeAudioData(b)).then(buf => { gravadas[m] = buf; }).catch(() => {}))));
  let saidaGravada = null;
  const cadeiaGravada = () => {
    if (saidaGravada) return saidaGravada;
    const ac = audio();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.3;
    const vol = ac.createGain(); vol.gain.value = 1.1;
    comp.connect(vol).connect(ac.destination);
    return (saidaGravada = comp);
  };
  function tocar(midi, forca = 0.8, dur = 1.6) {
    const ac = audio(), t0 = ac.currentTime, rec = gravadas[midi];
    const src = ac.createBufferSource(), g = ac.createGain();
    if (rec) { src.buffer = rec; src.connect(g).connect(cadeiaGravada()); }
    else { src.buffer = buffer(440 * Math.pow(2, (midi - 69) / 12)); src.connect(g).connect(cadeia()); }
    g.gain.setValueAtTime(0.9 * forca, t0); g.gain.setTargetAtTime(0, t0 + dur, 0.08);   // a mão abafa a nota
    src.start(t0); src.stop(t0 + dur + 0.6);
    return { src, g };
  }
  // Vozes das cordas do topo: uma nota por corda (a nova abafa a anterior) e no máximo 2 soando juntas
  const vozes = [];
  const abafar = v => { try { const ac = audio(); v.g.gain.cancelScheduledValues(ac.currentTime); v.g.gain.setTargetAtTime(0, ac.currentTime, 0.025); v.src.stop(ac.currentTime + 0.2); } catch (e) {} };
  function tocarCorda(chave, midi, forca) {
    for (let i = vozes.length - 1; i >= 0; i--) if (vozes[i].chave === chave) abafar(vozes.splice(i, 1)[0]);
    while (vozes.length >= 2) abafar(vozes.shift());
    const v = tocar(midi, forca, 2.6); v.chave = chave; vozes.push(v);
    v.src.onended = () => { const i = vozes.indexOf(v); if (i >= 0) vozes.splice(i, 1); };
  }
  const toast = txt => { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = txt; el.classList.add('ve'); clearTimeout(el.t); el.t = setTimeout(() => el.classList.remove('ve'), 2200); };
  const ligarSom = () => { if (somLigado) return; somLigado = true; try { localStorage.setItem('pg-som', '1'); } catch (e) {} pintarSom(); audio(); toast('🔊 Som ligado · desligue no botão do topo'); };
  const botaoSom = $('.som');
  const pintarSom = () => { if (botaoSom) { botaoSom.classList.toggle('ligado', somLigado); botaoSom.setAttribute('aria-pressed', somLigado); botaoSom.title = somLigado ? 'Desligar o som' : 'Ligar o som das cordas'; } };
  pintarSom();
  botaoSom && botaoSom.addEventListener('click', () => {
    somLigado = !somLigado; try { localStorage.setItem('pg-som', somLigado ? '1' : '0'); } catch (e) {}
    pintarSom(); if (somLigado) { audio(); tocar(33, 0.7); toast('🔊 Som ligado'); } else toast('🔇 Som desligado');
  });

  /* ---------- Brilho que segue o cursor ---------- */
  const brilho = $('.brilho-cursor');
  if (brilho && !toque && !reduz) {
    let bx = innerWidth / 2, by = innerHeight / 2, cx = bx, cy = by;
    addEventListener('pointermove', e => { bx = e.clientX; by = e.clientY; });
    (function seguir() { cx += (bx - cx) * 0.12; cy += (by - cy) * 0.12; brilho.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(seguir); })();
  } else if (brilho) brilho.remove();

  /* ---------- Navegação: fundo ao rolar, some ao descer, menu no celular ---------- */
  const nav = $('.nav'); let ultimo = 0;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('solida', y > 40);
    nav.classList.toggle('oculta', y > 500 && y > ultimo && !$('.nav ul.aberto'));
    ultimo = y;
    const barra = $('.barra-leitura');
    if (barra) barra.style.width = Math.min(100, y / (document.body.scrollHeight - innerHeight) * 100) + '%';
  }, { passive: true });
  const menu = $('.menu-btn');
  menu && menu.addEventListener('click', () => $('.nav ul').classList.toggle('aberto'));

  /* ---------- Revelar ao rolar e títulos letra a letra ---------- */
  $$('.titulo-letras').forEach(t => {
    let i = 0;
    const partir = n => { [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) { const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(p => { if (/^\s+$/.test(p)) frag.append(p); else if (p) { const w = document.createElement('span'); w.style.whiteSpace = 'nowrap';
          [...p].forEach(ch => { const s = document.createElement('span'); s.className = 'l'; s.textContent = ch; s.style.transitionDelay = (i++ * 0.025) + 's'; w.append(s); }); frag.append(w); } });
        c.replaceWith(frag); } else partir(c); }); };
    partir(t);
  });
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visivel'); obs.unobserve(e.target); } }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.revelar, .titulo-letras').forEach(el => obs.observe(el));

  /* ---------- Contadores ---------- */
  const obsN = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; obsN.unobserve(e.target);
    const el = e.target, alvo = Number(el.dataset.n), ini = performance.now(), dur = reduz ? 1 : 1600;
    const fmt = v => v.toLocaleString('pt-BR');
    (function passo(t) { const p = Math.min(1, (t - ini) / dur), q = 1 - Math.pow(1 - p, 3); el.textContent = (el.dataset.pre || '') + fmt(Math.round(alvo * q)) + (el.dataset.pos || ''); if (p < 1) requestAnimationFrame(passo); })(ini);
  }), { threshold: 0.5 });
  $$('[data-n]').forEach(el => obsN.observe(el));

  /* ---------- Cartões com inclinação 3D ---------- */
  if (!toque && !reduz) $$('[data-tilt]').forEach(el => {
    const alvo = el.querySelector('.cartao, .livro3d') || el;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const base = alvo.classList.contains('livro3d') ? -18 : 0;
      alvo.style.transform = `rotateY(${base + (x - .5) * 16}deg) rotateX(${(.5 - y) * 12}deg)`;
      alvo.style.setProperty('--mx', x * 100 + '%'); alvo.style.setProperty('--my', y * 100 + '%');
    });
    el.addEventListener('pointerleave', () => { alvo.style.transform = ''; });
  });

  /* ---------- As 4 cordas do hero: vibram com o mouse e soam ao clicar ---------- */
  const cordasEl = $('.cordas');
  if (cordasEl) {
    const svg = $('svg', cordasEl), NS = 'http://www.w3.org/2000/svg';
    const CORDAS = [{ nome: 'G', nota: 'Sol', midi: 43, esp: 1.6 }, { nome: 'D', nota: 'Ré', midi: 38, esp: 2.2 }, { nome: 'A', nota: 'Lá', midi: 33, esp: 2.9 }, { nome: 'E', nota: 'Mi', midi: 28, esp: 3.6 }];
    const rotulo = document.createElement('div'); rotulo.className = 'nome-corda'; cordasEl.append(rotulo);
    const aviso = document.createElement('div'); aviso.className = 'aviso-corda'; aviso.textContent = toque ? 'Toque uma corda para ouvir 👇' : 'Clique numa corda para ouvir 👇'; cordasEl.parentElement.append(aviso);
    cordasEl.addEventListener('pointerenter', () => carregarAmostras(), { once: true });
    let W = 0, H = 0;
    const est = CORDAS.map(c => ({ ...c, amp: 0, fase: 0, px: 0.5, el: document.createElementNS(NS, 'path'), rot: document.createElementNS(NS, 'text') }));
    est.forEach(s => { s.el.setAttribute('stroke-width', s.esp); svg.append(s.el); s.rot.setAttribute('class', 'nome'); s.rot.textContent = s.nome; svg.append(s.rot); });
    const medir = () => { const r = cordasEl.getBoundingClientRect(); W = r.width; H = r.height; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); est.forEach((s, i) => { s.y = H * (0.18 + i * 0.22); s.rot.setAttribute('x', 14); s.rot.setAttribute('y', s.y + 4); }); };
    medir(); addEventListener('resize', medir);
    const tangida = (s, x, forca) => { rotulo.textContent = `${s.nota} (${s.nome})`; rotulo.style.left = x + 'px'; rotulo.style.top = s.y + 'px'; rotulo.classList.add('ve'); clearTimeout(rotulo.t); rotulo.t = setTimeout(() => rotulo.classList.remove('ve'), 900); s.px = Math.min(.92, Math.max(.08, x / W)); s.amp = Math.min(26, 6 + forca * 22); s.fase = 0;  };
    let ultY = null, ultX = 0, ultT = 0;
    cordasEl.addEventListener('pointermove', e => {
      const r = cordasEl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
      if (ultY !== null) {
        const vel = Math.min(1, Math.hypot(x - ultX, y - ultY) / Math.max(1, t - ultT) / 2);
        est.forEach(s => { if ((ultY - s.y) * (y - s.y) <= 0 && s.amp < 4) tangida(s, x, vel); });
      }
      ultY = y; ultX = x; ultT = t;
    });
    cordasEl.addEventListener('pointerleave', () => { ultY = null; });
    cordasEl.addEventListener('click', e => {
      const r = cordasEl.getBoundingClientRect(), y = e.clientY - r.top;
      const s = est.reduce((a, b) => Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a); tangida(s, e.clientX - r.left, 0.9);
      aviso.classList.add('some'); audio(); carregarAmostras(); tocarCorda('corda-' + s.nome, s.midi, 0.85);
    });
    // desenho: a corda se curva a partir do ponto onde foi tocada e oscila até parar
    let t0 = performance.now();
    (function quadro(t) {
      const dt = Math.min(48, t - t0) / 1000; t0 = t;
      est.forEach((s, i) => {
        s.fase += dt * (26 + i * -3); s.amp *= Math.pow(0.12, dt);
        const a = s.amp * Math.cos(s.fase * 2 * Math.PI / 3), x0 = 40, x1 = W - 10, px = x0 + (x1 - x0) * s.px;
        s.el.setAttribute('d', s.amp < 0.15 ? `M${x0},${s.y} L${x1},${s.y}` : `M${x0},${s.y} Q${(x0 + px) / 2},${s.y + a * .9} ${px},${s.y + a} Q${(px + x1) / 2},${s.y + a * .9} ${x1},${s.y}`);
      });
      requestAnimationFrame(quadro);
    })(t0);
    // um "acorde" de boas-vindas, sem som, quando a página abre
    if (!reduz) setTimeout(() => est.forEach((s, i) => setTimeout(() => { s.px = .3 + i * .12; s.amp = 14; s.fase = 0; }, i * 110)), 900);
  }

  /* ---------- Braço interativo: pentatônica de Lá menor, casas 0 a 12 ---------- */
  const braco = $('.braco svg');
  if (braco) {
    const NS = 'http://www.w3.org/2000/svg', CASAS = 12, Wb = 1000, Hb = 230, x0 = 46, larg = (Wb - x0 - 14) / CASAS;
    const CORDAS = [{ n: 'G', midi: 43 }, { n: 'D', midi: 38 }, { n: 'A', midi: 33 }, { n: 'E', midi: 28 }];
    const PENTA = { 9: 'Lá', 0: 'Dó', 2: 'Ré', 4: 'Mi', 7: 'Sol' };   // classe de altura → nome
    const yC = i => 30 + i * ((Hb - 60) / 3), xC = f => f === 0 ? x0 - 22 : x0 + (f - .5) * larg;
    const el = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
    braco.setAttribute('viewBox', `0 0 ${Wb} ${Hb}`);
    for (let f = 0; f <= CASAS; f++) braco.append(el('line', { x1: x0 + f * larg, y1: 18, x2: x0 + f * larg, y2: Hb - 18, stroke: f === 0 ? '#EFE6D6' : '#8D7A62', 'stroke-width': f === 0 ? 7 : 2 }));
    [3, 5, 7, 9].forEach(f => braco.append(el('circle', { cx: xC(f), cy: Hb / 2, r: 7, fill: '#5C4A37' })));
    [Hb / 2 - 34, Hb / 2 + 34].forEach(cy => braco.append(el('circle', { cx: xC(12), cy, r: 7, fill: '#5C4A37' })));
    braco.append(el('rect', { class: 'regiao', x: x0 + 4 * larg + 3, y: 14, width: 4 * larg - 6, height: Hb - 40, rx: 12 }));
    const rr = el('text', { class: 'regiao-rot', x: x0 + 6 * larg, y: 11, 'text-anchor': 'middle' }); rr.textContent = 'DESENHO 1 · CASAS 5–8'; braco.append(rr);
    CORDAS.forEach((c, i) => braco.append(el('line', { x1: x0 - 30, y1: yC(i), x2: Wb - 10, y2: yC(i), stroke: '#CBB89C', 'stroke-width': 1.4 + i * .7 })));
    for (let f = 1; f <= CASAS; f++) { const t = el('text', { x: xC(f), y: Hb - 2, fill: '#8D7A62', 'font-size': 13, 'text-anchor': 'middle', 'font-family': 'Archivo' }); t.textContent = f; braco.append(t); }
    const notas = [];
    CORDAS.forEach((c, i) => { for (let f = 0; f <= CASAS; f++) {
      const pc = (c.midi + f) % 12; if (!(pc in PENTA)) continue;
      const g = el('g', { class: 'nota' + (pc === 9 ? ' tonica' : '') }), r = 15;
      g.append(el('circle', { cx: xC(f), cy: yC(i), r }));
      const t = el('text', { x: xC(f), y: yC(i) + 4.5 }); t.textContent = PENTA[pc]; g.append(t);
      const nota = { g, midi: c.midi + f, casa: f, corda: i }; notas.push(nota);
      const acender = () => { g.classList.add('acesa'); clearTimeout(nota.t); nota.t = setTimeout(() => g.classList.remove('acesa'), 700); };
      g.addEventListener('pointerenter', acender); g.addEventListener('click', acender);
      braco.append(g);
    } });
    // demonstração: o Desenho 1 (casas 5 a 8) sobe e desce, nota a nota, quando o braço aparece na tela
    const desenho = notas.filter(n => n.casa >= 5 && n.casa <= 8).sort((a, b) => a.midi - b.midi);
    const seq = [...desenho, ...desenho.slice(0, -1).reverse()];
    let rodando = false;
    const passo = document.querySelector('.passo-braco');
    const NOMES = { 9: 'Lá', 0: 'Dó', 2: 'Ré', 4: 'Mi', 7: 'Sol' };
    const demo = comSom => { if (rodando || reduz) return; rodando = true;
      seq.forEach((n, k) => setTimeout(() => {
        n.g.classList.add('acesa'); if (comSom) tocar(n.midi, .7, k === seq.length - 1 ? 2.2 : 0.34); setTimeout(() => n.g.classList.remove('acesa'), 380);
        if (passo) passo.textContent = `${k + 1} de ${seq.length} · ${NOMES[n.midi % 12]}`;
        if (k === seq.length - 1) { rodando = false; setTimeout(() => { if (passo && !rodando) passo.textContent = comSom ? 'Agora tente no seu baixo: casas 5 a 8, começando no Lá.' : ''; }, 600); }
      }, k * (comSom ? 300 : 220))); };
    // ao aparecer: só a luz, sem som (o som fica para quem pede)
    new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { demo(false); o.disconnect(); } }), { threshold: .6 }).observe(braco);
    $$('.tocar-desenho').forEach(bt => bt.addEventListener('click', () => { audio(); carregarAmostras().then(() => demo(true)); }));
  }

  /* ---------- Conteúdo por data: data-ate (some na data) e data-desde (aparece na data) ---------- */
  const agora = Date.now();
  $$('[data-ate]').forEach(el => { if (agora >= new Date(el.dataset.ate).getTime()) el.hidden = true; });
  $$('[data-desde]').forEach(el => { if (agora < new Date(el.dataset.desde).getTime()) el.hidden = true; });

  /* ---------- Contagem regressiva da página do livro ---------- */
  $$('[data-contagem]').forEach(box => {
    const alvo = new Date(box.dataset.contagem).getTime(), [d, h, m, s] = $$('b', box);
    const pad = v => String(v).padStart(2, '0');
    const passo = () => { let r = Math.max(0, alvo - Date.now()) / 1000;
      d.textContent = Math.floor(r / 86400); r %= 86400; h.textContent = pad(Math.floor(r / 3600)); r %= 3600; m.textContent = pad(Math.floor(r / 60)); s.textContent = pad(Math.floor(r % 60)); };
    passo(); setInterval(passo, 1000);
  });
})();
