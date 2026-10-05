const ROWS = 10;
const COLS = 12;
const HOLD_TURNS_TO_WIN = 3;

const unitTypes = {
  infantry: { name: 'Infantry', move: 3, range: 1, attack: 4, maxHp: 10 },
  tank: { name: 'Tank', move: 4, range: 1, attack: 6, maxHp: 12 },
  artillery: { name: 'Artillery', move: 2, range: 3, minRange: 2, attack: 5, maxHp: 8 },
  recon: { name: 'Recon', move: 5, range: 1, attack: 3, maxHp: 8 },
};

const terrain = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => {
    if ((r === 4 || r === 5) && c >= 2 && c <= 9) return 'road';
    if ((r === 2 && c >= 3 && c <= 5) || (r === 7 && c >= 7 && c <= 9)) return 'forest';
    if ((r === 4 && c === 5) || (r === 5 && c === 6)) return 'city';
    return 'plain';
  })
);

const objective = { r: 4, c: 5 };

let units = [
  makeUnit('b1', 'blue', 'infantry', 4, 1),
  makeUnit('b2', 'blue', 'tank', 6, 1),
  makeUnit('b3', 'blue', 'artillery', 8, 2),
  makeUnit('b4', 'blue', 'recon', 2, 1),
  makeUnit('r1', 'red', 'infantry', 4, 10),
  makeUnit('r2', 'red', 'tank', 6, 10),
  makeUnit('r3', 'red', 'artillery', 1, 9),
  makeUnit('r4', 'red', 'recon', 8, 10),
];

let turn = 1;
let activeSide = 'blue';
let selectedId = null;
let mode = null;
let objectiveHold = 0;
let gameOver = false;

const boardEl = document.getElementById('board');
const detailsEl = document.getElementById('unitDetails');
const logEl = document.getElementById('log');
const turnLabel = document.getElementById('turnLabel');
const objectiveLabel = document.getElementById('objectiveLabel');
const moveBtn = document.getElementById('moveBtn');
const attackBtn = document.getElementById('attackBtn');
const waitBtn = document.getElementById('waitBtn');
const endTurnBtn = document.getElementById('endTurnBtn');

boardEl.style.setProperty('--cols', COLS);

function makeUnit(id, side, type, r, c) {
  return { id, side, type, r, c, hp: unitTypes[type].maxHp, acted: false };
}

function getUnitAt(r, c) {
  return units.find(u => u.hp > 0 && u.r === r && u.c === c);
}

function selectedUnit() {
  return units.find(u => u.id === selectedId && u.hp > 0) || null;
}

function distance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function tileDefense(r, c) {
  const t = terrain[r][c];
  if (t === 'forest') return 2;
  if (t === 'city') return 3;
  return 0;
}

function canMoveTo(unit, r, c) {
  if (!unit || unit.acted) return false;
  if (getUnitAt(r, c)) return false;
  return distance(unit, { r, c }) <= unitTypes[unit.type].move;
}

function canAttack(unit, target) {
  if (!unit || !target || unit.acted || unit.side === target.side) return false;
  const type = unitTypes[unit.type];
  const d = distance(unit, target);
  const min = type.minRange || 1;
  return d >= min && d <= type.range;
}

function damageFor(attacker, defender) {
  const base = unitTypes[attacker.type].attack;
  const defense = tileDefense(defender.r, defender.c);
  const matchup =
    attacker.type === 'tank' && defender.type === 'infantry' ? -1 :
    attacker.type === 'infantry' && defender.type === 'tank' ? -2 :
    attacker.type === 'artillery' ? 1 : 0;
  return Math.max(1, base + matchup - defense + Math.floor(Math.random() * 3) - 1);
}

function log(message) {
  const p = document.createElement('p');
  p.textContent = message;
  logEl.prepend(p);
}

