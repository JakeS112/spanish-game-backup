/**
 * ¡Béisbol Dominicano! – script.js
 * ============================================================
 * Arcade baseball game featuring Dominican MLB legends.
 *
 * Architecture:
 *  - GameState  : pure data object (mirrors what a C++ backend would own)
 *  - BattingEngine : probability/scoring logic (C++ equivalent in JS)
 *  - AudioEngine   : Web Audio API synth for walk-up music
 *  - Renderer      : Canvas drawing
 *  - UI            : Screen transitions, HUD updates
 *  - GameLoop      : requestAnimationFrame main loop
 * ============================================================
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   1. PLAYER DATA
   (In a C++ backend, this would be a struct array loaded
   from a CSV or binary file)
═══════════════════════════════════════════════════════════ */
const PLAYERS = [
  {
    id: 'ortiz',
    name: 'David Ortiz',
    nickname: 'Big Papi',
    emoji: '💪',
    power: 98,     // 0-100 rating
    contact: 88,
    genre: 'Merengue',
    musicKey: 'merengue',
    colorAccent: '#FF4500',
  },
  {
    id: 'pedro',
    name: 'Pedro Martínez',
    nickname: 'El Señor',
    emoji: '🔥',
    power: 72,
    contact: 93,
    genre: 'Bachata',
    musicKey: 'bachata',
    colorAccent: '#1565C0',
  },
  {
    id: 'soto',
    name: 'Juan Soto',
    nickname: 'El Niño',
    emoji: '🌟',
    power: 90,
    contact: 95,
    genre: 'Dembow',
    musicKey: 'dembow',
    colorAccent: '#FFD700',
  },
  {
    id: 'vlad',
    name: 'Vladimir Guerrero',
    nickname: 'Vladdy Sr.',
    emoji: '⚡',
    power: 97,
    contact: 90,
    genre: 'Merengue',
    musicKey: 'merengue',
    colorAccent: '#C62828',
  },
  {
    id: 'tatis',
    name: 'Fernando Tatis Jr.',
    nickname: 'El Niño',
    emoji: '🦁',
    power: 93,
    contact: 87,
    genre: 'Dembow',
    musicKey: 'dembow',
    colorAccent: '#7B1FA2',
  },
  {
    id: 'cano',
    name: 'Robinson Canó',
    nickname: 'Robbie',
    emoji: '🎯',
    power: 85,
    contact: 94,
    genre: 'Bachata',
    musicKey: 'bachata',
    colorAccent: '#00838F',
  },
  {
    id: 'manny',
    name: 'Manny Ramírez',
    nickname: 'Manny Being Manny',
    emoji: '🏆',
    power: 95,
    contact: 89,
    genre: 'Merengue',
    musicKey: 'merengue',
    colorAccent: '#E65100',
  },
  {
    id: 'pujols',
    name: 'Albert Pujols',
    nickname: 'La Máquina',
    emoji: '🤖',
    power: 99,
    contact: 96,
    genre: 'Bachata',
    musicKey: 'bachata',
    colorAccent: '#BF360C',
  },
  {
    id: 'reyes',
    name: 'José Reyes',
    nickname: 'El Caballo',
    emoji: '🐎',
    power: 75,
    contact: 91,
    genre: 'Dembow',
    musicKey: 'dembow',
    colorAccent: '#1B5E20',
  },
  {
    id: 'beltre',
    name: 'Adrián Béltre',
    nickname: 'El Loco',
    emoji: '🦸',
    power: 86,
    contact: 92,
    genre: 'Merengue',
    musicKey: 'merengue',
    colorAccent: '#4527A0',
  },
];

/* ═══════════════════════════════════════════════════════════
   2. GAME STATE
   (Equivalent to what a C++ game server would track)
═══════════════════════════════════════════════════════════ */
const GameState = {
  // Game flow
  screen: 'menu',    // menu | walkup | playing | paused | gameover
  inning: 1,
  maxInnings: 3,
  outs: 0,
  maxOuts: 3,
  balls: 0,
  strikes: 0,

  // Scoring
  score: 0,
  runsThisInning: 0,
  bases: [false, false, false], // 1st, 2nd, 3rd

  // Batter
  batterIndex: 0,    // cycles through PLAYERS
  currentBatter: null,

  // Pitch / animation state
  pitchActive: false,
  pitchX: 0,
  pitchY: 0,
  pitchVelX: 0,
  pitchVelY: 0,
  pitchSpeed: 4.5,
  hitZoneOpen: false,
  swingPressed: false,
  swingResult: null, // null | 'hr' | 'triple' | 'double' | 'single' | 'out' | 'ball' | 'strike'

  // Stats for game-over screen
  stats: { hr: 0, triple: 0, double: 0, single: 0, strikeouts: 0, walks: 0 },

  // Timing
  pitchDelay: 0,     // frames to wait before next pitch
  resultDisplayTime: 0,

  // Player ordering (shuffled each game)
  playerOrder: [],
};

