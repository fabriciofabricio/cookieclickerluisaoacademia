import { BALANCE } from '../../config/balance.js';
import { STR, t } from '../../i18n/pt-BR.js';
import { fmtMoney } from '../../core/format.js';
import { rand, pick, esc } from '../../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  💻 VIBECODER DE SAAS B2B — ShapeCRM, "o CRM de academia que faz
//  tudo, inclusive o que ninguém pediu".
//  Clique = prompt pra IA. N prompts = FEATURE NO AR → clientes → MRR
//  (renda passiva paga a cada 60 s, inclusive treinando e offline).
//  Bugs comem o MRR; decisões ("deploy na sexta?") a cada 2–3 min.
// ════════════════════════════════════════════════════════════════

const V = BALANCE.jobs.vibecoder;
const U = V.upgrades;
const W = BALANCE.work;

function up(js, k) {
  return js.upgrades[k] ?? 0;
}

/**
 * Registro do "Claude Code" que roda no notebook (painel + tela 3D).
 * k: 'u' = prompt do Luisão, 'a' = resposta da IA, 'ok' = sucesso, 'err' = bug, 'sys' = comando.
 */
export function ccLog(js, k, t) {
  js.cc = [...(js.cc ?? []), { k, t }].slice(-8);
  js.ccN = (js.ccN ?? 0) + 1;
}

/** Máximo de clientes que o mercado comporta nesse cargo. */
export function clientCap(js) {
  return V.clientCapBase + V.clientCapPerCargo * js.cargo;
}

export function promptsNeeded(js) {
  return Math.min(V.featureMax, Math.round((V.featureBase + V.featurePer * js.features) * (1 + js.extraCost)));
}

function bugChance(js) {
  return Math.max(V.bugMin, V.bugChance - U.testes.value * up(js, 'testes'));
}

/** MRR em R$/s (já com bugs e principal). */
export function mrrPerSec(ctx) {
  const js = ctx.js;
  const units = js.clients + js.bigClients * V.bigClientMult;
  if (units <= 0) return 0;
  const ticket = W.basePay * ctx.jobs.market() * Math.pow(W.cargoGrowth, js.cargo - 1) * V.clientTicket * (1 + U.servidor.value * up(js, 'servidor')) * ctx.mods.jobMoney;
  const bugs = 1 - Math.min(V.bugPenaltyMax, js.bugs * V.bugPenalty);
  const own = ctx.jobs.isMain(ctx.id) ? 1 : W.secondaryPassive;
  return units * ticket * bugs * own;
}

function progressPrompt(ctx, auto = false) {
  const js = ctx.js;
  js.feature += (1 + U.notebook.value * up(js, 'notebook')) * ctx.mods.workFeature;
  if (js.bugs < V.bugMax && Math.random() < bugChance(js) * (auto ? 0.5 : 1)) {
    js.bugs++;
    const name = pick(STR.jobs.vibecoder.bugs);
    ccLog(js, 'err', `BUG: ${name}`);
    ctx.emit('bug', { name });
  }
  if (js.feature >= promptsNeeded(js)) ship(ctx);
}

function ship(ctx) {
  const js = ctx.js;
  const name = STR.jobs.vibecoder.features[js.features % STR.jobs.vibecoder.features.length];
  js.feature = 0;
  js.features++;
  js.extraCost = 0;
  ctx.s.totals.features++;
  js.clientFrac = (js.clientFrac ?? 0) + 1 + U.landing.value * up(js, 'landing');
  if (Math.random() < Math.min(0.5, ctx.s.muscles.carisma.level * V.carismaClientChance)) js.clientFrac += 1;
  const whole = Math.floor(js.clientFrac);
  js.clientFrac -= whole;
  const room = Math.max(0, clientCap(js) - js.clients);
  const gained = Math.min(room, whole);
  if (room === 0) js.clientFrac = 0; // mercado saturado: a sobra se perde
  const before = js.clients;
  js.clients += gained;
  const names = STR.jobs.vibecoder.clients;
  const client = names[Math.min(names.length - 1, before)];
  ccLog(js, 'sys', 'git push origin main');
  ccLog(js, 'ok', `${STR.jobs.vibecoder.feature} ${name}`);
  ctx.emit('feature', { name, gained, client, saturated: room === 0 });
}

