// APP NAME - change this to rename the app anywhere in the UI
const APP_NAME = "Here and Now";

class ListeningPrompts {
  constructor() {
    this.prompts = [];
    this.filteredPrompts = [];
    this.currentIndex = 0;
    this.timer = null;
    this.timeRemaining = 0;
    this.isRunning = false;
    this.backgroundColors = ['bg-amber','bg-teal','bg-gray','bg-blue','bg-green','bg-lavender'];
    this.currentColorIndex = 0;

    // audio (may be replaced by fallback oscillator if needed)
    this.switchSound = null;
    this.loadSwitchSound();

    this.init();
  }

  async init() {
    document.title = APP_NAME;
    await this.loadPrompts();
    this.setupEventListeners();
    this.displayCurrentPrompt();
    this.updateBackgroundColor();
  }

  loadSwitchSound() {
    // Try an external short mp3; if it fails, create a small oscillator beep fallback
    try {
      this.switchSound = new Audio('https://cdn.pixabay.com/download/audio/2022/03/10/audio_d1718372db.mp3');
      this.switchSound.volume = 0.35;
      this.switchSound.preload = 'auto';
      // if audio cant be played due to autoplay policies, fallback will still work when called after a user gesture
      this.switchSound.addEventListener('error', () => {
        this.createFallbackBeep();
      });
    } catch (e) {
      this.createFallbackBeep();
    }
  }

  createFallbackBeep() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.switchSound = {
        play: () => {
          try {
            const now = audioContext.currentTime;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.18);
          } catch (err) {
            console.error('fallback beep play failed', err);
          }
        }
      };
    } catch (err) {
      console.error('cannot create audio context fallback', err);
      this.switchSound = null;
    }
  }

  playSwitch() {
    if (!this.switchSound) return;
    try {
      // If it's an Audio element
      if (this.switchSound instanceof HTMLAudioElement || (this.switchSound && typeof this.switchSound.play === 'function')) {
        const p = this.switchSound.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore autoplay rejection until user interacts */ });
      } else if (typeof this.switchSound.play === 'function') {
        // fallback object with play method
        this.switchSound.play();
      }
    } catch (e) {
      console.error('playSwitch error', e);
    }
  }

  async loadPrompts() {
    try {
      // ======= EDIT THESE 2 VALUES TO POINT AT YOUR SHEET =======
      const sheetId = '1S1H85HLtGZFVoxh13zDG_lvsDcDlC919CAhF9zP36ew'; // <- replace with your sheet id
      const gid = '1226884355'; // <- replace with the sheet tab gid you want
      // ==========================================================
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
      const csvText = await res.text();

      // split lines but keep quoted commas intact using a simple CSV parse per line
      const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length === 0) throw new Error('Empty CSV');

      const headers = this.parseCSVLine(lines[0]); // not strictly required, but handy
      this.prompts = [];
      const themes = new Set();

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row.trim()) continue;
        const cols = this.parseCSVLine(row);
        if (cols.length >= 2) {
          const theme = cols[0].trim();
          const prompt = cols[1].trim();
          if (theme && prompt) {
            this.prompts.push({ theme, prompt });
            themes.add(theme);
          }
        }
      }

      // populate theme select
      const themeSelect = document.getElementById('themeSelect');
      themeSelect.innerHTML = '<option value="all">All Themes</option>';
      Array.from(themes).sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        themeSelect.appendChild(opt);
      });

      this.filteredPrompts = this.prompts.slice();
      if (this.prompts.length === 0) throw new Error('No prompts parsed');
    } catch (err) {
      console.error('loadPrompts error', err);
      this.prompts = [{ theme: 'Error', prompt: 'Failed to load prompts. Check sheet id/gid or network.' }];
      this.filteredPrompts = this.prompts.slice();
      // keep themeSelect minimal
      const themeSelect = document.getElementById('themeSelect');
      if (themeSelect) themeSelect.innerHTML = '<option value="all">All Themes</option>';
    }
  }

  // simple CSV parser for a single line that handles quoted fields
  parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // if next char is also quote -> literal quote
        if (inQuotes && line[i+1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  setupEventListeners() {
    document.getElementById('nextButton').addEventListener('click', () => this.nextPrompt());
    document.getElementById('prevButton').addEventListener('click', () => this.prevPrompt());
    document.getElementById('timerButton').addEventListener('click', () => this.handleTimerButton());
    document.getElementById('themeSelect').addEventListener('change', (e) => this.filterByTheme(e.target.value));

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

  filterByTheme(selectedTheme) {
    if (selectedTheme === 'all') this.filteredPrompts = this.prompts.slice();
    else this.filteredPrompts = this.prompts.filter(p => p.theme === selectedTheme);
    this.currentIndex = 0;
    this.displayCurrentPrompt();
    this.updateBackgroundColor();
  }

  nextPrompt() {
    if (!this.filteredPrompts.length) return;
    this.playSwitch();
    this.flipCard();
    setTimeout(() => {
      this.currentIndex = (this.currentIndex + 1) % this.filteredPrompts.length;
      this.displayCurrentPrompt();
      this.updateBackgroundColor();
    }, 150);
    if (this.isRunning) {
      this.stopTimer();
      this.resetTimerButton();
    }
  }

  prevPrompt() {
    if (!this.filteredPrompts.length) return;
    this.playSwitch();
    this.flipCard();
    setTimeout(() => {
      this.currentIndex = this.currentIndex === 0 ? this.filteredPrompts.length - 1 : this.currentIndex - 1;
      this.displayCurrentPrompt();
      this.updateBackgroundColor();
    }, 150);
    if (this.isRunning) {
      this.stopTimer();
      this.resetTimerButton();
    }
  }

  flipCard() {
    const card = document.getElementById('card');
    if (!card) return;
    card.classList.add('flipping');
    setTimeout(() => card.classList.remove('flipping'), 300);
  }

  displayCurrentPrompt() {
    const promptText = document.getElementById('promptText');
    if (!promptText) return;
    if (!this.filteredPrompts.length) {
      promptText.textContent = 'No prompts available for this theme.';
      return;
    }
    const cur = this.filteredPrompts[this.currentIndex];
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
      this.stopTimer();
      this.nextPrompt();
      this.resetTimerButton();
    } else {
      // timeRemaining > 0 but not running (finished); restart
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
        // play a longer tone to show timer end (reuse switchSound if available)
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
    if (display) display.classList.remove('active');
  }

  resetTimerButton() {
    const button = document.getElementById('timerButton');
    if (button) button.textContent = 'Start';
    this.timeRemaining = 0;
  }

  updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    if (!display) return;
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    display.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}

// initialize once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ListeningPrompts();
});