/* ═══════════════════════════════════════════════════════════
   3. BATTING ENGINE  (C++ logic equivalent)
   ─────────────────────────────────────────────────────────
   In the companion game.cpp, these functions are implemented
   as pure deterministic C++ routines compiled to WebAssembly.
   Here we replicate the same math in JavaScript.

   The key function: evaluateSwing(player, timing)
   Returns an outcome string based on:
     - player.power, player.contact ratings
     - timing: how far the ball is from ideal hit zone (0.0=perfect)
   Probability weights mirror the C++ lookup table.
═══════════════════════════════════════════════════════════ */
const BattingEngine = {

  /**
   * Determine swing outcome.
   * @param {Object} player  - Player data with power/contact ratings
   * @param {number} timing  - 0.0 (perfect) to 1.0 (worst)
   * @returns {string}       - 'hr'|'triple'|'double'|'single'|'out'
   */
  evaluateSwing(player, timing) {
    // Normalized ratings (0–1)
    const pwr = player.power / 100;
    const con = player.contact / 100;

    // Base probabilities (must sum to 1.0)
    // These mirror the C++ lookup table in game.cpp
    let hrProb     = pwr * 0.22 * (1 - timing * 0.7);
    let tripleProb = pwr * 0.10 * (1 - timing * 0.5);
    let doubleProb = con * 0.20 * (1 - timing * 0.4);
    let singleProb = con * 0.30 * (1 - timing * 0.3);
    // Out probability fills the rest
    let outProb    = 1 - (hrProb + tripleProb + doubleProb + singleProb);

    // Poor timing penalty
    if (timing > 0.7) {
      outProb    += 0.30;
      hrProb     *= 0.1;
      tripleProb *= 0.1;
      doubleProb *= 0.3;
    }

    // Clamp negatives
    hrProb     = Math.max(0, hrProb);
    tripleProb = Math.max(0, tripleProb);
    doubleProb = Math.max(0, doubleProb);
    singleProb = Math.max(0, singleProb);
    outProb    = Math.max(0.05, outProb);

    // Normalize
    const total = hrProb + tripleProb + doubleProb + singleProb + outProb;
    const roll  = Math.random() * total;

    let cumulative = 0;
    if (roll < (cumulative += hrProb))     return 'hr';
    if (roll < (cumulative += tripleProb)) return 'triple';
    if (roll < (cumulative += doubleProb)) return 'double';
    if (roll < (cumulative += singleProb)) return 'single';
    return 'out';
  },

  /**
   * Calculate runs scored when a batter gets a hit.
   * Advances runners based on hit type.
   * @param {string} hitType - 'hr'|'triple'|'double'|'single'
   * @param {Array}  bases   - [1st, 2nd, 3rd] boolean array
   * @returns {Object} { runs, newBases }
   */
  advanceRunners(hitType, bases) {
    let runs = 0;
    let b1 = bases[0], b2 = bases[1], b3 = bases[2];
    let newBases = [false, false, false];

    if (hitType === 'hr') {
      // Everyone scores
      runs = 1 + (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0);
      newBases = [false, false, false];

    } else if (hitType === 'triple') {
      runs = (b2 ? 1 : 0) + (b3 ? 1 : 0) + (b1 ? 1 : 0);
      newBases = [false, false, true]; // batter on 3rd

    } else if (hitType === 'double') {
      runs = (b3 ? 1 : 0) + (b2 ? 1 : 0);
      newBases = [false, true, b1 ? true : false]; // runners advance 2

    } else if (hitType === 'single') {
      runs = (b3 ? 1 : 0);
      newBases = [true, b1, b2]; // advance 1 base
    }

    return { runs, newBases };
  },

  /**
   * Grade a player's final score.
   * Pure scoring function, mirrored exactly in game.cpp.
   * @param {number} score
   * @returns {string}
   */
  gradeScore(score) {
    if (score >= 25) return '⭐ LEYENDA ⭐';
    if (score >= 18) return '🔥 ALL-STAR';
    if (score >= 12) return '✅ JUGADOR SÓLIDO';
    if (score >= 6)  return '📈 PROMISORIO';
    return '💪 ¡Sigue Practicando!';
  },

  /**
   * Run scoring: point value per hit type.
   * (Referenced from game.cpp scoreForHit function)
   */
  scoreForHit(hitType, runs) {
    const base = { hr: 8, triple: 5, double: 3, single: 1, out: 0 };
    return (base[hitType] || 0) + runs * 2;
  }
};

