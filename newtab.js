class HereAndNow {
    constructor() {
        this.prompts = [];
        this.filteredPrompts = [];
        this.currentIndex = 0;
        this.timer = null;
        this.timeRemaining = 0;
        this.isRunning = false;
        this.backgroundColors = ['bg-amber', 'bg-teal', 'bg-gray', 'bg-blue', 'bg-green', 'bg-lavender'];
        this.currentColorIndex = 0;
        
        // Audio for navigation sound
        this.switchSound = null;
        this.loadSwitchSound();
        
        this.init();
    }

    async init() {
        await this.loadPrompts();
        this.setupEventListeners();
        this.displayCurrentPrompt();
        this.updateBackgroundColor();
    }

    loadSwitchSound() {
        console.log('Loading switch sound...');
        
        // Try external sound first
        this.switchSound = new Audio('https://cdn.pixabay.com/download/audio/2022/03/10/audio_d1718372db.mp3');
        this.switchSound.volume = 0.3;
        this.switchSound.preload = 'auto';
        
        this.switchSound.addEventListener('canplaythrough', () => {
            console.log('External sound loaded successfully');
        });
        
        this.switchSound.onerror = () => {
            console.log('External sound failed, creating fallback beep');
            this.createFallbackBeep();
        };
    }

    createFallbackBeep() {
        try {
            console.log('Creating fallback audio beep');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            this.switchSound = {
                play: () => {
                    try {
                        const oscillator = audioContext.createOscillator();
                        const gainNode = audioContext.createGain();
                        
                        oscillator.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        
                        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
                        
                        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                        
                        oscillator.start(audioContext.currentTime);
                        oscillator.stop(audioContext.currentTime + 0.2);
                        
                        console.log('Played fallback beep');
                    } catch (e) {
                        console.error('Fallback beep failed:', e);
                    }
                }
            };
        } catch (e) {
            console.error('Could not create audio context:', e);
            this.switchSound = null;
        }
    }

    playSwitch() {
        console.log('Playing switch sound...');
        if (this.switchSound) {
            try {
                if (typeof this.switchSound.play === 'function') {
                    this.switchSound.play();
                } else {
                    this.switchSound.currentTime = 0;
                    const playPromise = this.switchSound.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.error('Audio play failed:', error);
                        });
                    }
                }
            } catch (error) {
                console.error('Error playing sound:', error);
            }
        } else {
            console.log('No sound available');
        }
    }

    async loadPrompts() {
        try {
            console.log('Loading Here and Now prompts from Google Sheet...');
            const sheetId = '1S1H85HLtGZFVoxh13zDG_lvsDcDlC919CAhF9zP36ew';
            const gid = '1226884355'; // Keep this if it's your intended tab
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            console.log('Fetching URL:', url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            console.log('CSV response length:', csvText.length);
            
            const lines = csvText.split('\n').filter(line => line.trim());
            if (lines.length === 0) {
                throw new Error('Empty CSV file');
            }
            
            const headers = this.parseCSVLine(lines[0]);
            console.log('CSV Headers:', headers);
            
            this.prompts = [];
            const themes = new Set();
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const values = this.parseCSVLine(line);
                if (values.length >= 2) {
                    const theme = values[0].trim();
                    const prompt = values[1].trim();
                    
                    if (theme && prompt) {
                        this.prompts.push({ theme, prompt });
                        themes.add(theme);
                    }
                }
            }
            
            console.log(`Loaded ${this.prompts.length} Here and Now prompts`);
            
            // Populate theme selector
            const themeSelect = document.getElementById('themeSelect');
            themeSelect.innerHTML = '<option value="all">All Themes</option>';
            
            Array.from(themes).sort().forEach(theme => {
                const option = document.createElement('option');
                option.value = theme;
                option.textContent = theme;
                themeSelect.appendChild(option);
            });
            
            this.filteredPrompts = [...this.prompts];
            
            if (this.prompts.length === 0) {
                throw new Error('No valid prompts found in the CSV');
            }
            
        } catch (error) {
            console.error('Failed to load prompts:', error);
            this.prompts = [{
                theme: 'Error',
                prompt: 'Failed to load prompts. Please check your internet connection and try refreshing.'
            }];
            this.filteredPrompts = [...this.prompts];
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let quoteCount = 0;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                quoteCount++;
                inQuotes = quoteCount % 2 !== 0;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
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
        if (this.filteredPrompts.length === 0) return;
        
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
        if (this.filteredPrompts.length === 0) return;
        
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
        card.classList.add('flipping');
        
        setTimeout(() => {
            card.classList.remove('flipping');
        }, 300);
    }

    displayCurrentPrompt() {
        const promptText = document.getElementById('promptText');
        
        if (this.filteredPrompts.length === 0) {
            promptText.textContent = 'No prompts available for this theme.';
            return;
        }
        
        const currentPrompt = this.filteredPrompts[this.currentIndex];
        promptText.textContent = currentPrompt.prompt;
    }

    updateBackgroundColor() {
        const body = document.body;
        
        this.backgroundColors.forEach(color => body.classList.remove(color));
        
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
            this.resetTimerButton();
            this.startTimer();
        }
    }

    startTimer() {
        const timerSelect = document.getElementById('timerSelect');
        const button = document.getElementById('timerButton');
        const display = document.getElementById('timerDisplay');
        
        this.timeRemaining = parseInt(timerSelect.value);
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
        display.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HereAndNow();
});