function getUnitSymbolSvg(type) {
  if (type === 'infantry') {
    return `
      <svg viewBox="0 0 64 40" class="symbol-svg" aria-hidden="true">
        <line x1="12" y1="8" x2="52" y2="32"></line>
        <line x1="52" y1="8" x2="12" y2="32"></line>
      </svg>`;
  }

  if (type === 'tank') {
    return `
      <svg viewBox="0 0 64 40" class="symbol-svg" aria-hidden="true">
        <ellipse cx="32" cy="20" rx="18" ry="10"></ellipse>
      </svg>`;
  }

  if (type === 'artillery') {
    return `
      <svg viewBox="0 0 64 40" class="symbol-svg" aria-hidden="true">
        <circle cx="32" cy="20" r="6"></circle>
      </svg>`;
  }

  if (type === 'recon') {
    return `
      <svg viewBox="0 0 64 40" class="symbol-svg" aria-hidden="true">
        <line x1="18" y1="10" x2="32" y2="20"></line>
        <line x1="32" y1="20" x2="18" y2="30"></line>
        <line x1="32" y1="20" x2="46" y2="10"></line>
        <line x1="32" y1="20" x2="46" y2="30"></line>
        <circle cx="32" cy="20" r="2.5" fill="currentColor" stroke="none"></circle>
      </svg>`;
  }

  return '';
}

function buildUnitCounter(unit) {
  const t = unitTypes[unit.type];
  const token = document.createElement('div');
  token.className = `unit ${unit.side} ${unit.type}${unit.acted ? ' spent' : ''}`;
  token.title = `${t.name} — ${unit.hp} HP`;

  token.innerHTML = `
    <div class="unit-top">${t.name}</div>
    <div class="unit-face">
      ${getUnitSymbolSvg(unit.type)}
    </div>
    <span class="hp">${unit.hp}</span>
  `;

  return token;
}

function render() {
  boardEl.innerHTML = '';
  const selected = selectedUnit();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `tile ${terrain[r][c]}`;
      tile.dataset.r = r;
      tile.dataset.c = c;
      tile.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);

      if (r === objective.r && c === objective.c) tile.classList.add('objective');
      if (selected && selected.r === r && selected.c === c) tile.classList.add('selected');
      if (mode === 'move' && selected && canMoveTo(selected, r, c)) tile.classList.add('move-target');

      const occupying = getUnitAt(r, c);
      if (mode === 'attack' && selected && occupying && canAttack(selected, occupying)) {
        tile.classList.add('attack-target');
      }

      if (occupying) {
        tile.appendChild(buildUnitCounter(occupying));
      }

      tile.addEventListener('click', onTileClick);
      boardEl.appendChild(tile);
    }
  }

  renderSidebar();
}

function renderSidebar() {
  const unit = selectedUnit();
  turnLabel.textContent = `Turn ${turn} — ${activeSide === 'blue' ? 'Blue Force' : 'Red Force'}`;
  objectiveLabel.textContent = `Objective hold: ${objectiveHold} / ${HOLD_TURNS_TO_WIN}`;

  if (!unit) {
    detailsEl.className = 'details muted';
    detailsEl.textContent = 'Select one of your units.';
  } else {
    const t = unitTypes[unit.type];
    detailsEl.className = 'details';
    detailsEl.innerHTML = `<strong>${t.name}</strong><br>HP: ${unit.hp} / ${t.maxHp}<br>Move: ${t.move}<br>Range: ${t.minRange ? `${t.minRange}–${t.range}` : t.range}<br>Status: ${unit.acted ? 'Orders complete' : 'Ready'}`;
  }

  const controllable = unit && unit.side === 'blue' && activeSide === 'blue' && !unit.acted && !gameOver;
  moveBtn.disabled = !controllable;
  attackBtn.disabled = !controllable;
  waitBtn.disabled = !controllable;
  endTurnBtn.disabled = activeSide !== 'blue' || gameOver;
}

function onTileClick(e) {
  if (gameOver || activeSide !== 'blue') return;
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const clickedUnit = getUnitAt(r, c);
  const unit = selectedUnit();

  if (mode === 'move' && unit && canMoveTo(unit, r, c)) {
    unit.r = r; unit.c = c; unit.acted = true;
    log(`${unitTypes[unit.type].name} moved to ${r + 1},${c + 1}.`);
    mode = null;
    selectedId = null;
    checkWinState();
    render();
    return;
  }

  if (mode === 'attack' && unit && clickedUnit && canAttack(unit, clickedUnit)) {
    resolveAttack(unit, clickedUnit);
    mode = null;
    selectedId = null;
    checkWinState();
    render();
    return;
  }

  if (clickedUnit && clickedUnit.side === 'blue') {
    selectedId = clickedUnit.id;
    mode = null;
  } else {
    selectedId = null;
    mode = null;
  }
  render();
}