/* ═══════════════════════════════════════════════════════════
   4. AUDIO ENGINE
   Web Audio API synthesizer for walk-up music snippets.
   Three Dominican genres: merengue, bachata, dembow.
═══════════════════════════════════════════════════════════ */
const AudioEngine = {
  ctx: null,
  masterGain: null,
  currentSource: null,
  initialized: false,

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch(e) {
      console.warn('Web Audio not available:', e);
    }
  },

  /**
   * Play a short synthesized walk-up snippet.
   * Each genre has a characteristic rhythm and melodic pattern.
   */
  playWalkup(musicKey, duration = 3.5) {
    if (!this.initialized) return;
    this.stop();

    const ctx = this.ctx;
    const t   = ctx.currentTime;

    if (musicKey === 'merengue')  this._playMerengue(t, duration);
    if (musicKey === 'bachata')   this._playBachata(t, duration);
    if (musicKey === 'dembow')    this._playDembow(t, duration);
  },

  /** Merengue: fast 2/4 time, bright and energetic */
  _playMerengue(t, dur) {
    const ctx = this.ctx;
    // Bright accordion-like lead (sawtooth)
    const notes = [523, 587, 659, 698, 784, 698, 659, 587]; // C5 scale
    const beatLen = 0.22;

    notes.forEach((freq, i) => {
      if (i * beatLen > dur) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * beatLen);
      gain.gain.linearRampToValueAtTime(0.3, t + i * beatLen + 0.02);
      gain.gain.linearRampToValueAtTime(0, t + i * beatLen + beatLen - 0.04);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(t + i * beatLen);
      osc.stop(t + i * beatLen + beatLen);
    });

    // Kick drum pattern (merengue = every beat)
    for (let beat = 0; beat < dur / 0.22; beat++) {
      this._kick(t + beat * 0.22, 0.4);
      if (beat % 2 === 1) this._snare(t + beat * 0.22 + 0.11, 0.25);
    }
  },

  /** Bachata: romantic, slower, guitar-like */
  _playBachata(t, dur) {
    const ctx = this.ctx;
    const notes = [392, 440, 494, 523, 494, 440, 392, 349];
    const beatLen = 0.30;

    notes.forEach((freq, i) => {
      if (i * beatLen > dur) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * beatLen);
      gain.gain.linearRampToValueAtTime(0.35, t + i * beatLen + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * beatLen + beatLen);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(t + i * beatLen);
      osc.stop(t + i * beatLen + beatLen + 0.1);
    });

    // Bachata: 1-2-3 tap on beat 4
    for (let beat = 0; beat < dur / 0.30; beat++) {
      this._kick(t + beat * 0.30, 0.3);
      if (beat % 4 === 3) this._bongo(t + beat * 0.30, 0.5); // tap
    }
  },

  /** Dembow: reggaeton-style, syncopated bass */
  _playDembow(t, dur) {
    const ctx = this.ctx;
    // Synth lead
    const notes = [220, 220, 261, 220, 196, 196, 220, 196];
    const beatLen = 0.25;

    notes.forEach((freq, i) => {
      if (i * beatLen > dur) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * beatLen);
      gain.gain.linearRampToValueAtTime(0, t + i * beatLen + beatLen * 0.7);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(t + i * beatLen);
      osc.stop(t + i * beatLen + beatLen);
    });

    // Dembow: kick + snare syncopated pattern
    const pattern = [1,0,0,1, 0,1,0,0]; // simplified dembow grid
    for (let step = 0; step < dur / (beatLen / 2); step++) {
      if (pattern[step % 8]) this._kick(t + step * (beatLen / 2), 0.5);
      if (step % 4 === 2)    this._snare(t + step * (beatLen / 2), 0.35);
    }
  },

  /** Synthesized kick drum */
  _kick(t, vol = 0.5) {
    const ctx = this.ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.2);
  },

  /** Synthesized snare */
  _snare(t, vol = 0.3) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src  = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 1800;
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    src.start(t); src.stop(t + 0.15);
  },

  /** Synthesized bongo hit */
  _bongo(t, vol = 0.3) {
    const ctx = this.ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.12);
  },

  /** Crowd cheer burst */
  playCrowdCheer(intensity = 1.0) {
    if (!this.initialized) return;
    const ctx = this.ctx;
    const t   = ctx.currentTime;
    // White noise burst shaped to a cheer
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src    = ctx.createBufferSource();
    const gain   = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 0.5;
    src.buffer = buf;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4 * intensity, t + 0.08);
    gain.gain.setValueAtTime(0.4 * intensity, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    src.start(t); src.stop(t + 0.85);
  },

  /** Swoosh sound for swing */
  playSwing() {
    if (!this.initialized) return;
    const ctx = this.ctx;
    const t   = ctx.currentTime;
    const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src    = ctx.createBufferSource();
    const gain   = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 3000;
    src.buffer = buf;
    gain.gain.value = 0.5;
    src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    src.start(t); src.stop(t + 0.2);
  },

  /** Crack of bat sound */
  playCrack() {
    if (!this.initialized) return;
    const ctx = this.ctx;
    const t   = ctx.currentTime;
    // Short attack transient + noise tail
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.07);
  },

  fadeOut(duration = 1.0) {
    if (!this.initialized || !this.masterGain) return;
    const ctx = this.ctx;
    const g   = this.masterGain.gain;
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + duration);
    setTimeout(() => {
      if (this.masterGain) {
        this.masterGain.gain.value = 0.35;
      }
    }, duration * 1000 + 100);
  },

  stop() {
    // Individual oscillators stop on their own schedule
  }
};

