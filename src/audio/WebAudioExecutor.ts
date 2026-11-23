/**
 * Роль: Исполнитель (Executor).
 * 100% процедурный Web Audio API движок:
 * - Раздельные каналы громкости (Master / Music / SFX / Mute)
 * - Адаптивный музыкальный секвенсор (темп и острота растут с уровнем и «змеиным бешенством»)
 * - Полный набор процедурных SFX на все игровые события
 * Не содержит внешних звуковых файлов и игровых решений.
 */

import type { IAudioExecutor } from '../core/contracts/actions.ts';
import type {
  AudioSettings,
  GameEvent,
  GamePhase,
  GameSnapshot,
} from '../core/contracts/messages.ts';
import { DEFAULT_USER_SETTINGS } from '../core/profiles/scoringProfile.ts';

// Частоты нот (D-минор / пентатоника синтвейв)
const BASS_PATTERN = [
  73.42, 0, 73.42, 0, 87.31, 0, 87.31, 0,
  98.0, 0, 98.0, 0, 65.41, 0, 82.41, 0,
];
const ARP_CALM = [
  293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 293.66, 329.63,
  392.0, 440.0, 587.33, 523.25, 440.0, 392.0, 329.63, 293.66,
];
const ARP_FRENZY = [
  293.66, 440.0, 587.33, 466.16, 587.33, 659.25, 587.33, 440.0,
  349.23, 523.25, 698.46, 659.25, 587.33, 466.16, 440.0, 329.63,
];

export class WebAudioExecutor implements IAudioExecutor {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private sfxGain: GainNode | null = null;

  private settings: AudioSettings = DEFAULT_USER_SETTINGS.audio;
  private phase: GamePhase = 'menu';
  private frenzyLevel = 0;
  private gameLevel = 1;

  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private unlocked = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();

