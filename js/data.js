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
  // 전투
  TICK: 0.1,               // 초당 10틱
  MATCH_TIME: 90,          // 경기 시간(초)
  HALF_TIME: 45,           // 하프타임
  OT_TIME: 20,             // 연장(서든데스)
  MAP_W: 800,
  MAP_H: 480,
  RESPAWN_BASE: 5,
  RESPAWN_GROW: 0.06,      // 경기 시간 1초당 부활 시간 증가
  BASE_REGEN: 0.14,        // 진영에서 초당 회복 (최대 체력 비율)
  OBJ_HP: 2600,
  OBJ_SPAWN: 15,           // 목표물 첫 등장(초)
  OBJ_RESPAWN: 30,
  OBJ_POINTS: 3,           // 목표물 처치 점수
  OBJ_BUFF_TIME: 18,
  OBJ_BUFF_DMG: 0.2,
  COUNTER_BONUS: 0.12,     // 상성 우위 피해 보너스
  ASSIST_WINDOW: 5,

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

  // 진입 타이밍 (초)
  ENTRY: { now: 0, together: 1.5, late: 3.5 },

  // 팀 전술
  TACTICS: {
    aggressive: { name: '공격적', desc: '교전을 빨리 열고 적극적으로 진입. 초반 강세, 후반 약세.',
      dmgEarly: 0.16, dmgLate: -0.03, retreatHp: 0.26, holdLine: 0, counterBonus: 0, objWeight: 1.2 },
    balanced: { name: '균형', desc: '상황에 따라 교전/후퇴 판단. 보정치 없음.',
      dmgEarly: 0, dmgLate: 0, retreatHp: 0.28, holdLine: 0, counterBonus: 0, objWeight: 0.9 },
    defensive: { name: '수비적', desc: '진영 근처에서 버티다 받아치기. 역습 피해 보너스, 목표물 압박 약함.',
      dmgEarly: 0, dmgLate: 0, retreatHp: 0.28, holdLine: 0.42, counterBonus: 0.02, objWeight: 0.35 },
    tricky: { name: '변칙적', desc: '기습·분산 압박·페이크 후퇴. 성공하면 대박, 실패하면 각개격파. 같은 상대에게 연속 사용 시 간파당함.',
      dmgEarly: 0, dmgLate: 0, retreatHp: 0.28, holdLine: 0, counterBonus: 0, objWeight: 0.8 }
  },

  // 변칙 전술 세부
  TRICK: {
    firstPlay: 5,          // 첫 시도(초)
    interval: 17,          // 시도 간격(초)
    roll: 8,               // 성공 판정 난수 폭
    readPenaltyPerUse: 3,  // 같은 상대에게 연속 사용 1회당 성공 판정 -3
    inMatchPenalty: 0.8,   // 같은 경기 안에서 시도할 때마다 -1.5
    ambushDmg: 1.8, ambushStun: 1.8, ambushSpeed: 0.35,
    exposedDef: -0.25, exposedTime: 6,
    splitObjBonus: 1.0, splitTime: 12, splitTeamDmg: 0.12, splitFailDmg: -0.15, splitFailTime: 8,
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

// 역할 / 상성
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
G.HEROES = [
  { id: 'ironwall', name: '철벽', emoji: '🛡️', armor: 0.22, role: 'tank', arch: 'tank', hp: 1949, atk: 67, range: 45, spd: 74, as: 0.8,
    skill: { t: 'taunt', p: 2.0, cd: 9, r: 60, rad: 120, dur: 1.5 },
    ult: { t: 'aoe', p: 1.6, cd: 22, r: 60, rad: 140, stun: 1.2 } },
  { id: 'golem', name: '바위거인', emoji: '🪨', armor: 0.24, role: 'tank', arch: 'tank', hp: 2054, atk: 64, range: 45, spd: 70, as: 0.75,
    skill: { t: 'stun', p: 1.1, cd: 8, r: 60, stun: 1.0 },
    ult: { t: 'aoe', p: 2.0, cd: 24, r: 60, rad: 120, stun: 0.9 } },
  { id: 'frostguard', name: '서리방패', emoji: '❄️', armor: 0.15, role: 'tank', arch: 'tank', hp: 1687, atk: 59, range: 50, spd: 76, as: 0.8,
    skill: { t: 'aoe', p: 1.0, cd: 7, r: 60, rad: 110, slow: 0.4, slowDur: 2 },
    ult: { t: 'shield', p: 2.2, cd: 22, r: 200, rad: 220, all: true } },
  { id: 'paladin', name: '수호기사', emoji: '⚜️', armor: 0.12, role: 'tank', arch: 'tank', hp: 1623, atk: 64, range: 45, spd: 78, as: 0.85,
    skill: { t: 'shield', p: 2.6, cd: 8, r: 200 },
    ult: { t: 'taunt', p: 3.5, cd: 24, r: 60, rad: 160, dur: 2.2 } },

  { id: 'berserker', name: '광전사', emoji: '🪓', role: 'fighter', arch: 'dive', hp: 1137, atk: 62, range: 45, spd: 86, as: 1.0,
    skill: { t: 'dash', p: 1.5, cd: 7, r: 240 },
    ult: { t: 'rally', p: 0, cd: 22, r: 0, self: true, as: 0.7, dmg: 0.2, dur: 5, lifesteal: 0.3 } },
  { id: 'shadowblade', name: '그림자칼', emoji: '🗡️', role: 'fighter', arch: 'dive', hp: 891, atk: 73, range: 40, spd: 100, as: 1.1,
    skill: { t: 'dash', p: 1.7, cd: 8, r: 280, lowest: true },
    ult: { t: 'dash', p: 3.2, cd: 20, r: 320, lowest: true } },
  { id: 'galespear', name: '질풍창', emoji: '🔱', role: 'fighter', arch: 'dive', hp: 1060, atk: 60, range: 70, spd: 88, as: 0.95,
    skill: { t: 'dash', p: 1.3, cd: 8, r: 250, stun: 0.6 },
    ult: { t: 'aoe', p: 2.4, cd: 22, r: 80, rad: 120 } },
  { id: 'beast', name: '야수', emoji: '🐺', role: 'fighter', arch: 'dive', hp: 1168, atk: 59, range: 45, spd: 90, as: 1.0,
    skill: { t: 'drain', p: 1.5, cd: 6, r: 60, heal: 0.6 },
    ult: { t: 'drain', p: 3.0, cd: 20, r: 60, heal: 0.8 } },
  { id: 'thunderfist', name: '번개주먹', emoji: '⚡', role: 'fighter', arch: 'dive', hp: 986, atk: 64, range: 45, spd: 92, as: 1.05,
    skill: { t: 'stun', p: 1.3, cd: 8, r: 60, stun: 0.8 },
    ult: { t: 'aoe', p: 2.2, cd: 22, r: 60, rad: 110, stun: 1.0 } },

  { id: 'hawkeye', name: '매의눈', emoji: '🏹', role: 'marksman', arch: 'ranged', hp: 605, atk: 56, range: 220, spd: 80, as: 1.0,
    skill: { t: 'snipe', p: 2.0, cd: 8, r: 320 },
    ult: { t: 'snipe', p: 4.2, cd: 22, r: 450 } },
  { id: 'powder', name: '화약사수', emoji: '💣', role: 'marksman', arch: 'ranged', hp: 678, atk: 58, range: 200, spd: 78, as: 0.95,
    skill: { t: 'aoe', p: 1.3, cd: 7, r: 220, rad: 80 },
    ult: { t: 'aoe', p: 2.6, cd: 22, r: 260, rad: 120 } },
  { id: 'rapid', name: '연사수', emoji: '🎯', role: 'marksman', arch: 'ranged', hp: 632, atk: 44, range: 210, spd: 82, as: 1.4,
    skill: { t: 'rally', p: 0, cd: 10, r: 0, self: true, as: 0.5, dur: 4 },
    ult: { t: 'rally', p: 0, cd: 22, r: 0, self: true, as: 1.0, dmg: 0.3, dur: 5 } },
  { id: 'moonbow', name: '은빛석궁', emoji: '🌙', role: 'marksman', arch: 'ranged', hp: 669, atk: 57, range: 230, spd: 80, as: 0.9,
    skill: { t: 'stun', p: 1.2, cd: 9, r: 240, slow: 0.5, slowDur: 2.5 },
    ult: { t: 'snipe', p: 3.6, cd: 22, r: 400 } },

  { id: 'flame', name: '불꽃술사', emoji: '🔥', role: 'mage', arch: 'ranged', hp: 619, atk: 65, range: 190, spd: 78, as: 0.8,
    skill: { t: 'aoe', p: 1.6, cd: 7, r: 220, rad: 90 },
    ult: { t: 'aoe', p: 3.0, cd: 24, r: 240, rad: 130 } },
  { id: 'icewitch', name: '얼음마녀', emoji: '🧊', role: 'mage', arch: 'ranged', hp: 634, atk: 55, range: 190, spd: 78, as: 0.8,
    skill: { t: 'aoe', p: 1.2, cd: 7, r: 220, rad: 90, slow: 0.45, slowDur: 2.5 },
    ult: { t: 'aoe', p: 2.2, cd: 24, r: 240, rad: 130, stun: 1.4 } },
  { id: 'stormcaller', name: '번개술사', emoji: '🌩️', role: 'mage', arch: 'ranged', hp: 597, atk: 66, range: 200, spd: 80, as: 0.8,
    skill: { t: 'stun', p: 1.5, cd: 8, r: 220, stun: 0.9 },
    ult: { t: 'aoe', p: 2.8, cd: 22, r: 260, rad: 110 } },
  { id: 'vampire', name: '흡혈마', emoji: '🦇', role: 'mage', arch: 'dive', hp: 819, atk: 60, range: 150, spd: 84, as: 0.9,
    skill: { t: 'drain', p: 1.5, cd: 6, r: 180, heal: 0.7 },
    ult: { t: 'aoe', p: 2.2, cd: 22, r: 120, rad: 130, drain: 0.5 } },

  { id: 'healer', name: '치유사', emoji: '💚', role: 'support', arch: 'ranged', hp: 694, atk: 36, range: 180, spd: 80, as: 0.8,
    skill: { t: 'heal', p: 2.6, cd: 6, r: 240 },
    ult: { t: 'heal', p: 2.4, cd: 22, r: 999, all: true } },
  { id: 'bard', name: '음유시인', emoji: '🎵', role: 'support', arch: 'ranged', hp: 770, atk: 38, range: 180, spd: 84, as: 0.8,
    skill: { t: 'rally', p: 0, cd: 10, r: 200, rad: 200, as: 0.35, dur: 4 },
    ult: { t: 'shield', p: 2.0, cd: 22, r: 999, all: true } },
  { id: 'spirit', name: '수호정령', emoji: '🌿', role: 'support', arch: 'tank', hp: 945, atk: 40, range: 120, spd: 80, as: 0.85,
    skill: { t: 'shield', p: 2.4, cd: 7, r: 220 },
    ult: { t: 'heal', p: 2.0, cd: 22, r: 300, rad: 300, all: true } },
  { id: 'chain', name: '사슬주술사', emoji: '⛓️', armor: 0.05, role: 'support', arch: 'ranged', hp: 794, atk: 45, range: 190, spd: 80, as: 0.8,
    skill: { t: 'stun', p: 0.8, cd: 9, r: 220, stun: 1.1 },
    ult: { t: 'aoe', p: 1.4, cd: 22, r: 220, rad: 120, stun: 1.6 } },
  { id: 'wardrum', name: '전쟁북', emoji: '🥁', role: 'support', arch: 'dive', hp: 1013, atk: 46, range: 50, spd: 86, as: 0.9,
    skill: { t: 'rally', p: 0, cd: 10, r: 200, rad: 200, dmg: 0.2, spd: 0.25, dur: 4 },
    ult: { t: 'taunt', p: 2.5, cd: 22, r: 60, rad: 140, dur: 1.8 } }
];
// 기본 패치 기준 영웅 승률 (무작위 전투 3000판 시뮬레이션 결과, tools/sim-test.js 로 재측정 가능)
// 티어리스트에서 경기 표본이 적을 때 예상치로 쓴다
G.HERO_BASE_WR = {'ironwall': 0.504,  'golem': 0.445,  'frostguard': 0.466,  'paladin': 0.477,  'berserker': 0.512,  'shadowblade': 0.471,  'galespear': 0.477,  'beast': 0.491,  'thunderfist': 0.524,  'hawkeye': 0.529,  'powder': 0.484,  'rapid': 0.541,  'moonbow': 0.569,  'flame': 0.501,  'icewitch': 0.54,  'stormcaller': 0.529,  'vampire': 0.522,  'healer': 0.512,  'bard': 0.463,  'spirit': 0.502,  'chain': 0.444,  'wardrum': 0.5};

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