/* ═══════════════════════════════════════════════════════════
   5. RENDERER
   Draws the stadium, ball, batter, pitcher, and effects
   onto a 800×420 canvas.
═══════════════════════════════════════════════════════════ */
const Renderer = {
  canvas: null,
  ctx: null,

  // Ball trail for motion effect
  trail: [],

  // Hit particle system
  particles: [],

  // Batter swing angle (animated)
  swingAngle: 0,
  swingAnimating: false,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  },

  // ── MAIN DRAW ──
  draw(state) {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    c.clearRect(0, 0, W, H);

    this._drawSky(c, W, H);
    this._drawStadiumWalls(c, W, H);
    this._drawField(c, W, H);
    this._drawPitcher(c, W, H);
    this._drawBatter(c, W, H, state);
    this._drawHitZone(c, W, H, state);
    if (state.pitchActive) {
      this._updateTrail(state.pitchX, state.pitchY);
      this._drawBallTrail(c);
      this._drawBall(c, state.pitchX, state.pitchY);
    }
    this._drawParticles(c);
    this._updateParticles();
    this._updateSwingAnim(state);
  },

  _drawSky(c, W, H) {
    const grad = c.createLinearGradient(0, 0, 0, H * 0.35);
    grad.addColorStop(0, '#4a90d9');
    grad.addColorStop(1, '#87ceeb');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H * 0.35);

    // Clouds
    this._drawCloud(c, 100, 30, 0.8);
    this._drawCloud(c, 320, 20, 1.0);
    this._drawCloud(c, 600, 40, 0.7);
    this._drawCloud(c, 720, 18, 0.9);
  },

  _drawCloud(c, x, y, scale) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.arc(0, 0, 22, 0, Math.PI * 2);
    c.arc(25, -5, 18, 0, Math.PI * 2);
    c.arc(50, 2, 20, 0, Math.PI * 2);
    c.arc(30, 8, 16, 0, Math.PI * 2);
    c.arc(10, 10, 14, 0, Math.PI * 2);
    c.fill();
    c.restore();
  },

  _drawStadiumWalls(c, W, H) {
    // Green Monster-style wall at center/back
    const wallY = H * 0.28;
    c.fillStyle = '#1B5E20';
    c.fillRect(0, wallY, W, 28);

    // Dominican flag banner strips on wall
    c.fillStyle = '#D91023';
    c.fillRect(0, wallY, W * 0.5, 6);
    c.fillStyle = '#002D62';
    c.fillRect(W * 0.5, wallY, W * 0.5, 6);

    // White cross area (simplified DR flag center)
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(W * 0.47, wallY, W * 0.06, 6);

    // Scoreboard
    c.fillStyle = '#0d3d00';
    c.fillRect(W * 0.38, wallY - 38, W * 0.24, 38);
    c.fillStyle = 'rgba(255,215,0,0.9)';
    c.font = 'bold 13px Nunito, sans-serif';
    c.textAlign = 'center';
    c.fillText('BÉISBOL DOMINICANO', W * 0.5, wallY - 22);
    c.fillStyle = '#ff6666';
    c.font = '10px Nunito, sans-serif';
    c.fillText('🇩🇴  ESTADIO QUISQUEYA  🇩🇴', W * 0.5, wallY - 8);
  },

  _drawField(c, W, H) {
    // Outfield grass (darker/lighter stripes)
    const fieldTop = H * 0.35;
    for (let s = 0; s < 8; s++) {
      c.fillStyle = s % 2 === 0 ? '#2E7D32' : '#388E3C';
      c.fillRect(s * (W / 8), fieldTop, W / 8, H - fieldTop);
    }

    // Field layout constants — everything centered on W * 0.5
    const cx  = W * 0.50;  // horizontal center (home plate & pitcher)
    const homeY    = H * 0.88;
    const firstX   = cx + W * 0.14;  // 1st base (right)
    const firstY   = H * 0.70;
    const secondX  = cx;             // 2nd base (center, up)
    const secondY  = H * 0.55;
    const thirdX   = cx - W * 0.14;  // 3rd base (left)
    const thirdY   = H * 0.70;
    const moundX   = cx;
    const moundY   = H * 0.64;

    // Infield dirt — large ellipse centered on the diamond
    c.beginPath();
    c.ellipse(cx, H * 0.72, W * 0.18, H * 0.20, 0, 0, Math.PI * 2);
    c.fillStyle = '#C2855A';
    c.fill();

    // Pitcher's mound
    c.beginPath();
    c.ellipse(moundX, moundY, 24, 14, 0, 0, Math.PI * 2);
    c.fillStyle = '#c4a06e';
    c.fill();

    // Home plate area dirt
    c.beginPath();
    c.ellipse(cx, homeY, 22, 12, 0, 0, Math.PI * 2);
    c.fillStyle = '#c4a06e';
    c.fill();

    // Home plate (white pentagon)
    c.fillStyle = 'white';
    c.fillRect(cx - 7, homeY - 5, 14, 10);

    // Foul lines — from home plate to corners of outfield wall
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx, homeY);
    c.lineTo(0, H * 0.35);
    c.stroke();
    c.beginPath();
    c.moveTo(cx, homeY);
    c.lineTo(W, H * 0.35);
    c.stroke();

    // Base paths
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = 1.5;
    // Home → 1st
    c.beginPath(); c.moveTo(cx, homeY); c.lineTo(firstX, firstY); c.stroke();
    // 1st → 2nd
    c.beginPath(); c.moveTo(firstX, firstY); c.lineTo(secondX, secondY); c.stroke();
    // 2nd → 3rd
    c.beginPath(); c.moveTo(secondX, secondY); c.lineTo(thirdX, thirdY); c.stroke();
    // 3rd → Home
    c.beginPath(); c.moveTo(thirdX, thirdY); c.lineTo(cx, homeY); c.stroke();

    // Bases (small rotated squares)
    c.fillStyle = '#FFFFFF';
    // 1st base
    c.save(); c.translate(firstX, firstY); c.rotate(0.5);
    c.fillRect(-7, -7, 14, 14); c.restore();
    // 2nd base
    c.save(); c.translate(secondX, secondY); c.rotate(0.5);
    c.fillRect(-7, -7, 14, 14); c.restore();
    // 3rd base
    c.save(); c.translate(thirdX, thirdY); c.rotate(0.5);
    c.fillRect(-7, -7, 14, 14); c.restore();
  },

  _drawPitcher(c, W, H) {
    // Simple cartoon pitcher on the mound (centered)
    const px = W * 0.50;
    const py = H * 0.58;

    // Body
    c.fillStyle = '#002D62'; // blue uniform
    c.beginPath();
    c.ellipse(px, py, 12, 18, 0, 0, Math.PI * 2);
    c.fill();

    // Head
    c.fillStyle = '#f4c580'; // skin
    c.beginPath();
    c.arc(px, py - 22, 12, 0, Math.PI * 2);
    c.fill();

    // Cap
    c.fillStyle = '#002D62';
    c.beginPath();
    c.arc(px, py - 28, 10, Math.PI, 0);
    c.fill();
    c.fillRect(px - 12, py - 30, 24, 5);

    // Glove arm (raised)
    c.fillStyle = '#8B4513';
    c.beginPath();
    c.arc(px + 16, py - 10, 8, 0, Math.PI * 2);
    c.fill();
  },

 _drawBatter(c, W, H, state) {
    const bx = W * 0.435;
    const by = H * 0.73;
    const player = state.currentBatter;
    const accent = player ? player.colorAccent : '#002D62';

    // Legs
    c.fillStyle = '#CCCCCC';
    c.fillRect(bx - 10, by + 18, 8, 22);
    c.fillRect(bx + 2,  by + 18, 8, 22);

    // Body (uniform)
    c.fillStyle = accent;
    c.fillRect(bx - 14, by - 4, 28, 24);

    // Head
    c.fillStyle = '#f4c580';
    c.beginPath();
    c.arc(bx, by - 16, 14, 0, Math.PI * 2);
    c.fill();

    // Helmet
    c.fillStyle = '#111111';
    c.beginPath();
    c.arc(bx, by - 20, 13, Math.PI, 0);
    c.fill();
    c.fillRect(bx - 13, by - 22, 26, 6);
    // Helmet brim
    c.fillRect(bx + 8, by - 16, 12, 4);

    // Bat
    const swingAngle = this.swingAngle || 0;
    c.save();
    c.translate(bx + 10, by + 5);
    c.rotate(swingAngle);
    c.fillStyle = '#8B4513';
    c.fillRect(0, -3, 55, 6);
    c.fillStyle = '#5C2800';
    c.fillRect(50, -4, 8, 8);
    c.restore();

    // DR flag on jersey
    c.font = '10px sans-serif';
    c.fillText('🇩🇴', bx - 8, by + 8);
  },

  _drawHitZone(c, W, H, state) {
    if (!state.pitchActive || !state.hitZoneOpen) return;

    // Pulsing sweet spot zone near home plate
    const hzX = W * 0.50;
    const hzY = H * 0.72;
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 150);

    c.save();
    c.globalAlpha = 0.22 * pulse;
    c.fillStyle = '#FFD700';
    c.beginPath();
    c.ellipse(hzX, hzY, 28 * pulse, 16 * pulse, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#FFD700';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  },

  _drawBall(c, x, y) {
    // Ball with stitching
    c.fillStyle = 'white';
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#cc2200';
    c.lineWidth = 1.5;
    c.stroke();

    // Simple stitching lines
    c.strokeStyle = '#cc2200';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, 5, -0.5, 0.5);
    c.stroke();
    c.beginPath();
    c.arc(x, y, 5, Math.PI - 0.5, Math.PI + 0.5);
    c.stroke();
  },

  _updateTrail(x, y) {
    this.trail.push({ x, y, age: 0 });
    if (this.trail.length > 8) this.trail.shift();
    this.trail.forEach(p => p.age++);
  },

  _drawBallTrail(c) {
    this.trail.forEach((p, i) => {
      const alpha = (1 - p.age / 8) * 0.5;
      const size  = 9 * (1 - p.age / 10);
      c.globalAlpha = alpha;
      c.fillStyle = '#FFD700';
      c.beginPath();
      c.arc(p.x, p.y, Math.max(1, size), 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
  },

  // Spawn hit particles
  spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.04,
        color: color || '#FFD700',
        size: 3 + Math.random() * 5,
      });
    }
  },

  _updateParticles() {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.18; // gravity
      p.life -= p.decay;
    });
  },

  _drawParticles(c) {
    this.particles.forEach(p => {
      c.globalAlpha = p.life;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
  },

  // Animate bat swing
  startSwing() {
    this.swingAnimating = true;
    this.swingAngle = 0;
  },

  _updateSwingAnim(state) {
    if (!this.swingAnimating) {
      this.swingAngle = 0;
      return;
    }
    this.swingAngle += 0.25;
    if (this.swingAngle > Math.PI * 0.85) {
      this.swingAngle = 0;
      this.swingAnimating = false;
    }
  },

  clearTrail() {
    this.trail = [];
  }
};

/* ═══════════════════════════════════════════════════════════
   6. UI CONTROLLER
   Manages screen transitions and HUD updates.
═══════════════════════════════════════════════════════════ */
const UI = {
  screens: {},

  init() {
    this.screens = {
      menu:     document.getElementById('screen-menu'),
      howto:    document.getElementById('screen-howto'),
      game:     document.getElementById('screen-game'),
      walkup:   document.getElementById('screen-walkup'),
      gameover: document.getElementById('screen-gameover'),
    };
  },

  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    if (this.screens[name]) this.screens[name].classList.add('active');
  },

  updateHUD(state) {
    document.getElementById('hud-inning').textContent = state.inning;
    document.getElementById('hud-score').textContent  = state.score;

    // Out dots
    for (let i = 0; i < 3; i++) {
      const dot = document.getElementById(`out-${i}`);
      dot.classList.toggle('active', i < state.outs);
    }

    // Bases
    document.getElementById('base-1').classList.toggle('occupied', state.bases[0]);
    document.getElementById('base-2').classList.toggle('occupied', state.bases[1]);
    document.getElementById('base-3').classList.toggle('occupied', state.bases[2]);

    // Count
    for (let i = 0; i < 3; i++) {
      const pip = document.getElementById(`b${i}`);
      pip.classList.toggle('ball-on', i < state.balls);
    }
    for (let i = 0; i < 2; i++) {
      const pip = document.getElementById(`s${i}`);
      pip.classList.toggle('strike-on', i < state.strikes);
    }
  },

  updateBatterBar(player) {
    document.getElementById('batter-portrait').textContent = player.emoji;
    document.getElementById('batter-name').textContent     = player.name;
    document.getElementById('stat-power').textContent   = `PWR: ${player.power}`;
    document.getElementById('stat-contact').textContent = `CON: ${player.contact}`;
    document.getElementById('hit-result').textContent = '';
  },

  showHitResult(text, color) {
    const el = document.getElementById('hit-result');
    el.textContent = text;
    el.style.color = color;
  },

  showWalkup(player) {
    document.getElementById('walkup-portrait-big').textContent = player.emoji;
    document.getElementById('walkup-name').textContent         = player.name;
    document.getElementById('walkup-subtitle').textContent     = `"${player.nickname}" · ${player.genre}`;
    document.getElementById('walkup-genre').textContent        = `♪ ${player.genre} walk-up music`;
    document.getElementById('wup-pwr').style.width = `${player.power * 1.5}px`;
    document.getElementById('wup-con').style.width = `${player.contact * 1.5}px`;
    this.showScreen('walkup');
  },

  showGameOver(state) {
    const s = state.stats;
    document.getElementById('go-final-score').textContent = state.score;
    document.getElementById('go-breakdown').innerHTML =
      `<span>🔥 ${s.hr} HR</span>
       <span>⚡ ${s.triple} 3B</span>
       <span>💥 ${s.double} 2B</span>
       <span>✅ ${s.single} 1B</span>
       <span>❌ ${s.strikeouts} K</span>
       <span>🚶 ${s.walks} BB</span>`;
    document.getElementById('go-grade').textContent = BattingEngine.gradeScore(state.score);
    this.showScreen('gameover');
  },

  showHomeRunOverlay(playerName) {
    document.getElementById('hr-player-name').textContent = playerName;
    const overlay = document.getElementById('overlay-homerun');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 2800);
  },

  showHitAnnounce(text, color) {
    const el   = document.getElementById('hit-announce-text');
    const wrap = document.getElementById('overlay-hit');
    el.textContent = text;
    el.style.color = color;
    wrap.classList.remove('hidden');
    setTimeout(() => wrap.classList.add('hidden'), 1500);
  },

  showSwingPrompt(show) {
    const el = document.getElementById('swing-prompt');
    el.classList.toggle('hidden', !show);
  },

  crowdCheer() {
    const cl = document.getElementById('crowd-layer');
    cl.classList.add('crowd-cheer');
    setTimeout(() => cl.classList.remove('crowd-cheer'), 1200);
  }
};

