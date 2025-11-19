class ListeningPrompts{
    constructor() {
        this.prompts = [];
        this.filteredPrompts = [];
        this.currentIndex = 0;
        this.promptOrder = [];
        this.timer = null;
        this.timeRemaining = 0;
        this.isRunning = false;
        this.backgroundColors = ['bg-blue1', 'bg-blue2', 'bg-yellow', 'bg-darkblue', 'bg-orange'];
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
            console.log('Loading listening prompts from Google Sheet...');
            const sheetId = '1S1H85HLtGZFVoxh13zDG_lvsDcDlC919CAhF9zP36ew';
            const gid = '1226884355'; // Specific sheet tab from your URL
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            console.log('Fetching URL:', url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const csvText = await response.text();
            console.log('CSV response length:', csvText.length);
            console.log('First 500 chars:', csvText.substring(0, 500));

            const lines = csvText.split('\n').filter(line => line.trim());
            if (lines.length === 0) {
                throw new Error('Empty CSV file');
            }

            const headers = this.parseCSVLine(lines[0]);
            console.log('CSV Headers:', headers); // Debug log

            this.prompts = [];
            const themes = new Set();

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = this.parseCSVLine(line);
                console.log(`Row ${i}:`, values); // Debug each row

                if (values.length >= 2) {
                    const theme = values[0].trim();
                    const prompt = values[1].trim();

                    if (theme && prompt) {
                        this.prompts.push({ theme, prompt });
                        themes.add(theme);
                        console.log(`Added listening prompt: ${theme} - ${prompt.substring(0, 50)}...`);
                    }
                }
            }

            console.log(`Loaded ${this.prompts.length} listening prompts`);
            console.log('Themes found:', Array.from(themes));

            // Populate theme selector
            const themeSelect = document.getElementById('themeSelect');
            themeSelect.innerHTML = '<option value="all">All Themes</option>'; // Clear existing options

            Array.from(themes).sort().forEach(theme => {
                const option = document.createElement('option');
                option.value = theme;
                option.textContent = theme;
                themeSelect.appendChild(option);
                console.log(`Added theme option: ${theme}`);
            });

            
            
            this.promptOrder = this.shuffle([...this.prompts]);
            this.filteredPrompts = this.promptOrder;
            this.currentIndex = 0;
            if (this.prompts.length === 0) {
                throw new Error('No valid listening prompts found in the CSV');
            }

        } catch (error) {
            console.error('Failed to load listening prompts:', error);
            this.prompts = [{
                theme: 'Error',
                prompt: 'Failed to load listening prompts. Please check your internet connection and try refreshing the page.'
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
                // Don't add the quote character to the result
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
    shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
    setupEventListeners() {
        document.getElementById('nextButton').addEventListener('click', () => this.nextPrompt());
        document.getElementById('prevButton').addEventListener('click', () => this.prevPrompt());
        document.getElementById('timerButton').addEventListener('click', () => this.handleTimerButton());
        document.getElementById('themeSelect').addEventListener('change', (e) => this.filterByTheme(e.target.value));

        // Keyboard navigation
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

        // Reset timer if running
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

        // Reset timer if running
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
            promptText.textContent = 'No listening prompts available for this theme.';
            return;
        }

        const currentPrompt = this.filteredPrompts[this.currentIndex];
        promptText.textContent = currentPrompt.prompt;
    }

    updateBackgroundColor() {
        const body = document.body;

        // Remove all background classes
        this.backgroundColors.forEach(color => body.classList.remove(color));

        // Add current background class
        this.currentColorIndex = this.currentIndex % this.backgroundColors.length;
        body.classList.add(this.backgroundColors[this.currentColorIndex]);
    }

    handleTimerButton() {
        const button = document.getElementById('timerButton');

        if (!this.isRunning && this.timeRemaining === 0) {
            // Start timer
            this.startTimer();
        } else if (this.isRunning) {
            // Stop and go to next prompt
            this.stopTimer();
            this.resetTimerButton();
        } else {
            // Timer finished, start again
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

    createBackgroundDots() {
        // No background dots needed for card design
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ListeningPrompts();
});