export default {
  task(ctx) {
    const js = ctx.js;
    const S = STR.jobs.vibecoder;
    const prompt = pick(S.prompts);
    js.lines = [...(js.lines ?? []), prompt].slice(-3);
    ccLog(js, 'u', prompt);
    ccLog(js, 'a', pick(S.ccReplies));
    progressPrompt(ctx);
    return { pay: ctx.base * V.promptPay * ctx.mult, kind: 'prompt' };
  },

  passiveRate(ctx) {
    return mrrPerSec(ctx);
  },

  offline(ctx, sec) {
    return mrrPerSec(ctx) * sec; // offline não tem churn
  },

  update(ctx, dt, working) {
    const js = ctx.js;
    const now = ctx.s.playTime;
    // MRR acumula e cai como Pix a cada 60 s
    js.mrrAcc += mrrPerSec(ctx) * dt;
    if (!js.nextMrrAt) js.nextMrrAt = now + V.mrrEverySec;
    if (now >= js.nextMrrAt) {
      js.nextMrrAt = now + V.mrrEverySec;
      if (js.mrrAcc > 0) {
        const n = js.mrrAcc;
        js.mrrAcc = 0;
        ctx.jobs.addMoney(n, ctx.id);
        ctx.emit('mrr', { n });
      }
    }
    // Plano Pro da IA: a IA trabalha enquanto você malha
    const ia = up(js, 'iaPro');
    if (!working && ia > 0) {
      js.autoAcc += ia * U.iaPro.value * dt;
      while (js.autoAcc >= 1) {
        js.autoAcc -= 1;
        progressPrompt(ctx, true);
      }
    }
    // Churn suave: só com 3+ bugs, nunca o primeiro cliente
    if (js.bugs >= V.churnBugs) {
      if (!js.churnAt) js.churnAt = now + V.churnEverySec;
      if (now >= js.churnAt) {
        js.churnAt = now + V.churnEverySec;
        if (js.clients > 1) {
          js.clients--;
          ctx.emit('churn', {});
        }
      }
    } else js.churnAt = 0;
    // Customer Success conserta bugs sozinho
    const cs = up(js, 'cs');
    if (cs > 0 && js.bugs > 0) {
      if (!js.csAt) js.csAt = now + (100 - U.cs.value * cs);
      if (now >= js.csAt) {
        js.csAt = 0;
        js.bugs--;
        js.bugHits = 0;
        ccLog(js, 'ok', STR.jobs.vibecoder.bugAuto);
        ctx.emit('bugFixed', { auto: true });
      }
    } else js.csAt = 0;
    // Decisões só aparecem trabalhando
    if (working) {
      if (!js.nextDecisionAt || js.nextDecisionAt < now - 900) js.nextDecisionAt = now + rand(...V.decisionEverySec);
      if (!js.decision && now >= js.nextDecisionAt) {
        js.decision = js.features >= 1 && js.bigClients < js.cargo && Math.random() < 0.5 ? 'botao' : 'sexta';
        ctx.emit('decision', { kind: js.decision });
      }
    }
  },

  action(ctx, act, arg) {
    const js = ctx.js;
    const now = ctx.s.playTime;
    if (act === 'fixBug' && js.bugs > 0) {
      js.bugHits++;
      const S = STR.jobs.vibecoder;
      if (js.bugHits >= V.bugClicks) {
        js.bugHits = 0;
        js.bugs--;
        ctx.s.totals.bugsFixed++;
        ccLog(js, 'ok', S.bugFixed);
        ctx.emit('bugFixed', {});
      } else {
        // Cada clique manda um pedaço do print pra IA (retorno na hora: 1/3, 2/3...)
        ccLog(js, 'u', `${S.ccFixPrompt} (${js.bugHits}/${V.bugClicks})`);
        ctx.emit('bugHit', { hits: js.bugHits, need: V.bugClicks });
      }
      return { xp: 1, fixed: js.bugHits === 0 };
    }
    if (act === 'decide' && js.decision) {
      const kind = js.decision;
      js.decision = null;
      js.nextDecisionAt = now + rand(...V.decisionEverySec);
      if (arg !== 'yes') return { xp: 0 };
      if (kind === 'sexta') {
        ship(ctx);
        if (Math.random() < V.sextaIncident) {
          js.bugs = Math.min(V.bugMax, js.bugs + V.sextaBugs);
          ctx.emit('incident', {});
        } else ctx.emit('sextaOk', {});
      } else if (kind === 'botao') {
        js.bigClients++;
        js.extraCost += V.botaoExtraCost;
        ctx.emit('bigClient', {});
      }
      return { xp: 5 };
    }
    return null;
  },

  tags(ctx) {
    const js = ctx.js;
    const out = [];
    if (js.bugs > 0) out.push({ cls: 'red', text: `🐞 ${js.bugs}` });
    if (js.decision) out.push({ cls: 'gold', text: `❓ ${STR.jobs.vibecoder.decisionTag}` });
    return out;
  },

  view(ctx) {
    const js = ctx.js;
    const S = STR.jobs.vibecoder;
    const need = promptsNeeded(js);
    const pct = Math.round((js.feature / need) * 100);
    const mrrMin = mrrPerSec(ctx) * 60;
    const nextName = S.features[js.features % S.features.length];
    const left = V.bugClicks - js.bugHits;
    const bugs = Array.from({ length: js.bugs }, (_, i) => `<button class="bug" data-act="fixBug" title="${S.fixBug}" style="--i:${i}">🐞${i === 0 && js.bugHits > 0 ? `<b class="hits">${left}</b>` : ''}</button>`).join('');
    let decision = '';
    if (js.decision) {
      const d = S.decisions[js.decision];
      decision = `<div class="decision"><b>${d.title}</b><span>${d.text}</span>
        <div class="row"><button class="buy" data-act="decide" data-arg="yes">${d.yes}</button><button class="buy ghost" data-act="decide" data-arg="no">${d.no}</button></div></div>`;
    }
    const term = ccTerminalHtml(js, S);
    const key = `${Math.floor(js.feature)}|${need}|${js.bugs}|${js.bugHits}|${js.decision}|${js.clients}|${js.bigClients}|${js.ccN ?? 0}|${Math.round(mrrMin)}`;
    const html = `
      <div class="jv vibe">
        ${term}
        <div class="jv-row small"><span>🚀 ${nextName}</span><span>${Math.floor(js.feature)}/${need}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="jv-row small"><span>🏢 ${t('jobs.vibecoder.clientsN', { n: js.clients + js.bigClients, cap: clientCap(js) })}</span><span class="gold">MRR ${fmtMoney(mrrMin)}/min</span></div>
        ${js.bugs ? `<div class="bugs"><small>${t('jobs.vibecoder.bugsLabel', { n: js.bugs, pct: Math.round(Math.min(V.bugPenaltyMax, js.bugs * V.bugPenalty) * 100) })}</small>${bugs}</div>` : ''}
        ${decision}
      </div>`;
    return { key, html };
  },
};