/* ═══════════════════════════════════════════════════════════
   7. GAME LOOP & LOGIC
═══════════════════════════════════════════════════════════ */
const Game = {
  rafId: null,
  lastTime: 0,

  // Pitch path start/end for animation
  pitchStartX: 0,
  pitchStartY: 0,
  pitchEndX: 0,
  pitchEndY: 0,

  init() {
    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    UI.init();

    // Resize canvas to fit wrapper
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    this._setupButtons();
    this._setupSwingInput();

    UI.showScreen('menu');
  },

  _resizeCanvas() {
    const canvas = document.getElementById('game-canvas');
  
    canvas.width = 800;
    canvas.height = 420;
  
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
  },

  _setupButtons() {
    document.getElementById('btn-play').addEventListener('click', () => this.startGame());
    document.getElementById('btn-how').addEventListener('click', () => UI.showScreen('howto'));
    document.getElementById('btn-howto-back').addEventListener('click', () => UI.showScreen('menu'));
    document.getElementById('btn-restart').addEventListener('click', () => this.startGame());
    document.getElementById('btn-menu').addEventListener('click', () => { this._stopLoop(); UI.showScreen('menu'); });
  },

  _setupSwingInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        this._onSwing();
      }
    });
    // Touch / click on canvas area
    document.getElementById('stadium-wrapper').addEventListener('click', () => this._onSwing());
    document.getElementById('stadium-wrapper').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onSwing();
    }, { passive: false });
  },

  _onSwing() {
    if (GameState.screen !== 'playing') return;
    if (GameState.swingPressed) return;
    GameState.swingPressed = true;

    AudioEngine.init(); // unlock audio context on user gesture
    AudioEngine.playSwing();
    Renderer.startSwing();

    if (!GameState.pitchActive || !GameState.hitZoneOpen) {
      // Swung too early or too late — strike
      this._resolveSwing('miss');
      return;
    }

    // Calculate timing quality: how close is ball to sweet spot?
    const canvas   = document.getElementById('game-canvas');
    const W = canvas.width;
    const H = canvas.height;
    const sweetX   = W * 0.22;
    const sweetY   = H * 0.72;
    const dist     = Math.hypot(GameState.pitchX - sweetX, GameState.pitchY - sweetY);
    const maxDist  = 80;
    const timing   = Math.min(1.0, dist / maxDist); // 0 = perfect, 1 = bad

    // Let BattingEngine decide outcome
    const outcome = BattingEngine.evaluateSwing(GameState.currentBatter, timing);
    this._resolveSwing(outcome);
  },

  startGame() {
    AudioEngine.init();

    // Reset all state
    GameState.inning   = 1;
    GameState.outs     = 0;
    GameState.balls    = 0;
    GameState.strikes  = 0;
    GameState.score    = 0;
    GameState.bases    = [false, false, false];
    GameState.stats    = { hr: 0, triple: 0, double: 0, single: 0, strikeouts: 0, walks: 0 };
    GameState.pitchActive = false;
    GameState.swingPressed = false;
    GameState.pitchDelay   = 0;

    // Shuffle player order
    GameState.playerOrder = [...PLAYERS].sort(() => Math.random() - 0.5);
    GameState.batterIndex = 0;

    UI.showScreen('game');
    this._nextBatter();
    this._startLoop();
  },

  _nextBatter() {
    const player = GameState.playerOrder[GameState.batterIndex % GameState.playerOrder.length];
    GameState.batterIndex++;
    GameState.currentBatter = player;
    GameState.balls   = 0;
    GameState.strikes = 0;
    GameState.swingPressed = false;

    // Show walk-up intro
    UI.showWalkup(player);
    AudioEngine.playWalkup(player.musicKey, 3.0);
    GameState.screen = 'walkup';

    setTimeout(() => {
      AudioEngine.fadeOut(1.0);
      GameState.screen = 'playing';
      UI.showScreen('game');
      UI.updateBatterBar(player);
      UI.updateHUD(GameState);
      this._schedulePitch(80); // brief pause before first pitch
    }, 3200);
  },

  _schedulePitch(delayFrames) {
    GameState.pitchDelay  = delayFrames;
    GameState.pitchActive = false;
    GameState.swingPressed = false;
    GameState.hitZoneOpen  = false;
    UI.showSwingPrompt(false);
    Renderer.clearTrail();
  },

  _launchPitch() {
    const canvas = document.getElementById('game-canvas');
    const W = canvas.width;
    const H = canvas.height;

    // Pitcher position (mound)
    const startX = W * 0.50;
    const startY = H * 0.62;

    // Target: home plate area
    const endX   = W * 0.50;
    const endY   = H * 0.85;

    // Slight random wobble for pitch variation
    const wobbleX = (Math.random() - 0.5) * 30;
    const wobbleY = (Math.random() - 0.5) * 20;

    GameState.pitchX  = startX;
    GameState.pitchY  = startY;

    // Total frames to reach plate
    const frames = 55 + Math.random() * 20;
    GameState.pitchVelX = (endX + wobbleX - startX) / frames;
    GameState.pitchVelY = (endY + wobbleY - startY) / frames;

    GameState.pitchActive = true;
    GameState.hitZoneOpen = false;
    GameState.swingPressed = false;

    UI.showSwingPrompt(true);
  },

  _updatePitch() {
    if (!GameState.pitchActive) {
      if (GameState.pitchDelay > 0) {
        GameState.pitchDelay--;
        if (GameState.pitchDelay === 0) this._launchPitch();
      }
      return;
    }

    GameState.pitchX += GameState.pitchVelX;
    GameState.pitchY += GameState.pitchVelY;

    // Open hit zone when ball is ~50% through its path (Y-based)
    const canvas = document.getElementById('game-canvas');
    const W = canvas.width;
    const H = canvas.height;
    const progress = (GameState.pitchY - H * 0.62) / (H * 0.85 - H * 0.62);
    if (progress > 0.5) GameState.hitZoneOpen = true;

    // Ball past home plate = auto-result
    if (GameState.pitchY > canvas.height * 0.88) {
      if (!GameState.swingPressed) {
        // Didn't swing: ball or called strike
        const isBall = (Math.random() < 0.35); // 35% chance of ball
        if (isBall) {
          this._registerBall();
        } else {
          this._registerStrike('called');
        }
      }
      GameState.pitchActive = false;
      UI.showSwingPrompt(false);
    }
  },

  _resolveSwing(outcome) {
    GameState.pitchActive = false;
    GameState.hitZoneOpen = false;
    UI.showSwingPrompt(false);

    if (outcome === 'miss') {
      // Whiff
      this._registerStrike('swing');
      return;
    }

    if (outcome === 'out') {
      // Contact but out
      AudioEngine.playCrack();
      const colors = { out: '#aaaaaa' };
      Renderer.spawnParticles(GameState.pitchX, GameState.pitchY, 8, '#aaaaaa');
      UI.showHitAnnounce('OUT', '#aaaaaa');
      UI.showHitResult('OUT ❌', '#aaa');
      GameState.outs++;
      GameState.stats.strikeouts++;
      this._checkOutState();
      return;
    }

    // It's a hit!
    AudioEngine.playCrack();
    const { runs, newBases } = BattingEngine.advanceRunners(outcome, GameState.bases);
    GameState.bases = newBases;
    const points = BattingEngine.scoreForHit(outcome, runs);
    GameState.score += points;
    GameState.stats[outcome]++;

    const hitConfig = {
      hr:     { text: '🔥 JONRÓN!',   color: '#FF4400', particleColor: '#FF4400', particles: 40 },
      triple: { text: '⚡ TRIPLE!',   color: '#FF9900', particleColor: '#FF9900', particles: 25 },
      double: { text: '💥 DOBLE!',    color: '#FFD700', particleColor: '#FFD700', particles: 20 },
      single: { text: '✅ SENCILLO!', color: '#66FF66', particleColor: '#66FF66', particles: 12 },
    };
    const cfg = hitConfig[outcome];
    Renderer.spawnParticles(GameState.pitchX, GameState.pitchY, cfg.particles, cfg.particleColor);
    UI.showHitAnnounce(cfg.text, cfg.color);
    UI.showHitResult(cfg.text, cfg.color);
    UI.crowdCheer();
    AudioEngine.playCrowdCheer(outcome === 'hr' ? 1.0 : 0.6);

    if (outcome === 'hr') {
      UI.showHomeRunOverlay(GameState.currentBatter.name);
    }

    UI.updateHUD(GameState);

    // Next batter after short delay
    this._schedulePitch(120);
    setTimeout(() => this._nextBatter(), 1600);
  },

  _registerBall() {
    GameState.balls++;
    UI.showHitResult('BALL 🟢', '#66ff66');
    if (GameState.balls >= 4) {
      // Walk
      GameState.stats.walks++;
      // Advance runners: walk = single-like advance
      const { newBases } = BattingEngine.advanceRunners('single', GameState.bases);
      GameState.bases = newBases;
      UI.updateHUD(GameState);
      setTimeout(() => this._nextBatter(), 1000);
    } else {
      UI.updateHUD(GameState);
      this._schedulePitch(60);
    }
  },

  _registerStrike(type) {
    GameState.strikes++;
    UI.showHitResult(type === 'called' ? 'STRIKE ❌' : 'SWING! ❌', '#ff6666');
    if (GameState.strikes >= 3) {
      // Strikeout
      GameState.stats.strikeouts++;
      GameState.outs++;
      this._checkOutState();
    } else {
      UI.updateHUD(GameState);
      this._schedulePitch(55);
    }
  },

  _checkOutState() {
    UI.updateHUD(GameState);
    if (GameState.outs >= GameState.maxOuts) {
      // End of inning
      GameState.outs    = 0;
      GameState.balls   = 0;
      GameState.strikes = 0;
      GameState.bases   = [false, false, false];
      GameState.inning++;

      if (GameState.inning > GameState.maxInnings) {
        // Game over
        setTimeout(() => {
          GameState.screen = 'gameover';
          this._stopLoop();
          UI.showGameOver(GameState);
        }, 600);
      } else {
        // Next inning
        UI.updateHUD(GameState);
        setTimeout(() => this._nextBatter(), 800);
      }
    } else {
      // Next batter in same inning
      setTimeout(() => this._nextBatter(), 1000);
    }
  },

  _startLoop() {
    GameState.screen = 'playing';
    this._loop(0);
  },

  _stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  },

  _loop(timestamp) {
    this.rafId = requestAnimationFrame((t) => this._loop(t));

    if (GameState.screen !== 'playing') return;

    this._updatePitch();
    Renderer.draw(GameState);
  }
};

