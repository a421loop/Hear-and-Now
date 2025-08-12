// newtab.js
// Use ES module so it's isolated. This file should be saved as newtab.js in the extension folder.

class PromptTimer {
  constructor() {
    this.prompts = [];
    this.filteredPrompts = [];
    this.currentIndex = 0;
    this.timer = null;
    this.timeRemaining = 0;
    this.isRunning = false;

    this.backgroundColors = ['bg-amber','bg-teal','bg-gray','bg-blue','bg-green','bg-lavender'];
    this.currentColorIndex = 0;

    // audio
    this.switchSound = null;
    this.audioContext = null; // for fallback beep that needs resume on gesture
    this.fallbackIsReady = false;

    this.init();
  }

  async init() {
    this.setupEventListeners();

    // prepare audio resources but do not rely on autoplay
    this.setupAudio();

    // load prompts from Google Sheet (published)
    await this.loadPrompts();

    // display
    this.filteredPrompts = [...this.prompts];
    this.displayCurrentPrompt();
    this.updateBackgroundColor();

    // Hide loading hint if prompts present
    const audioHint = document.getElementById('audioHint');
    if (audioHint) {
      audioHint.style.display = 'block'; // keeps the hint visible until user interacts
    }
  }

  setupAudio() {
    // Try to load local bundled audio (recommended)
    try {
      const url = chrome.runtime.getURL('sounds/switch.mp3');
      this.switchSound = new Audio(url);
      this.switchSound.preload = 'auto';
      this.switchSound.volume = 0.35;

      this.switchSound.addEventListener('canplaythrough', () => {
        console.log('Switch sound loaded from extension resources.');
      });
      this.switchSound.addEventListener('error', (e) => {
        console.warn('Extension audio failed to load, will use fallback beep.', e);
        this.createFallbackBeep();
      });
    } catch (e) {
      console.warn('Could not load extension audio, creating fallback beep.', e);
      this.createFallbackBeep();
    }
  }

  createFallbackBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      // create small silent node to initialize
      this.fallbackIsReady = true;
      console.log('Fallback beep ready (AudioContext created).');
    } catch (e) {
      console.error('AudioContext unavailable; no sound will play.', e);
      this.audioContext = null;
    }
  }

  // call this on first user gesture to unlock audio contexts if needed
  ensureAudioUnlocked() {
    const hint = document.getElementById('audioHint');
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        console.log('AudioContext resumed on user gesture.');
      }).catch((err) => {
        console.warn('Could not resume AudioContext:', err);
      });
    }

    if (this.switchSound && typeof this.switchSound.play === 'function') {
      // playing then immediately pausing to "unlock" audio for some browsers can help
      const p = this.switchSound.play();
      if (p && typeof p.then === 'function') {
        p.then(()=> {
          this.switchSound.pause();
          this.switchSound.currentTime = 0;
        }).catch(()=> {/* ignore */});
      }
    }

    // hide hint after user gesture
    if (hint) hint.style.display = 'none';
  }

  playSwitch() {
    // If switchSound is an Audio instance -> use it
    if (this.switchSound && typeof this.switchSound.play === 'function') {
      const playPromise = this.switchSound.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err) => {
          // autoplay restriction or other error -> fallback beep
          console.warn('Audio.play() rejected, using fallback beep.', err);
          this.playFallbackBeep();
        });
      }
      return;
    }

    // otherwise try fallback beep
    this.playFallbackBeep();
  }

  playFallbackBeep() {
    if (!this.audioContext) {
      console.warn('No audio available for fallback beep.');
      return;
    }

    try {
      const ctx = this.audioContext;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, ctx.currentTime);
      g.gain.setValueAtTime(0.35, ctx.currentTime);

      o.connect(g);
      g.connect(ctx.destination);

      o.start(ctx.currentTime);
      // quick chirp up
      o.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error('Fallback beep failed:', e);
    }
  }

  setupEventListeners() {
    document.getElementById('nextButton').addEventListener('click', (ev) => {
      this.ensureAudioUnlocked();
      this.nextPrompt();
    });

    document.getElementById('prevButton').addEventListener('click', (ev) => {
      this.ensureAudioUnlocked();
      this.prevPrompt();
    });

    document.getElementById('timerButton').addEventListener('click', (ev) => {
      this.ensureAudioUnlocked();
      this.handleTimerButton();
    });

    document.getElementById('themeSelect').addEventListener('change', (e) => {
      this.filterByTheme(e.target.value);
    });

    // global gesture to unlock audio contexts
    const unlock = () => {
      this.ensureAudioUnlocked();
      // remove after one gesture
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);

    // keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.nextPrompt();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevPrompt();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.handleTimerButton();
      }
    });
  }

  // IMPORTANT: your sheet must be Published to the web as CSV (see instructions below)
  async loadPrompts() {
    try {
      console.log('Loading prompts from Google Sheet...');

      // ---- EDIT THIS: replace with your published CSV URL ----
      // Recommended: publish the sheet to the web (File → Publish to web), then use:
      // https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/pub?output=csv
      // If you have multiple tabs, publish the tab you want and use that URL.
      const sheetId = '1S1H85HLtGZFVoxh13zDG_lvsDcDlC919CAhF9zP36ew'; // replace if different
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv`;

      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();

      // Parse CSV robustly (handles quoted fields with commas)
      const rows = this.parseCSV(text);
      if (!rows || rows.length === 0) throw new Error('CSV empty or invalid');

      // Assuming CSV columns: Theme, Prompt  (exact order)
      const headers = rows[0].map(h => String(h).trim());
      const themeIndex = headers.findIndex(h => /theme/i.test(h)) !== -1
        ? headers.findIndex(h => /theme/i.test(h))
        : 0;
      const promptIndex = headers.findIndex(h => /prompt/i.test(h)) !== -1
        ? headers.findIndex(h => /prompt/i.test(h))
        : 1;

      this.prompts = [];
      const themesSet = new Set();

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const theme = (r[themeIndex] || '').trim();
        const prompt = (r[promptIndex] || '').trim();
        if (prompt) {
          this.prompts.push({ theme: theme || 'Misc', prompt });
          themesSet.add(theme || 'Misc');
        }
      }

      if (this.prompts.length === 0) throw new Error('No prompts parsed from CSV');

      // populate theme dropdown
      const themeSelect = document.getElementById('themeSelect');
      themeSelect.innerHTML = ''; // clear
      const allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.textContent = 'All Themes';
      themeSelect.appendChild(allOpt);

      Array.from(themesSet).sort().forEach(t => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        themeSelect.appendChild(o);
      });

      console.log(`Loaded ${this.prompts.length} prompts across ${themesSet.size} themes.`);

    } catch (err) {
      console.error('Failed to load prompts:', err);
      // fallback single error prompt so UI stays usable
      this.prompts = [{
        theme: 'Error',
        prompt: 'Failed to load prompts. Make sure the Google Sheet is published to the web (CSV) and try again.'
      }];
      // populate theme selector with error
      const themeSelect = document.getElementById('themeSelect');
      themeSelect.innerHTML = '<option value="all">All Themes</option><option value="Error">Error</option>';
    }
  }

  // CSV parsing function that handles quoted fields and commas inside quotes
  parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r\n|\n|\r/);
    for (let line of lines) {
      // parse line using state machine
      const cols = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' ) {
          if (inQuotes && line[i+1] === '"') {
            // escaped quote
            cur += '"';
            i++; // skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cols.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur);
      // if whole line is empty (no columns) skip
      if (cols.length === 1 && cols[0] === '') {
        // skip
      } else {
        rows.push(cols);
      }
    }
    return rows;
  }

  filterByTheme(selectedTheme) {
    if (selectedTheme === 'all') {
      this.filteredPrompts = [...this.prompts];
    } else {
      this.filteredPrompts = this.prompts.filter(p => p.theme === selectedTheme);
    }
    this.currentIndex = 0;
    this.displayCurrentPrompt();
    this.updateBackgroundColor();
  }

  nextPrompt() {
    if (!this.filteredPrompts || this.filteredPrompts.length === 0) return;
    this.playSwitch();
    this.flipCard();
    setTimeout(() => {
      this.currentIndex = (this.currentIndex + 1) % this.filteredPrompts.length;
      this.displayCurrentPrompt();
      this.updateBackgroundColor();
    }, 140);

    if (this.isRunning) {
      this.stopTimer();
      this.resetTimerButton();
    }
  }

  prevPrompt() {
    if (!this.filteredPrompts || this.filteredPrompts.length === 0) return;
    this.playSwitch();
    this.flipCard();
    setTimeout(() => {
      this.currentIndex = (this.currentIndex === 0) ? this.filteredPrompts.length - 1 : this.currentIndex - 1;
      this.displayCurrentPrompt();
      this.updateBackgroundColor();
    }, 140);

    if (this.isRunning) {
      this.stopTimer();
      this.resetTimerButton();
    }
  }

  flipCard() {
    const card = document.getElementById('card');
    card.classList.add('flipping');
    setTimeout(()=> card.classList.remove('flipping'), 300);
  }

  displayCurrentPrompt() {
    const promptText = document.getElementById('promptText');
    if (!this.filteredPrompts || this.filteredPrompts.length === 0) {
      promptText.textContent = 'No prompts available for this theme.';
      return;
    }
    const cur = this.filteredPrompts[this.currentIndex];
    // allow HTML if desired in future; for now escape text
    promptText.textContent = cur.prompt;
  }

  updateBackgroundColor() {
    const body = document.body;
    this.backgroundColors.forEach(c => body.classList.remove(c));
    this.currentColorIndex = this.currentIndex % this.backgroundColors.length;
    body.classList.add(this.backgroundColors[this.currentColorIndex]);
  }

  handleTimerButton() {
    const button = document.getElementById('timerButton');

    if (!this.isRunning && this.timeRemaining === 0) {
      this.startTimer();
    } else if (this.isRunning) {
      // stop early and go to next prompt
      this.stopTimer();
      this.nextPrompt();
      this.resetTimerButton();
    } else {
      // not running but timeRemaining > 0 (paused or finished), start again
      this.resetTimerButton();
      this.startTimer();
    }
  }

  startTimer() {
    const timerSelect = document.getElementById('timerSelect');
    const button = document.getElementById('timerButton');
    const display = document.getElementById('timerDisplay');

    this.timeRemaining = parseInt(timerSelect.value, 10) || 30;
    this.isRunning = true;
    button.textContent = 'Next';
    display.classList.add('active');
    this.updateTimerDisplay();

    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        button.textContent = 'Start Again';
        // play switch sound to indicate done
        this.playSwitch();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    const display = document.getElementById('timerDisplay');
    display.classList.remove('active');
  }

  resetTimerButton() {
    const button = document.getElementById('timerButton');
    button.textContent = 'Start';
    this.timeRemaining = 0;
  }

  updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    display.textContent = `${minutes}:${String(seconds).padStart(2,'0')}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PromptTimer();
});
