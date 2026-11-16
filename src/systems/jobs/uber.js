import { BALANCE } from '../../config/balance.js';
import { PASSENGERS, PASSENGER_BY_U, passengerName } from '../../config/passengers.js';
import { STR, t } from '../../i18n/pt-BR.js';
import { fmtMoney } from '../../core/format.js';
import { esc, rand } from '../../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  🚗 UBER (Subaru Legacy azul)
//  Clique = 1 km; N km = 1 corrida. Resistência diminui os km por corrida,
//  Carisma aumenta a chance de 5 estrelas + gorjeta. Tarifa dinâmica:
//  chuva e horário de pico. Melhor R$ ativo, passivo mais fraco.
//  Sempre tem passageiro no carro (1 a 3): cada corrida concluída desembarca
//  o grupo e embarca outro, sorteado de config/passengers.js.
// ════════════════════════════════════════════════════════════════

const E = BALANCE.jobs.uber;
const U = E.upgrades;

function up(js, k) {
  return js.upgrades[k] ?? 0;
}

function raining(ctx) {
  return ctx.s.playTime < ctx.js.rainUntil;
}

function rushing(ctx) {
  return ctx.s.playTime < ctx.js.rushUntil;
}

export function tapsNeeded(ctx) {
  const js = ctx.js;
  let n = E.tapsBase * (1 - U.carro.value * up(js, 'carro'));
  n /= 1 + ctx.s.muscles.resistencia.level * E.resistPerLevel;
  if (raining(ctx) && up(js, 'palheta') === 0) n *= E.rain.taps;
  return Math.max(E.tapsMin, Math.round(n));
}

export function tipChance(ctx) {
  return Math.min(E.tipMax, E.tipBase + ctx.s.muscles.carisma.level * E.tipPerCarisma + up(ctx.js, 'suporte') * U.suporte.value);
}

/** Sorteia o próximo grupo (1–3 @usuários), sem repetir quem andou há pouco. */
export function pickRiders(js) {
  const r = Math.random();
  let n = E.riders.weights.length;
  let acc = 0;
  for (let i = 0; i < E.riders.weights.length; i++) {
    acc += E.riders.weights[i];
    if (r < acc) {
      n = i + 1;
      break;
    }
  }
  const recent = js.recent ?? [];
  const out = [];
  for (let guard = 0; out.length < n && guard < 400; guard++) {
    const p = PASSENGERS[Math.floor(Math.random() * PASSENGERS.length)];
    if (out.includes(p.u) || recent.includes(p.u)) continue;
    out.push(p.u);
  }
  js.recent = [...recent, ...out].slice(-E.riders.recentMemory);
  return out;
}

/** Garante que o carro nunca fique vazio (save novo, lista editada...). */
export function ensureRiders(js) {
  js.riders = (js.riders ?? []).filter((u) => PASSENGER_BY_U[u]);
  if (!js.riders.length) js.riders = pickRiders(js);
  return js.riders;
}

/** Passageiros atuais como objetos { u, name }. */
export function currentRiders(js) {
  return ensureRiders(js).map((u) => ({ u, name: passengerName(PASSENGER_BY_U[u]) }));
}

export default {
  task(ctx) {
    const js = ctx.js;
    ensureRiders(js);
    const need = tapsNeeded(ctx);
    // Cada km "acumula" o valor da corrida (menos km = mais R$ por km)
    js.pending = (js.pending ?? 0) + ctx.base * ctx.mult * (E.tapsBase / need);
    js.progress++;
    if (js.progress < need) return { pay: 0, kind: 'drive' };
    let pay = js.pending * (1 + U.agua.value * up(js, 'agua'));
    if (raining(ctx)) pay *= E.rain.pay + U.palheta.value * up(js, 'palheta');
    if (rushing(ctx)) pay *= E.rush.pay;
    const tip = Math.random() < tipChance(ctx);
    if (tip) pay *= 1 + E.tipMult;
    js.pending = 0;
    js.progress = 0;
    js.rides++;
    ctx.s.totals.rides++;
    const who = currentRiders(js);
    js.riders = pickRiders(js); // desembarcou: já embarca o próximo grupo
    const rating = tip || Math.random() < 0.65 ? 5 : 4;
    return { pay, kind: 'ride', tip, rating, who, xp: 2 };
  },

  update(ctx, dt, working) {
    const js = ctx.js;
    const now = ctx.s.playTime;
    if (!working) return;
    ensureRiders(js);
    if (!js.nextEventAt || js.nextEventAt < now - 600) js.nextEventAt = now + rand(...E.eventEverySec);
    if (now >= js.nextEventAt) {
      js.nextEventAt = now + rand(...E.eventEverySec);
      if (Math.random() < 0.55) {
        js.rainUntil = now + E.rain.sec;
        ctx.emit('jobEvent', { kind: 'chuva' });
      } else {
        js.rushUntil = now + E.rush.sec;
        ctx.emit('jobEvent', { kind: 'pico' });
      }
    }
  },

  passiveMult(ctx) {
    return 1 + U.primo.value * up(ctx.js, 'primo');
  },

  tags(ctx) {
    const out = [];
    const now = ctx.s.playTime;
    if (raining(ctx)) out.push({ cls: 'blue', text: `🌧 ${STR.jobs.uber.rainTag} • ${Math.ceil(ctx.js.rainUntil - now)}s` });
    if (rushing(ctx)) out.push({ cls: 'gold', text: `⏰ ${STR.jobs.uber.rushTag} • ${Math.ceil(ctx.js.rushUntil - now)}s` });
    return out;
  },

  view(ctx) {
    const js = ctx.js;
    const S = STR.jobs.uber;
    const riders = currentRiders(js);
    const need = tapsNeeded(ctx);
    const pct = Math.round((js.progress / need) * 100);
    const rain = raining(ctx);
    const value = (js.pending ?? 0) * (1 + U.agua.value * up(js, 'agua'));
    const key = `${js.progress}|${need}|${rain}|${rushing(ctx)}|${js.rides}|${riders.map((r) => r.u).join(',')}`;
    const dest = S.destinations[js.rides % S.destinations.length];
    const chips = riders.map((r) => `<span class="rider">🧍 ${esc(r.name)}</span>`).join('');
    const html = `
      <div class="jv uber ${rain ? 'rain' : ''}">
        <div class="jv-row"><span>📍 ${dest}</span><span class="muted">${t('jobs.uber.rides', { n: js.rides })}</span></div>
        <div class="riders">${chips}</div>
        <div class="road"><div class="road-fill" style="width:${pct}%"></div><span class="caricon" style="left:${pct}%">🚗</span><span class="house">🏁</span></div>
        <div class="jv-row small"><span>${t('jobs.uber.km', { n: js.progress, need })}</span><span class="gold">${fmtMoney(value)}</span></div>
        <div class="jv-row small muted"><span>⭐ ${t('jobs.uber.tip', { pct: Math.round(tipChance(ctx) * 100) })}</span><span>♥ ${t('jobs.uber.resist', { n: ctx.s.muscles.resistencia.level })}</span></div>
      </div>`;
    return { key, html };
  },
};