function resolveAttack(attacker, defender) {
  const dmg = damageFor(attacker, defender);
  defender.hp -= dmg;
  attacker.acted = true;
  log(`${unitTypes[attacker.type].name} hit enemy ${unitTypes[defender.type].name} for ${dmg}.`);
  if (defender.hp <= 0) {
    defender.hp = 0;
    log(`Enemy ${unitTypes[defender.type].name} destroyed.`);
  }
}

function checkWinState() {
  const blueAlive = units.some(u => u.side === 'blue' && u.hp > 0);
  const redAlive = units.some(u => u.side === 'red' && u.hp > 0);
  if (!redAlive) finishGame('Blue Force wins — enemy force eliminated.');
  if (!blueAlive) finishGame('Red Force wins — your force was eliminated.');
}

function finishGame(message) {
  gameOver = true;
  log(message);
  alert(message);
}

moveBtn.addEventListener('click', () => { mode = 'move'; render(); });
attackBtn.addEventListener('click', () => { mode = 'attack'; render(); });
waitBtn.addEventListener('click', () => {
  const unit = selectedUnit();
  if (unit) {
    unit.acted = true;
    log(`${unitTypes[unit.type].name} holds position.`);
    selectedId = null;
    mode = null;
    render();
  }
});
endTurnBtn.addEventListener('click', () => {
  if (activeSide !== 'blue' || gameOver) return;
  selectedId = null;
  mode = null;
  activeSide = 'red';
  render();
  setTimeout(runAiTurn, 350);
});

function runAiTurn() {
  const redUnits = units.filter(u => u.side === 'red' && u.hp > 0);
  for (const unit of redUnits) {
    if (gameOver) return;
    const enemies = units.filter(u => u.side === 'blue' && u.hp > 0);
    if (!enemies.length) break;

    const attackable = enemies.filter(e => canAttack(unit, e));
    if (attackable.length) {
      attackable.sort((a, b) => a.hp - b.hp);
      resolveAttack(unit, attackable[0]);
      continue;
    }

    const target = chooseAiTarget(unit, enemies);
    const step = chooseAiMove(unit, target);
    if (step) {
      unit.r = step.r;
      unit.c = step.c;
      log(`Enemy ${unitTypes[unit.type].name} advances.`);
    }

    const postMoveTargets = enemies.filter(e => canAttack(unit, e));
    if (postMoveTargets.length) {
      postMoveTargets.sort((a, b) => a.hp - b.hp);
      resolveAttack(unit, postMoveTargets[0]);
    } else {
      unit.acted = true;
    }
  }

  units = units.filter(u => u.hp > 0);
  checkObjectiveControl();
  checkWinState();
  if (gameOver) { render(); return; }

  turn++;
  activeSide = 'blue';
  units.forEach(u => { u.acted = false; });
  log(`Turn ${turn} begins.`);
  render();
}

function chooseAiTarget(unit, enemies) {
  const objectiveDistance = distance(unit, objective);
  const nearest = [...enemies].sort((a, b) => distance(unit, a) - distance(unit, b))[0];
  if (objectiveDistance > 2) return objective;
  return nearest;
}

function chooseAiMove(unit, target) {
  let best = null;
  let bestDist = Infinity;
  const maxMove = unitTypes[unit.type].move;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (getUnitAt(r, c)) continue;
      if (distance(unit, { r, c }) > maxMove) continue;
      const d = distance({ r, c }, target);
      if (d < bestDist) {
        bestDist = d;
        best = { r, c };
      }
    }
  }
  return best;
}

function checkObjectiveControl() {
  const blue = getUnitAt(objective.r, objective.c);
  if (blue && blue.side === 'blue') {
    objectiveHold++;
    log(`Blue Force holds the objective (${objectiveHold}/${HOLD_TURNS_TO_WIN}).`);
    if (objectiveHold >= HOLD_TURNS_TO_WIN) finishGame('Blue Force wins — objective secured.');
  } else {
    if (objectiveHold > 0) log('Blue Force lost control of the objective; hold counter reset.');
    objectiveHold = 0;
  }
}

log('Mission started. Capture the ★ objective and hold it for 3 turns.');
render();
