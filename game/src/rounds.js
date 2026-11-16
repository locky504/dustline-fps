// Rounds and money: buy phase, live round, round end, match end. The economy is the
// player's alone: kills pay $300, a round win pays $3,250, a loss $1,900, a plant
// $300. First team to 5 rounds takes the match, at most 9 rounds.
import { WEAPONS, GRENADES, ARMOR, refillWeapon, createWeaponState } from './weapons.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const END_SECONDS = 4;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_PAY = 300;
const WIN_PAY = 3250;
const LOSS_PAY = 1900;
const PLANT_PAY = 300;

export function createRounds(G) {
  const S = G.state;
  let phaseTimer = 0;
  let bannerAt = 0;

  function teamAlive(team) {
    let n = 0;
    for (const f of G.combatants) if (f.alive && f.team === team) n += 1;
    return n;
  }

  function setPhase(phase, seconds) {
    S.phase = phase;
    phaseTimer = seconds;
    G.hud.setPhase(phase);
  }

  function spawnFighter(fighter, spawn) {
    fighter.pos.copy(spawn);
    fighter.health = 100;
    fighter.alive = true;
    fighter.armor = fighter.isPlayer ? S.loadout.armor : fighter.armor;
  }

  function startMatch() {
    S.score = { atk: 0, def: 0 };
    S.round = 1;
    S.money = 800;
    S.loadout = { primary: null, armor: false, grenades: { frag: 0, smoke: 0 } };
    S.playerFighter.weapon = createWeaponState(WEAPONS.p9);
    S.playerFighter.weaponDef = WEAPONS.p9;
    S.playerFighter.grenades = { frag: 0, smoke: 0 };
    G.bots.equipForRound(1);
    startRound();
  }

  function startRound() {
    // Spawns and fresh health; weapons and ammo carry over, refilled.
    const player = S.playerFighter;
    spawnFighter(player, G.world.spawns.atk[0]);
    player.yaw = Math.PI;
    G.player.state.position.copy(G.world.spawns.atk[0]);
    G.player.state.velocity.set(0, 0, 0);
    G.player.state.yaw = Math.PI;
    G.player.state.pitch = 0;
    refillWeapon(player.weapon);
    if (S.loadout.primary) {
      player.primaryWeapon = player.primaryWeapon || createWeaponState(WEAPONS[S.loadout.primary]);
      refillWeapon(player.primaryWeapon);
    }
    G.bots.resetRound();
    G.bots.equipForRound(S.round);
    // Pick the attack site and the bomb carrier for this round.
    S.attackSite = G.world.sites[S.round % 2];
    const carrier = G.bots.bots.find((b) => b.team === 'atk' && b.alive);
    S.bomb = { state: 'carried', holder: carrier || null, site: null, pos: carrier ? carrier.pos.clone() : G.world.spawns.atk[1].clone(), plantAt: 0, defuseAt: 0, plantedAt: 0, planter: null };
    if (carrier) carrier.carrier = true;
    S.roundTime = ROUND_SECONDS;
    S.kills = { atk: 0, def: 0 };
    G.hud.clearFeed();
    G.hud.setScore(S.score.atk, S.score.def);
    G.hud.setRound(S.round);
    G.hud.setMoney(S.money);
    G.hud.setBomb('carried');
    setPhase('buy', BUY_SECONDS);
    G.hud.showBuy(true);
    G.hud.showBanner(`ROUND ${S.round} — ${S.attackSite.name === 'A' ? 'SITE A' : 'SITE B'}`, 'Dustjacks push. Wardens hold.', 3);
  }

  function endRound(winner, reason) {
    if (S.phase !== 'live') return;
    S.score[winner] += 1;
    const playerWon = winner === 'atk';
    S.money += playerWon ? WIN_PAY : LOSS_PAY;
    G.hud.setScore(S.score.atk, S.score.def);
    G.hud.setMoney(S.money);
    G.hud.showBuy(false);
    setPhase('roundEnd', END_SECONDS);
    bannerAt = G.time;
    const titles = {
      elim: winner === 'atk' ? 'ROUND WON — WARDENS ELIMINATED' : 'ROUND LOST — DUSTJACKS ELIMINATED',
      bomb: 'ROUND WON — CHARGE DETONATED',
      defuse: 'ROUND LOST — CHARGE DEFUSED',
      time: 'ROUND LOST — TIME EXPIRED',
    };
    G.hud.showBanner(titles[reason] || 'ROUND OVER', reason === 'bomb' ? 'Site ' + (S.bomb.site ? S.bomb.site.name : '') + ' is gone.' : '', END_SECONDS);
    if (playerWon) G.audio.roundWin(); else G.audio.roundLose();
    G.hud.setBomb('none');
    if (S.score.atk >= WIN_ROUNDS || S.score.def >= WIN_ROUNDS || S.round >= MAX_ROUNDS) {
      setPhase('matchEnd', 0);
      const matchWon = S.score.atk > S.score.def;
      G.hud.showMatchEnd(matchWon, S.score.atk, S.score.def);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  function checkElimination() {
    if (S.phase !== 'live') return;
    const atk = teamAlive('atk');
    const def = teamAlive('def');
    if (atk === 0 && def === 0) endRound('def', 'elim');
    else if (atk === 0) endRound('def', 'elim');
    else if (def === 0) {
      if (S.bomb.state === 'planted') {
        // Defenders dead but the charge is live: attackers win only when it blows.
      } else endRound('atk', 'elim');
    }
  }

  function tick(dt) {
    if (S.phase === 'buy') {
      phaseTimer -= dt;
      G.hud.setTimer(Math.max(0, phaseTimer), true);
      if (phaseTimer <= 0) {
        G.hud.showBuy(false);
        setPhase('live', ROUND_SECONDS);
        S.roundTime = ROUND_SECONDS;
        G.hud.showBanner('GO', 'Plant the charge or clear the site.', 1.6);
        // The timer can run out while the player is still shopping unlocked:
        // show the resume screen instead of leaving them unlocked with no cue.
        if (!document.pointerLockElement) G.hud.showOverlay('paused');
      }
    } else if (S.phase === 'live') {
      S.roundTime -= dt;
      G.hud.setTimer(Math.max(0, S.roundTime), false);
      if (S.bomb.state === 'planted') {
        const left = G.combat.BOMB_TIMER_SECONDS - (G.time - S.bomb.plantedAt);
        G.hud.setBomb('planted', Math.max(0, left));
      }
      if (S.roundTime <= 0 && S.bomb.state !== 'planted') {
        endRound('def', 'time');
      } else {
        checkElimination();
      }
    } else if (S.phase === 'roundEnd') {
      phaseTimer -= dt;
      if (phaseTimer <= 0 && S.phase === 'roundEnd') {
        S.round += 1;
        startRound();
      }
    }
    // Bomb pickup by the player.
    if (S.bomb.state === 'dropped' && S.playerFighter.alive) {
      if (S.playerFighter.pos.distanceTo(S.bomb.pos) < 1.4) {
        S.bomb.state = 'carried';
        S.bomb.holder = S.playerFighter;
        G.hud.setBomb('carried');
        G.hud.setPrompt('');
      }
    }
    // Player plant / defuse prompts and progress.
    const player = S.playerFighter;
    if (S.phase === 'live' && player.alive) {
      if (S.bomb.state === 'carried' && S.bomb.holder === player) {
        const site = G.world.sites.find((s) => Math.hypot(player.pos.x - s.center.x, player.pos.z - s.center.z) < s.radius);
        if (site) {
          G.hud.setPrompt('HOLD E — PLANT THE CHARGE');
          if (G.input.state.keys.has('KeyE')) {
            S.bomb.plantAt += dt;
            G.hud.setChannel('PLANTING', S.bomb.plantAt / G.combat.BOMB_PLANT_SECONDS);
            if (S.bomb.plantAt >= G.combat.BOMB_PLANT_SECONDS) {
              S.bomb.plantAt = 0;
              G.events.onBombPlanted(player, site);
            }
          } else {
            S.bomb.plantAt = Math.max(0, S.bomb.plantAt - dt * 2);
            G.hud.setChannel('', 0);
          }
        } else {
          G.hud.setPrompt('');
          G.hud.setChannel('', 0);
        }
      } else if (S.bomb.state === 'planted') {
        if (player.pos.distanceTo(S.bomb.pos) < 1.8) {
          G.hud.setPrompt('HOLD E — DEFUSE THE CHARGE');
          if (G.input.state.keys.has('KeyE')) {
            S.bomb.defuseAt += dt;
            G.hud.setChannel('DEFUSING', S.bomb.defuseAt / G.combat.BOMB_DEFUSE_SECONDS);
            if (S.bomb.defuseAt >= G.combat.BOMB_DEFUSE_SECONDS) {
              S.bomb.defuseAt = 0;
              G.events.onBombDefused(player);
            }
          } else {
            S.bomb.defuseAt = Math.max(0, S.bomb.defuseAt - dt * 2);
            G.hud.setChannel('', 0);
          }
        } else {
          G.hud.setPrompt('');
          G.hud.setChannel('', 0);
        }
      } else {
        G.hud.setPrompt('');
        G.hud.setChannel('', 0);
      }
    }
    void bannerAt;
  }

  function buy(id) {
    if (S.phase !== 'buy') return false;
    if (id === 'armor') {
      if (S.loadout.armor || S.money < ARMOR.price) { G.audio.denied(); return false; }
      S.money -= ARMOR.price;
      S.loadout.armor = true;
      S.playerFighter.armor = true;
    } else if (id === 'frag' || id === 'smoke') {
      const def = GRENADES[id];
      if (S.loadout.grenades[id] >= 2 || S.money < def.price) { G.audio.denied(); return false; }
      S.money -= def.price;
      S.loadout.grenades[id] += 1;
      S.playerFighter.grenades[id] += 1;
    } else {
      const def = WEAPONS[id];
      if (!def || S.money < def.price) { G.audio.denied(); return false; }
      S.money -= def.price;
      S.loadout.primary = id;
      S.playerFighter.primaryWeapon = createWeaponState(def);
      S.playerFighter.weapon = S.playerFighter.primaryWeapon;
      S.playerFighter.weaponDef = def;
      G.viewModel.setWeapon(def);
    }
    S.money = Math.max(0, S.money);
    G.hud.setMoney(S.money);
    G.hud.setLoadout(S.loadout, S.playerFighter.weaponDef.name);
    G.audio.buy();
    return true;
  }

  return {
    startMatch,
    startRound,
    endRound,
    tick,
    buy,
    teamAlive,
  };
}
