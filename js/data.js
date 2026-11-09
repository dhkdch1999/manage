// =====================================================
// data.js — 모든 밸런스 수치와 기본 데이터 (여기만 고치면 밸런스 조정 가능)
// =====================================================
var G = (typeof window !== 'undefined' ? window : globalThis).G = {};

// ---------- 시드 기반 난수 ----------
G.RNG = function (seed) {
  this.s = (seed >>> 0) || 1;
};
G.RNG.prototype.next = function () {
  // mulberry32
  var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
G.RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
G.RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
G.RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
G.RNG.prototype.chance = function (p) { return this.next() < p; };
G.RNG.prototype.shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(this.next() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};
G.rng = new G.RNG(Date.now());

G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

// ---------- 밸런스 설정 ----------
G.CONFIG = {
  // 전투 (시간 단위: 시뮬레이션 초. 화면에는 TIME_SCALE 배로 표시 → 240초 = 30:00)
  TICK: 0.1,               // 초당 10틱
  MATCH_TIME: 240,         // 경기 제한 시간 — 넥서스가 안 깨지면 점수로 승부
  HALF_TIME: 120,          // 하프타임
  TIME_SCALE: 7.5,
  LANING_END: 70,          // 라인전 단계 종료
  LATE_START: 150,         // 후반 (5인 그룹 운영)
  RESPAWN_BASE: 7,
  RESPAWN_GROW: 0.09,      // 경기 시간 1초당 부활 시간 증가
  BASE_REGEN: 0.15,        // 우물에서 초당 회복 (최대 체력 비율)
  COUNTER_BONUS: 0.12,     // 상성 우위 피해 보너스
  ASSIST_WINDOW: 6,
  ENGAGE_RANGE: 150,       // 사거리 + 이 거리 안의 적 챔피언과 교전

  // 성장 (CS·레벨)
  FARM_LANE: 1.0,          // 라인에 있을 때 초당 성장치
  FARM_CAMP: 10,           // 정글 캠프 처치
  FARM_KILL: 8, FARM_ASSIST: 3, FARM_TOWER: 5,
  FARM_PER_LEVEL: 6.5,
  MAX_LEVEL: 18,
  LVL_HP: 0.045,           // 레벨당 체력 +4.5%
  LVL_ATK: 0.04,           // 레벨당 공격력 +4%

  // 라인 · 포탑
  PUSH_PER_UNIT: 0.008,    // 라인에 아군이 1명 더 많을 때 초당 라인 전진(경로 비율)
  TOWER_RANGE: 165,
  TOWER_HP: { outer: 1000, inner: 1300 },
  NEXUS_HP: 1800,
  TOWER_DMG: 70, TOWER_DMG_GROW: 1.1,  // 기본 + 경기 시간 1초당 증가
  TOWER_AS: 1.0,
  MINION_TOWER_DPS: 22,    // 미니언이 포탑에 주는 초당 피해
  STRUCT_DMG: 1.0,         // 챔피언이 건물에 주는 피해 배수

  // 정글 · 오브젝트
  CAMP_HP: 500, CAMP_RESPAWN: 35,
  GANK_THRESHOLD: 2.3,
  DRAGON: { spawn: 50, respawn: 50, hp: 1500, hpGrow: 6, dps: 10, buff: 0.1 },          // 처치 팀 영구 피해 +10%/스택
  BARON: { spawn: 120, respawn: 60, hp: 3200, hpGrow: 4, dps: 22, buffDmg: 0.25, buffTime: 40, pushMul: 2.5 },
  SCORE: { kill: 1, tower: 2, dragon: 3, baron: 4 }, // 제한 시간 종료 시 승부 점수

  // 선수 능력치 → 전투 반영
  ATK_PER: 0.03,           // 공격 1당 피해 +3% (10 기준)
  DEF_PER: 0.025,          // 방어 1당 받는 피해 -2.5%
  HIT_BASE: 0.66,          // 스킬 기본 명중률
  HIT_PER_PHYS: 0.025,     // 시전자 피지컬 1당 명중 +
  DODGE_PER_PHYS: 0.012,   // 대상 피지컬 1당 회피 +
  SMART_BASE: 0.25,        // 운영 → 최적 타겟 선택 확률 = BASE + 운영*PER
  SMART_PER: 0.035,
  FOCUS_BASE: 0.1,         // 팀워크 → 집중 공격 확률
  FOCUS_PER: 0.035,
  MASTERY_MIN: 0.9,        // 숙련도 0 → 0.9배, 100 → 1.1배
  MASTERY_MAX: 1.1,
  COND_MIN: 0.92,          // 컨디션 0 → 0.92배, 100 → 1.04배
  COND_MAX: 1.04,
  MENTAL_PER: 0.012,       // 3점 이상 뒤질 때 멘탈 1당 보정

  // 진입 타이밍 (교전 합류 지연, 초)
  ENTRY: { now: 0, together: 0.6, late: 1.5 },

  // 팀 전술
  TACTICS: {
    aggressive: { name: '공격적', desc: '갱킹·카운터 정글·한타를 적극적으로. 초반 강세, 후반 약세.',
      dmgEarly: 0.18, dmgLate: -0.02, retreatHp: 0.27, holdLine: 0, counterBonus: 0, objWeight: 1.3, gank: -0.6, invade: 0.35, callAdv: 0 },
    balanced: { name: '균형', desc: '라인전 후 상황에 따라 오브젝트·교전 판단. 보정치 없음.',
      dmgEarly: 0.03, dmgLate: 0.03, retreatHp: 0.3, holdLine: 0, counterBonus: 0, objWeight: 1.0, gank: 0, invade: 0.12, callAdv: 0 },
    defensive: { name: '수비적', desc: '포탑 근처에서 버티며 받아치기. 아군 진영 교전 피해 보너스, 오브젝트 욕심 적음.',
      dmgEarly: -0.03, dmgLate: 0, retreatHp: 0.3, holdLine: 0.47, counterBonus: 0.03, objWeight: 0.5, gank: 0.6, invade: 0.03, callAdv: 1 },
    tricky: { name: '변칙적', desc: '기습 갱킹·스플릿 푸시·페이크 후퇴. 성공하면 대박, 실패하면 각개격파. 같은 상대에게 연속 사용 시 간파당함.',
      dmgEarly: 0, dmgLate: 0, retreatHp: 0.28, holdLine: 0, counterBonus: 0, objWeight: 0.9, gank: 0, invade: 0.15, callAdv: 0 }
  },

  // 변칙 전술 세부
  TRICK: {
    firstPlay: 35,         // 첫 시도(초)
    interval: 28,          // 시도 간격(초)
    roll: 8,               // 성공 판정 난수 폭
    readPenaltyPerUse: 3,  // 같은 상대에게 연속 사용 1회당 성공 판정 -3
    inMatchPenalty: 0.8,   // 같은 경기 안에서 시도할 때마다 -1.5
    ambushDmg: 1.3, ambushStun: 1.5, ambushSpeed: 0.35,
    exposedDef: -0.25, exposedTime: 6,
    splitObjBonus: 1.0, splitTime: 20, splitTeamDmg: 0.08, splitFailDmg: -0.15, splitFailTime: 8,
    fakeRetreat: 1.2, fakeDmg: 0.02, fakeSpd: 0.1, fakeTime: 3, fakeSlow: 0.1,
    fakeFailDmg: -0.25, fakeFailTime: 5, fakeFailSlow: 0.3
  },

  // 구단 운영 (금액 단위: 만원)
  START_MONEY: 6000,
  WEEKS_REGULAR: 14,
  SALARY_DIVISOR: 18,      // 시즌 연봉을 이 주 수로 나눠 매주 지급
  SPONSOR_BASE: 120,
  SPONSOR_PER_FAN: 0.02,
  WIN_PRIZE: { 1: 200, 2: 80 },
  PLAYOFF_PRIZE: { 1: [3000, 1500], 2: [1000, 500] }, // [우승, 준우승]
  WORLDS_PRIZE: [10000, 5000],
  FACILITY_COST: 2500,     // 레벨당 비용
  FACILITY_MAX: 5,
  SCOUT_COST: 60,
  ROSTER_MAX: 8,
  ROSTER_MIN: 5,
  START_FANS: 1500,

  // 훈련 · 성장
  TRAIN_RATE: 0.16,
  TRAIN_FATIGUE: 11,
  MATCH_FATIGUE: 8,
  REST_RECOVER: 28,
  HERO_TRAIN_GAIN: 7,
  MATCH_MASTERY_GAIN: 2,

  // 패치
  PATCH_COUNT: 3,          // 버프/너프 각 개수
  PATCH_STEP: 0.07
};

// 포지션 (선수) — 탑/정글/미드/원딜/서폿
G.POS = { top: '탑', jungle: '정글', mid: '미드', adc: '원딜', support: '서폿' };
G.POS_ORDER = ['top', 'jungle', 'mid', 'adc', 'support'];
G.POS_COLOR = { top: '#f08c00', jungle: '#2f9e44', mid: '#1c7ed6', adc: '#e03131', support: '#ae3ec9' };
G.POS_LANE = { top: 'top', jungle: null, mid: 'mid', adc: 'bot', support: 'bot' };
G.POS_STAT = { top: 'def', jungle: 'iq', mid: 'atk', adc: 'phys', support: 'team' }; // 포지션별 특화 능력치

// 영웅 클래스 / 상성
G.ROLES = { tank: '탱커', fighter: '전사', marksman: '원거리 딜러', mage: '마법사', support: '서포터' };
G.ROLE_ORDER = ['tank', 'fighter', 'mage', 'marksman', 'support'];
G.ARCH = { dive: '돌진형', ranged: '원거리형', tank: '탱커형' };
// key 가 value 를 이긴다
G.ARCH_BEATS = { dive: 'ranged', ranged: 'tank', tank: 'dive' };

// ---------- 영웅 (오리지널) ----------
// 스킬 타입: dash(돌진 피해), aoe(범위 피해), stun(단일 기절), snipe(저격), drain(흡혈),
//           heal(치유), shield(보호막), rally(강화), taunt(도발)
// p: 위력(피해는 공격력 배수, 치유/보호막은 100 단위), cd: 쿨다운, r: 사거리, rad: 범위
// armor: 받는 피해 감소 비율 (탱커 전용 패시브)
// pos: 갈 수 있는 포지션 (첫 번째가 주 포지션)
G.HEROES = [
  { id: 'ironwall', name: '철벽', emoji: '🛡️', pos: ['top', 'support'], armor: 0.22, role: 'tank', arch: 'tank', hp: 1911, atk: 66, range: 45, spd: 74, as: 0.8,
    skill: { t: 'taunt', p: 2.0, cd: 9, r: 60, rad: 120, dur: 1.5 },
    ult: { t: 'aoe', p: 1.6, cd: 22, r: 60, rad: 140, stun: 1.2 } },
  { id: 'golem', name: '바위거인', emoji: '🪨', pos: ['top', 'jungle'], armor: 0.24, role: 'tank', arch: 'tank', hp: 2017, atk: 63, range: 45, spd: 70, as: 0.75,
    skill: { t: 'stun', p: 1.1, cd: 8, r: 60, stun: 1.0 },
    ult: { t: 'aoe', p: 2.0, cd: 24, r: 60, rad: 120, stun: 0.9 } },
  { id: 'frostguard', name: '서리방패', emoji: '❄️', pos: ['top', 'support'], armor: 0.15, role: 'tank', arch: 'tank', hp: 1674, atk: 59, range: 50, spd: 76, as: 0.8,
    skill: { t: 'aoe', p: 1.0, cd: 7, r: 60, rad: 110, slow: 0.4, slowDur: 2 },
    ult: { t: 'shield', p: 2.2, cd: 22, r: 200, rad: 220, all: true } },
  { id: 'paladin', name: '수호기사', emoji: '⚜️', pos: ['support', 'top'], armor: 0.12, role: 'tank', arch: 'tank', hp: 1613, atk: 64, range: 45, spd: 78, as: 0.85,
    skill: { t: 'shield', p: 2.6, cd: 8, r: 200 },
    ult: { t: 'taunt', p: 3.5, cd: 24, r: 60, rad: 160, dur: 2.2 } },

  { id: 'berserker', name: '광전사', emoji: '🪓', pos: ['top', 'jungle'], role: 'fighter', arch: 'dive', hp: 1161, atk: 64, range: 45, spd: 86, as: 1.0,
    skill: { t: 'dash', p: 1.5, cd: 7, r: 240 },
    ult: { t: 'rally', p: 0, cd: 22, r: 0, self: true, as: 0.7, dmg: 0.2, dur: 5, lifesteal: 0.3 } },
  { id: 'shadowblade', name: '그림자칼', emoji: '🗡️', pos: ['jungle', 'mid'], role: 'fighter', arch: 'dive', hp: 888, atk: 73, range: 40, spd: 100, as: 1.1,
    skill: { t: 'dash', p: 1.7, cd: 8, r: 280, lowest: true },
    ult: { t: 'dash', p: 3.2, cd: 20, r: 320, lowest: true } },
  { id: 'galespear', name: '질풍창', emoji: '🔱', pos: ['top', 'jungle'], role: 'fighter', arch: 'dive', hp: 1070, atk: 60, range: 70, spd: 88, as: 0.95,
    skill: { t: 'dash', p: 1.3, cd: 8, r: 250, stun: 0.6 },
    ult: { t: 'aoe', p: 2.4, cd: 22, r: 80, rad: 120 } },
  { id: 'beast', name: '야수', emoji: '🐺', pos: ['jungle', 'top'], role: 'fighter', arch: 'dive', hp: 1175, atk: 59, range: 45, spd: 90, as: 1.0,
    skill: { t: 'drain', p: 1.5, cd: 6, r: 60, heal: 0.6 },
    ult: { t: 'drain', p: 3.0, cd: 20, r: 60, heal: 0.8 } },
  { id: 'thunderfist', name: '번개주먹', emoji: '⚡', pos: ['jungle', 'mid'], role: 'fighter', arch: 'dive', hp: 1001, atk: 65, range: 45, spd: 92, as: 1.05,
    skill: { t: 'stun', p: 1.3, cd: 8, r: 60, stun: 0.8 },
    ult: { t: 'aoe', p: 2.2, cd: 22, r: 60, rad: 110, stun: 1.0 } },

  { id: 'hawkeye', name: '매의눈', emoji: '🏹', pos: ['adc'], role: 'marksman', arch: 'ranged', hp: 596, atk: 55, range: 220, spd: 80, as: 1.0,
    skill: { t: 'snipe', p: 2.0, cd: 8, r: 320 },
    ult: { t: 'snipe', p: 4.2, cd: 22, r: 450 } },
  { id: 'powder', name: '화약사수', emoji: '💣', pos: ['adc', 'mid'], role: 'marksman', arch: 'ranged', hp: 688, atk: 59, range: 200, spd: 78, as: 0.95,
    skill: { t: 'aoe', p: 1.3, cd: 7, r: 220, rad: 80 },
    ult: { t: 'aoe', p: 2.6, cd: 22, r: 260, rad: 120 } },
  { id: 'rapid', name: '연사수', emoji: '🎯', pos: ['adc'], role: 'marksman', arch: 'ranged', hp: 626, atk: 44, range: 210, spd: 82, as: 1.4,
    skill: { t: 'rally', p: 0, cd: 10, r: 0, self: true, as: 0.5, dur: 4 },
    ult: { t: 'rally', p: 0, cd: 22, r: 0, self: true, as: 1.0, dmg: 0.3, dur: 5 } },
  { id: 'moonbow', name: '은빛석궁', emoji: '🌙', pos: ['adc'], role: 'marksman', arch: 'ranged', hp: 661, atk: 56, range: 230, spd: 80, as: 0.9,
    skill: { t: 'stun', p: 1.2, cd: 9, r: 240, slow: 0.5, slowDur: 2.5 },
    ult: { t: 'snipe', p: 3.6, cd: 22, r: 400 } },

  { id: 'flame', name: '불꽃술사', emoji: '🔥', pos: ['mid'], role: 'mage', arch: 'ranged', hp: 623, atk: 65, range: 190, spd: 78, as: 0.8,
    skill: { t: 'aoe', p: 1.6, cd: 7, r: 220, rad: 90 },
    ult: { t: 'aoe', p: 3.0, cd: 24, r: 240, rad: 130 } },
  { id: 'icewitch', name: '얼음마녀', emoji: '🧊', pos: ['mid', 'support'], role: 'mage', arch: 'ranged', hp: 622, atk: 54, range: 190, spd: 78, as: 0.8,
    skill: { t: 'aoe', p: 1.2, cd: 7, r: 220, rad: 90, slow: 0.45, slowDur: 2.5 },
    ult: { t: 'aoe', p: 2.2, cd: 24, r: 240, rad: 130, stun: 1.4 } },
  { id: 'stormcaller', name: '번개술사', emoji: '🌩️', pos: ['mid', 'adc'], role: 'mage', arch: 'ranged', hp: 600, atk: 66, range: 200, spd: 80, as: 0.8,
    skill: { t: 'stun', p: 1.5, cd: 8, r: 220, stun: 0.9 },
    ult: { t: 'aoe', p: 2.8, cd: 22, r: 260, rad: 110 } },
  { id: 'vampire', name: '흡혈마', emoji: '🦇', pos: ['mid', 'jungle'], role: 'mage', arch: 'dive', hp: 802, atk: 59, range: 150, spd: 84, as: 0.9,
    skill: { t: 'drain', p: 1.5, cd: 6, r: 180, heal: 0.7 },
    ult: { t: 'aoe', p: 2.2, cd: 22, r: 120, rad: 130, drain: 0.5 } },

  { id: 'healer', name: '치유사', emoji: '💚', pos: ['support'], role: 'support', arch: 'ranged', hp: 709, atk: 37, range: 180, spd: 80, as: 0.8,
    skill: { t: 'heal', p: 3.4, cd: 6, r: 240 },
    ult: { t: 'heal', p: 3.0, cd: 22, r: 999, all: true } },
  { id: 'bard', name: '음유시인', emoji: '🎵', pos: ['support'], role: 'support', arch: 'ranged', hp: 777, atk: 38, range: 180, spd: 84, as: 0.8,
    skill: { t: 'rally', p: 0, cd: 10, r: 200, rad: 200, as: 0.35, dur: 4 },
    ult: { t: 'shield', p: 2.0, cd: 22, r: 999, all: true } },
  { id: 'spirit', name: '수호정령', emoji: '🌿', pos: ['support'], role: 'support', arch: 'tank', hp: 967, atk: 40, range: 120, spd: 80, as: 0.85,
    skill: { t: 'shield', p: 3.2, cd: 7, r: 220 },
    ult: { t: 'heal', p: 2.6, cd: 22, r: 300, rad: 300, all: true } },
  { id: 'chain', name: '사슬주술사', emoji: '⛓️', pos: ['support', 'mid'], armor: 0.05, role: 'support', arch: 'ranged', hp: 789, atk: 45, range: 190, spd: 80, as: 0.8,
    skill: { t: 'stun', p: 0.8, cd: 9, r: 220, stun: 1.1 },
    ult: { t: 'aoe', p: 1.4, cd: 22, r: 220, rad: 120, stun: 1.6 } },
  { id: 'wardrum', name: '전쟁북', emoji: '🥁', pos: ['support', 'jungle'], role: 'support', arch: 'dive', hp: 1113, atk: 50, range: 50, spd: 86, as: 0.9,
    skill: { t: 'rally', p: 0, cd: 10, r: 200, rad: 200, dmg: 0.2, spd: 0.25, dur: 4 },
    ult: { t: 'taunt', p: 2.5, cd: 22, r: 60, rad: 140, dur: 1.8 } }
];
// 기본 패치 기준 영웅 승률 (포지션에 맞춘 무작위 조합 3000판 시뮬레이션 결과, tools/sim-test.js 로 재측정 가능)
// 티어리스트에서 경기 표본이 적을 때 예상치로 쓴다
G.HERO_BASE_WR = {'ironwall': 0.555,  'golem': 0.534,  'frostguard': 0.524,  'paladin': 0.493,  'berserker': 0.469,  'shadowblade': 0.503,  'galespear': 0.459,  'beast': 0.495,  'thunderfist': 0.498,  'hawkeye': 0.54,  'powder': 0.456,  'rapid': 0.486,  'moonbow': 0.566,  'flame': 0.476,  'icewitch': 0.578,  'stormcaller': 0.499,  'vampire': 0.531,  'healer': 0.457,  'bard': 0.464,  'spirit': 0.435,  'chain': 0.487,  'wardrum': 0.44};

// 티어리스트 설정
G.TIER = {
  PRIOR_GAMES: 12,      // 예상 승률을 몇 경기 분량으로 볼지 (표본이 적을수록 예상치 비중 ↑)
  MOD_TO_WR: 0.8,       // 패치 배율 1%당 예상 승률 0.8%p 변화
  PRESENCE_W: 0.06,     // 픽+밴률이 티어 점수에 주는 가중치
  CUTS: [['S', 0.14], ['A', 0.36], ['B', 0.68], ['C', 0.86], ['D', 1.01]], // 순위 비율 기준
  COLORS: { S: '#ff6b6b', A: '#ffa94d', B: '#ffd43b', C: '#69db7c', D: '#74c0fc' }
};

G.HERO_BY_ID = {};
G.HEROES.forEach(function (h) { G.HERO_BY_ID[h.id] = h; });

// ---------- 맵 (720x720, 파랑 진영 왼쪽 아래 / 빨강 진영 오른쪽 위) ----------
G.MAP = {
  W: 720, H: 720,
  BASES: [{ x: 58, y: 662 }, { x: 662, y: 58 }],
  // 라인 경로: 파랑 우물(0) → 빨강 우물(1)
  LANES: {
    top: [[58, 662], [62, 62], [662, 58]],
    mid: [[58, 662], [662, 58]],
    bot: [[58, 662], [658, 658], [662, 58]]
  },
  LANE_NAMES: { top: '탑', mid: '미드', bot: '바텀' },
  // 파랑 기준 포탑 위치(경로 비율). 빨강은 1 - t
  TOWERS: [{ tier: 'outer', t: 0.30 }, { tier: 'inner', t: 0.15 }],
  CAMPS: [
    { side: 0, x: 175, y: 330 }, { side: 0, x: 390, y: 545 },
    { side: 1, x: 545, y: 390 }, { side: 1, x: 330, y: 175 }
  ],
  DRAGON: { x: 478, y: 478 },
  BARON: { x: 242, y: 242 }
};

// ---------- 이름 풀 ----------
G.NICK_A = ['신속', '철혈', '은하', '폭풍', '그늘', '번개', '백야', '청룡', '태양', '심연', '서리', '불꽃', '유성', '새벽', '야광',
  '흑요', '용맹', '창공', '해일', '묵향', '바람', '파도', '천둥', '빙하', '노을', '별빛', '안개', '진홍', '청명', '황금'];
G.NICK_B = ['', '', 'K', 'X', 'Z', '7', 'Ace', 'One', '01', 'Jr', 'S', 'Q', 'V', '99'];
G.NICK_EN = ['Rook', 'Viper', 'Nova', 'Kite', 'Echo', 'Blaze', 'Frost', 'Raven', 'Lynx', 'Orca', 'Pulse', 'Drift', 'Ember',
  'Glint', 'Haze', 'Iris', 'Jolt', 'Karma', 'Lumen', 'Mist', 'Nyx', 'Onyx', 'Pike', 'Quill', 'Rune', 'Sable', 'Tide', 'Umbra',
  'Vex', 'Wisp', 'Yeti', 'Zeal', 'Ash', 'Bolt', 'Cinder', 'Dusk', 'Flint', 'Grim', 'Hex', 'Ivy'];

G.TEAM_NAMES_1 = ['서울 블레이즈', '부산 타이드', '인천 스톰', '대전 리버스', '광주 피닉스', '대구 아이언', '수원 나이츠', '울산 웨이브'];
G.TEAM_NAMES_2 = ['제주 윈드', '청주 호크', '전주 썬더', '창원 볼트', '포항 스틸', '원주 울브즈', '춘천 미스트'];
G.WORLD_TEAMS = ['북해 바이킹스', '사막 스콜피온', '동방 드래곤즈', '서부 레인저스', '남극 펭귄즈', '열도 사무라이'];
G.TEAM_COLORS = ['#e4572e', '#29a3d6', '#8a5cf6', '#f2b134', '#2bb673', '#d6336c', '#20c997', '#fd7e14',
  '#5c7cfa', '#868e96', '#e8590c', '#12b886', '#be4bdb', '#fab005', '#228be6', '#fa5252'];
G.STYLES = ['aggressive', 'balanced', 'defensive', 'tricky'];
G.STAT_KEYS = ['atk', 'def', 'phys', 'iq', 'team'];
G.STAT_NAMES = { atk: '공격', def: '방어', phys: '피지컬', iq: '운영', team: '팀워크' };