/* ═══════════════════════════════════════════════════════════
   8. BOOT
═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  Game.init();

  // Show audio unlock notice
  const notice = document.getElementById('audio-notice');
  notice.classList.remove('hidden');
  setTimeout(() => notice.classList.add('hidden'), 3500);

  // First click anywhere unlocks audio
  document.body.addEventListener('click', () => {
    AudioEngine.init();
  }, { once: true });
});

/*
 * ═══════════════════════════════════════════════════════════
 *  C++ BACKEND REFERENCE (game.cpp)
 *  ─────────────────────────────────────────────────────────
 *  The following logic in this file mirrors what is
 *  implemented in game.cpp as a WebAssembly module.
 *  Functions mapped:
 *
 *  JS: BattingEngine.evaluateSwing()  → C++: evaluateSwing(float power, float contact, float timing)
 *  JS: BattingEngine.advanceRunners() → C++: advanceRunners(HitType type, bool* bases)
 *  JS: BattingEngine.scoreForHit()    → C++: scoreForHit(HitType type, int runs)
 *  JS: BattingEngine.gradeScore()     → C++: gradeScore(int score)
 *
 *  To compile game.cpp with Emscripten:
 *    emcc game.cpp -o game.js \
 *         -s EXPORTED_FUNCTIONS='["_evaluateSwing","_advanceRunners","_scoreForHit","_gradeScore"]' \
 *         -s MODULARIZE=1 -O2
 *  Then import and call Module._evaluateSwing(pwr, con, timing) from script.js.
 * ═══════════════════════════════════════════════════════════
 */
