// The DOM HUD: health, ammo, money, timer, score, killfeed, buy menu and every
// overlay. It never touches the simulation; main.js and rounds.js push numbers in
// and read the button callbacks out. All text updates are cached, so the DOM is
// only touched when a value actually changes.
import { WEAPONS, GRENADES, ARMOR, BUY_ORDER } from './weapons.js';

const COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'A dusk freight yard, two teams, one charge. Dustjacks plant it, Wardens stop them. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoWeapon = $('ammo-weapon');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorFill = $('armor-fill');
  const moneyValue = $('money-value');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const roundNum = $('round-num');
  const timerValue = $('timer-value');
  const timerLabel = $('timer-label');
  const killfeed = $('killfeed');
  const pipsAtk = $('pips-atk');
  const pipsDef = $('pips-def');
  const bombStatus = $('bomb-status');
  const prompt = $('prompt');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  const crosshair = $('crosshair');
  const grenadeFrag = $('grenade-frag');
  const grenadeSmoke = $('grenade-smoke');
  const scopeOverlay = $('scope-overlay');
  const spectate = $('spectate-note');

  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastScoreA = -1;
  let lastScoreD = -1;
  let lastRound = -1;
  let lastTimer = -1;
  let lastBomb = '';
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyHandler = null;

  function buildBuyMenu() {
    buyItems.innerHTML = '';
    const cards = [];
    for (const id of BUY_ORDER) {
      const w = WEAPONS[id];
      cards.push({ id, name: w.name, price: w.price, desc: `${w.damage} dmg · ${w.mag} rounds` });
    }
    cards.push({ id: 'armor', name: ARMOR.name, price: ARMOR.price, desc: 'Halves incoming damage' });
    cards.push({ id: 'frag', name: GRENADES.frag.name, price: GRENADES.frag.price, desc: 'Key 4 to throw' });
    cards.push({ id: 'smoke', name: GRENADES.smoke.name, price: GRENADES.smoke.price, desc: 'Key 5 to throw' });
    for (const card of cards) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-card';
      button.dataset.id = card.id;
      button.innerHTML = `<b></b><span class="buy-price"></span><span class="buy-desc"></span>`;
      button.querySelector('b').textContent = card.name;
      button.querySelector('.buy-price').textContent = card.price === 0 ? 'OWNED' : `$${card.price}`;
      button.querySelector('.buy-desc').textContent = card.desc;
      button.addEventListener('click', () => { if (buyHandler) buyHandler(card.id); });
      buyItems.appendChild(button);
    }
  }
  buildBuyMenu();

  return {
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      if (h === lastHealth && armor === lastArmor) return;
      lastHealth = h;
      lastArmor = armor;
      healthNum.textContent = String(h);
      healthFill.style.width = `${h}%`;
      armorFill.style.width = armor ? '100%' : '0%';
      healthFill.classList.toggle('low', h <= 30);
    },
    setAmmo(mag, reserve, weaponName) {
      if (mag === lastMag && reserve === lastReserve && weaponName === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = weaponName;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoWeapon.textContent = weaponName;
      ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setScore(a, d) {
      if (a === lastScoreA && d === lastScoreD) return;
      lastScoreA = a;
      lastScoreD = d;
      scoreAtk.textContent = String(a);
      scoreDef.textContent = String(d);
    },
    setRound(n) {
      if (n === lastRound) return;
      lastRound = n;
      roundNum.textContent = `ROUND ${n}`;
    },
    setTimer(seconds, isBuy) {
      const s = Math.ceil(seconds);
      if (s === lastTimer) return;
      lastTimer = s;
      timerValue.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timerLabel.textContent = isBuy ? 'BUY PHASE' : 'ROUND';
      timerValue.classList.toggle('urgent', !isBuy && s <= 10);
    },
    setPhase(phase) {
      document.body.dataset.phase = phase;
    },
    setBomb(state, secondsLeft = 0) {
      const key = `${state}:${Math.ceil(secondsLeft)}`;
      if (key === lastBomb) return;
      lastBomb = key;
      if (state === 'planted') bombStatus.textContent = `CHARGE LIVE ${Math.ceil(secondsLeft)}s`;
      else if (state === 'carried') bombStatus.textContent = 'CHARGE CARRIED';
      else if (state === 'dropped') bombStatus.textContent = 'CHARGE DROPPED';
      else bombStatus.textContent = '';
      bombStatus.classList.toggle('live', state === 'planted');
    },
    setPrompt(text) {
      if (prompt.textContent === text) return;
      prompt.textContent = text;
    },
    setChannel(label, frac) {
      if (!label) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(frac * 100)}%`;
    },
    setLoadout(loadout, weaponName) {
      for (const button of buyItems.children) {
        const id = button.dataset.id;
        const owned = id === 'p9' || (id === loadout.primary) || (id === 'armor' && loadout.armor);
        button.classList.toggle('owned', owned);
        button.classList.toggle('cant', !owned && (id === 'frag' ? loadout.grenades.frag >= 2 : id === 'smoke' ? loadout.grenades.smoke >= 2 : false));
      }
      void weaponName;
    },
    setGrenades(frag, smoke) {
      grenadeFrag.textContent = `4 · FRAG ×${frag}`;
      grenadeSmoke.textContent = `5 · SMOKE ×${smoke}`;
    },
    setAlive(atk, def) {
      let a = '';
      let d = '';
      for (let i = 0; i < 5; i += 1) {
        a += `<i class="${i < atk ? 'on' : ''}"></i>`;
        d += `<i class="${i < def ? 'on' : ''}"></i>`;
      }
      if (pipsAtk.innerHTML !== a) pipsAtk.innerHTML = a;
      if (pipsDef.innerHTML !== d) pipsDef.innerHTML = d;
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setScoped(on) {
      scopeOverlay.hidden = !on;
    },
    setSpectate(on, name) {
      spectate.hidden = !on;
      if (on) spectate.textContent = `SPECTATING ${name} — click to cycle`;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageFlash.classList.remove('go');
      void damageFlash.offsetWidth;
      damageFlash.classList.add('go');
    },
    feed(killer, victim, headshot, killerTeam) {
      const div = document.createElement('div');
      div.className = `feed-line ${killerTeam}`;
      div.textContent = headshot ? `${killer} ⌖ ${victim}` : `${killer} — ${victim}`;
      killfeed.prepend(div);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => { if (div.parentElement) div.remove(); }, 5000);
    },
    clearFeed() {
      killfeed.innerHTML = '';
    },
    showBanner(titleText, subText, seconds) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, seconds * 1000);
    },
    showBuy(open) {
      buyMenu.hidden = !open;
      // Shopping needs a free cursor: unlock when the menu opens. The lock
      // change handler knows not to show the pause screen while shopping.
      if (open && document.pointerLockElement) document.exitPointerLock();
    },
    showOverlay(mode, data) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = data && data.title ? data.title : text.title;
      copy.textContent = data && data.copy ? data.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showMatchEnd(won, a, d) {
      title.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      copy.textContent = `Dustjacks ${a} — ${d} Wardens. The yard remembers who held it.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
  };
}