/** Mini terminal do Claude Code no painel: últimas mensagens, o prompt mais novo sendo digitado e o spinner. */
function ccTerminalHtml(js, S) {
  const log = (js.cc ?? []).slice(-5);
  const icon = { u: '&gt;', a: '●', ok: '✓', err: '✗', sys: '$' };
  let lastU = -1;
  log.forEach((e, i) => e.k === 'u' && (lastU = i));
  const rows = log.map((e, i) => {
    const txt = esc(e.t);
    const typed = i === lastU && i >= log.length - 2;
    return `<div class="cc-l ${e.k}${typed ? ' new' : ''}"><i>${icon[e.k] ?? ''}</i><span style="--n:${Math.min(60, e.t.length)}">${txt}</span></div>`;
  }).join('');
  const verb = S.ccVerbs[(js.ccN ?? 0) % S.ccVerbs.length];
  const tokens = (((js.ccN ?? 0) * 137) % 9000) / 1000 + 0.4;
  return `<div class="term cc">
    <div class="cc-head"><b>✻</b> Claude Code <span>${S.ccDir}</span></div>
    ${rows || `<div class="cc-l a"><i>●</i><span>${S.ccWelcome}</span></div>`}
    <div class="cc-spin"><b class="spin"></b> ${verb}… <small>(↑ ${tokens.toFixed(1)}k tokens · esc pra interromper)</small></div>
    <div class="cc-input">&gt; <span class="cursor">▌</span></div>
  </div>`;
}
