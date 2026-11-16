import './ui/styles.css';
import './ui/systems.css';
import { Game } from './Game.js';
import { STR } from './i18n/pt-BR.js';
import { isTouch, el } from './core/utils.js';

// Tela de título + carregamento. O áudio só libera depois do clique.

const $ = (id) => document.getElementById(id);
$('title-sub').textContent = STR.game.subtitle.toUpperCase();
$('title-tag').textContent = STR.game.tagline;
$('title-hint').textContent = isTouch() ? STR.game.hintMobile : STR.game.hint;

let step = 0;
const msgTimer = setInterval(() => {
  $('title-msg').textContent = STR.game.loadingSteps[step++ % STR.game.loadingSteps.length];
}, 650);
$('title-msg').textContent = STR.game.loading;

const game = new Game($('game'), $('ui'));
window.__game = game; // facilita debug pelo console

function showError(err) {
  console.error(err);
  clearInterval(msgTimer);
  $('title-msg').textContent = STR.hud.loadError;
  $('title-msg').style.color = '#ff8a8a';
}

game
  .init((p) => ($('title-bar').style.width = `${Math.round(p * 100)}%`))
  .then(() => {
    clearInterval(msgTimer);
    $('title-load').classList.add('hidden');
    const btns = $('title-btns');
    btns.classList.remove('hidden');
    const play = el('button', '', game.isNew ? STR.game.play : STR.game.continue);
    btns.appendChild(play);
    const start = async () => {
      play.disabled = true;
      $('title').classList.add('fade');
      setTimeout(() => $('title').remove(), 900);
      await game.begin();
    };
    play.onclick = start;
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.code === 'Enter' || e.code === 'Space') && !play.disabled && document.getElementById('title')) start();
      },
      { once: true },
    );
  })
  .catch(showError);