      this.masterGain = this.ctx.createGain();
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 1800;

      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicFilter.connect(this.musicGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.syncGains();
      this.startSequencer();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.unlocked = true;
  }

  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    this.syncGains();
  }

  updateMusicContext(snapshot: GameSnapshot): void {
    this.phase = snapshot.phase;
    this.frenzyLevel = snapshot.frenzy.level;
    this.gameLevel = snapshot.levelStats.level;
    this.syncMusicFilter();
  }

  handleEvent(event: GameEvent): void {
    if (!this.unlocked || !this.ctx || !this.sfxGain || this.settings.muted) {
      return;
    }
    if (this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) {
      return;
    }

    switch (event.type) {
      case 'GOOD_APPLE_EATEN':
        this.playAppleSfx(event.combo);
        break;
      case 'BAD_APPLE_EATEN':
        this.playBadAppleSfx();
        break;
      case 'STONE_PUSHED':
        this.playStonePushSfx();
        break;
      case 'FRENZY_STARTED':
        this.playFrenzyStartSfx();
        break;
      case 'FRENZY_PEAK':
        this.playFrenzyPeakSfx();
        break;
      case 'FRENZY_CALMED':
        this.playCalmSfx();
        break;
      case 'SNAKE_SHRUNK':
        this.playShrinkSfx();
        break;
      case 'LIFE_GAINED':
        this.playOneUpSfx();
        break;
      case 'LIFE_LOST':
        this.playLifeLostSfx();
        break;
      case 'LEVEL_COMPLETED':
        this.playLevelCompleteSfx();
        break;
      case 'GAME_OVER':
        this.playGameOverSfx();
        break;
      case 'UI_CLICK':
        this.playClickSfx();
        break;
      default:
        break;
    }
  }

  private syncGains(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.025);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.42, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume * 0.72, now, 0.02);
  }

  private syncMusicFilter(): void {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    let cutoff = 1600;
    if (this.phase === 'menu') {
      cutoff = 900;
    } else if (this.phase === 'paused' || this.phase === 'life_lost') {
      cutoff = 520;
    } else if (this.phase === 'playing') {
      cutoff = 1700 + this.frenzyLevel * 2800;
    }
    this.musicFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
  }

  private startSequencer(): void {
    if (!this.ctx || this.schedulerTimer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.08;
    this.schedulerTimer = window.setInterval(() => {
      this.scheduleMusicSteps();
    }, 35);
  }

  private scheduleMusicSteps(): void {
    if (!this.ctx || !this.musicFilter) return;
    if (this.ctx.state !== 'running') return;
    if (this.settings.muted || this.settings.musicVolume <= 0 || this.settings.masterVolume <= 0) {
      this.nextStepTime = this.ctx.currentTime + 0.1;
      return;
    }

    const lookAheadSec = 0.14;
    while (this.nextStepTime < this.ctx.currentTime + lookAheadSec) {
      this.triggerMusicStep(this.stepIndex, this.nextStepTime);

      const baseBpm =
        this.phase === 'menu'
          ? 96
          : Math.min(134, 108 + (this.gameLevel - 1) * 2.5);
      const bpm =
        this.phase === 'playing'
          ? baseBpm + this.frenzyLevel * 32
          : baseBpm;
      const sixteenthSec = 60 / bpm / 4;

      this.nextStepTime += sixteenthSec;
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
  }

  private triggerMusicStep(step: number, time: number): void {
    if (!this.ctx || !this.musicFilter) return;
    const isPlaying = this.phase === 'playing';
    const isMenu = this.phase === 'menu';

    // Бас
    const bassFreq = BASS_PATTERN[step] ?? 0;
    if (bassFreq > 0 && (isPlaying || isMenu)) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isPlaying && this.frenzyLevel > 0.35 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(bassFreq, time);

      const amp = isPlaying ? 0.24 : 0.12;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(amp, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      osc.connect(gain);
      gain.connect(this.musicFilter);
      osc.start(time);
      osc.stop(time + 0.24);
    }

    // Арпеджио-мелодия
    const arpTable = this.frenzyLevel > 0.45 ? ARP_FRENZY : ARP_CALM;
    const arpFreq = arpTable[step] ?? 0;
    const playArp = isPlaying ? step % 2 === 0 || this.frenzyLevel > 0.3 : step % 4 === 0;
    if (arpFreq > 0 && playArp && (isPlaying || isMenu)) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = this.frenzyLevel > 0.55 ? 'square' : 'sine';
      osc.frequency.setValueAtTime(arpFreq, time);

      const amp = isPlaying ? 0.11 : 0.065;
      const dur = isPlaying ? 0.14 : 0.28;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(amp, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      osc.connect(gain);
      gain.connect(this.musicFilter);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    // Лёгкий ритмический пульс во время игры
    if (isPlaying && step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125 + this.frenzyLevel * 25, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

      gain.gain.setValueAtTime(0.18 + this.frenzyLevel * 0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);

      osc.connect(gain);
      gain.connect(this.musicFilter);
      osc.start(time);
      osc.stop(time + 0.1);
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + durationSec);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + durationSec + 0.02);
  }

  private playAppleSfx(combo: number): void {
    const semitoneBoost = Math.pow(2, Math.min(8, combo) / 12);
    const base = 460 * semitoneBoost;
    this.playTone(base, base * 1.45, 0.11, 'sine', 0.34);
    this.playTone(base * 1.5, base * 2, 0.1, 'triangle', 0.2, 0.045);
  }

  private playBadAppleSfx(): void {
    this.playTone(260, 95, 0.22, 'sawtooth', 0.28);
    this.playTone(190, 75, 0.2, 'square', 0.16, 0.04);
  }

  private playStonePushSfx(): void {
    this.playTone(140, 48, 0.18, 'triangle', 0.45);
    this.playTone(340, 520, 0.14, 'sine', 0.22, 0.05);
  }

  private playFrenzyStartSfx(): void {
    this.playTone(220, 440, 0.26, 'sawtooth', 0.18);
  }

  private playFrenzyPeakSfx(): void {
    this.playTone(520, 660, 0.12, 'square', 0.22);
    this.playTone(660, 880, 0.15, 'square', 0.24, 0.11);
  }

  private playCalmSfx(): void {
    this.playTone(660, 523.25, 0.18, 'sine', 0.2);
    this.playTone(523.25, 392, 0.22, 'sine', 0.16, 0.08);
  }

  private playOneUpSfx(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, n, 0.13, 'triangle', 0.32, i * 0.075);
    });
  }

  private playShrinkSfx(): void {
    this.playTone(420, 210, 0.22, 'triangle', 0.24);
    this.playTone(280, 145, 0.18, 'sine', 0.16, 0.06);
  }

  private playLifeLostSfx(): void {
    // 1. Мультяшный прыжок-испуг
    this.playTone(240, 560, 0.14, 'triangle', 0.28, 0);
    // 2. Плюх на спину
    this.playTone(210, 62, 0.26, 'sawtooth', 0.3, 0.22);
    // 3. Эфирный перелив улетающей души
    const soulNotes = [659.25, 783.99, 987.77, 1318.51];
    soulNotes.forEach((n, idx) => {
      this.playTone(n, n * 1.03, 0.28, 'sine', 0.15, 0.68 + idx * 0.16);
    });
  }

  private playLevelCompleteSfx(): void {
    const fanfare = [440, 554.37, 659.25, 880];
    fanfare.forEach((n, i) => {
      this.playTone(n, n, i === 3 ? 0.32 : 0.14, 'triangle', 0.3, i * 0.09);
    });
  }

  private playGameOverSfx(): void {
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((n, i) => {
      this.playTone(n, n * 0.96, 0.26, 'sawtooth', 0.22, i * 0.16);
    });
  }

  private playClickSfx(): void {
    this.playTone(640, 820, 0.045, 'sine', 0.16);
  }

  dispose(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
