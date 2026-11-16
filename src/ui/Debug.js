import { STR } from '../i18n/pt-BR.js';
import { fmtTime, fmtMoney } from '../core/format.js';
import { el } from '../core/utils.js';
import { BALANCE } from '../config/balance.js';
import { LEVELS } from '../config/story.js';

// ════════════════════════════════════════════════════════════════
//  Menu de TESTE (F9, ou Opções → tocar 5x na versão → "Modo de teste").
//  Pular de fase, ir pra qualquer nível/academia, forçar encontro e prova,
//  dinheiro, músculos, liberar sistemas, eventos — e as medições de tempo.
// ════════════════════════════════════════════════════════════════
export class DebugMenu {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'glass hidden');
    this.node.id = 'debug';
    const D = STR.debug;
    const b = (a, label, cls = '') => `<button data-a="${a}" class="${cls}">${label}</button>`;
    const levels = LEVELS.filter((l) => l.gym === 'garagem' || l.gym === 'iron')
      .map((l) => b(`lv${l.level}`, `${l.level} · ${STR.girlfriends[l.girl].name}`, l.gym === 'iron' ? 'iron' : ''))
      .join('');
    this.node.innerHTML = `
      <div class="dbg-head"><h4>${D.title}</h4><button data-a="close" class="x" title="${D.close}">✕</button></div>
      <div class="dbg-body">
        <div class="h5">${D.secStory}</div>
        <div class="row">${b('skip', D.skipLevel, 'hot')}${b('req', D.meetReq)}${b('date', D.dateNow)}${b('exam', D.examNow)}${b('gymDone', D.gymDone)}</div>
        <div class="h5">${D.secLevels}</div>
        <div class="row">${levels}</div>
        <div class="h5">${D.secGyms}</div>
        <div class="row">${b('toGaragem', `🏚 ${STR.gyms.garagem.name}`)}${b('toIron', `🏛 ${STR.gyms.iron.name}`, 'iron')}</div>
        <div class="h5">${D.secResources}</div>
        <div class="row">${b('g1k', `${D.addGanhos} 1K`)}${b('g1m', `${D.addGanhos} 1M`)}${b('g1b', `${D.addGanhos} 1B`)}${b('r1k', `${D.addMoney} 1K`)}${b('r1m', `${D.addMoney} 1M`)}${b('m5', D.addMuscles)}${b('fat', D.resetFatigue)}</div>
        <div class="h5">${D.secSystems}</div>
        <div class="row">${b('unlock', D.unlockAll)}${b('cargo', D.cargoUp)}${b('bond', D.bond)}${b('tier', D.tier)}${b('gold', D.golden)}${b('energy', D.energy)}${b('fps', D.fps)}</div>
        <pre data-k="info"></pre>
      </div>`;
    root.appendChild(this.node);
    this.info = this.node.querySelector('[data-k="info"]');
    // Cliques no painel não podem virar "rep" nem andar no mundo
    this.node.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.node.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'close') return this.toggle(false);
      game.debugAction(a);
    });
  }

  toggle(force) {
    const open = force ?? !this.open;
    this.node.classList.toggle('hidden', !open);
  }

  get open() {
    return !this.node.classList.contains('hidden');
  }

  update() {
    if (!this.open) return;
    const g = this.game;
    const s = g.state;
    const pct = (a, b) => (a + b > 0 ? Math.round((b / (a + b)) * 100) : 0);
    const lines = [`FPS: ${g.renderer.fps}  •  qualidade: ${g.renderer.qualityName}  •  draw calls: ${g.renderer.renderer.info.render.calls}`];
    lines.push(`Academia: ${s.story.gym} • nível ${s.story.level} (${s.story.phase}) • no nível há ${fmtTime(s.playTime - s.story.levelStartedAt)} (alvo ${BALANCE.levelTargetMin[s.story.level - 1] ?? '-'} min)`);
    lines.push(`R$ ${fmtMoney(s.dinheiro)} • ref ${fmtMoney(g.jobs.refRate() * 60)}/min • passivo ${fmtMoney(g.jobs.totalPassive() * 60)}/min • Método investido ${fmtMoney(s.metodo.spent)}`);
    lines.push(`Treino ${fmtTime(s.timeLog.train)} × Trabalho ${fmtTime(s.timeLog.work)} (${pct(s.timeLog.train, s.timeLog.work)}% trabalhando) • camada: ${s.debugTier ?? 'auto'}`);
    lines.push(`${STR.debug.timePerLevel}:`);
    for (const [lv, sec] of Object.entries(s.story.levelTimes)) {
      const tl = s.timeLog.perLevel[lv];
      lines.push(`  ${lv}: ${fmtTime(sec)} (alvo ${BALANCE.levelTargetMin[lv - 1] ?? '-'} min)${tl ? ` • ${pct(tl.train, tl.work)}% trabalhando` : ''}`);
    }
    this.info.textContent = lines.join('\n');
  }
}
