// duello.js
// Client-side logic for Duello a Parole mode

const socket = io();

// DOM Elements
const setupContainer = document.getElementById('duello-setup-container');
const gameContainer = document.getElementById('duello-game-container');
const secretWordInput = document.getElementById('secret-word-input');
const hintInput = document.getElementById('hint-input');
const readyBtn = document.getElementById('ready-btn');
const setupMessage = document.getElementById('setup-message');
const ownGridContainer = document.getElementById('own-grid-container');
const opponentGridContainer = document.getElementById('opponent-grid-container');
const keyboardContainer = document.getElementById('duello-keyboard-container');
const opponentHintDisplay = document.getElementById('opponent-hint');
const duelloGameMessage = document.getElementById('duello-game-message');
const backToLobbySetupBtn = document.getElementById('back-to-lobby-setup-btn');
const backToLobbyGameBtn = document.getElementById('back-to-lobby-game-btn');

// Game State
let currentGuess = '';
let ownGrid = [];
let opponentGrid = [];
const WORD_LENGTH = 5;
let hintsEnabled = true;
let gameStarted = false;
let roomCode = '';

// Get room code from URL
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');
roomCode = urlParams.get('room');

// Initialize
if (mode === 'create') {
    socket.emit('createDuelloRoom', 'it');
} else if (mode === 'join' && roomCode) {
    socket.emit('joinDuelloRoom', roomCode);
    // Hide hints checkbox for guest
    const hintsCheckboxFn = document.getElementById('hints-enabled-checkbox');
    if (hintsCheckboxFn && hintsCheckboxFn.parentElement) {
        hintsCheckboxFn.parentElement.style.display = 'none';
    }
}

// ========== SETUP HANDLERS ==========

readyBtn.addEventListener('click', () => {
    const secretWord = secretWordInput.value.trim().toUpperCase();
    const hint = hintInput.value.trim();

    if (secretWord.length !== WORD_LENGTH) {
        setupMessage.textContent = 'La parola deve essere di 5 lettere!';
        setupMessage.style.color = '#ff6b6b';
        return;
    }

    // Capture hints preference (only if Host)
    const hintsCheckbox = document.getElementById('hints-enabled-checkbox');
    if (hintsCheckbox && mode === 'create') {
        hintsEnabled = hintsCheckbox.checked;
    }

    // Send hintsEnabled only if Host (server will handle room storage)
    socket.emit('setSecretWord', {
        word: secretWord,
        hint: hint,
        hintsEnabled: (mode === 'create' ? hintsEnabled : null)
    });
});

// ========== SOCKET EVENTS ==========

socket.on('duelloRoomCreated', (code) => {
    roomCode = code;
    setupMessage.textContent = `Stanza creata! Codice: ${code}`;
    setupMessage.style.color = '#51cf66';

    // Update URL
    window.history.replaceState({}, '', `duello.html?mode=create&room=${code}`);
});

socket.on('duelloRoomJoined', (code) => {
    roomCode = code;
    setupMessage.textContent = `Connesso alla stanza ${code}`;
    setupMessage.style.color = '#51cf66';
});

socket.on('duelloPlayerJoined', (data) => {
    setupMessage.textContent = data.message;
    setupMessage.style.color = '#51cf66';
});

socket.on('secretWordSet', (message) => {
    setupMessage.textContent = message;
    setupMessage.style.color = '#51cf66';

    // Disable inputs
    secretWordInput.disabled = true;
    hintInput.disabled = true;
    readyBtn.disabled = true;

    // Emit ready
    socket.emit('playerReady');
});

socket.on('waitingForOpponent', (message) => {
    setupMessage.textContent = message;
    setupMessage.style.color = '#ffd43b';
});

socket.on('duelloGameStart', (data) => {
    gameStarted = true;

    // Update hintsEnabled from server (Host's choice)
    if (typeof data.hintsEnabled !== 'undefined') {
        hintsEnabled = data.hintsEnabled;
    }

    // Hide setup, show game
    setupContainer.style.display = 'none';
    gameContainer.style.display = 'flex';

    // Display opponent hint
    opponentHintDisplay.textContent = data.opponentHint;

    // Initialize grids
    ownGridContainer.innerHTML = '';
    opponentGridContainer.innerHTML = '';
    generateGrid(ownGridContainer);
    generateGrid(opponentGridContainer);
    generateKeyboard();

    duelloGameMessage.textContent = 'Indovina la parola dell\'avversario!';
});

socket.on('duelloGuessResult', (data) => {
    ownGrid = data.ownGrid;

    let displayGrid = ownGrid;
    let displayFeedback = data.feedback;

    if (!hintsEnabled) {
        // Hard mode: Mask feedback unless it's a full win
        // Check if the current guess is the winning one
        const isWin = data.feedback.every(f => f === 'correct');

        if (!isWin) {
            displayGrid = ownGrid.map(att => {
                const attWin = att.feedback.every(f => f === 'correct');
                if (attWin) return att;
                return { word: att.word, feedback: att.feedback.map(() => 'neutral') };
            });
            displayFeedback = new Array(5).fill('neutral');
        }
    }

    updateGrid(ownGridContainer, displayGrid);
    updateKeyboardFeedback(data.word, displayFeedback);
    currentGuess = '';
    updateCurrentRow(ownGridContainer);
});

socket.on('opponentGuessUpdate', (data) => {
    opponentGrid = data.opponentGrid;
    updateGrid(opponentGridContainer, opponentGrid);
});

socket.on('duelloGameOver', (data) => {
    gameStarted = false;

    if (data.won) {
        duelloGameMessage.innerHTML = `<span style="color: #51cf66;">🎉 ${data.message}</span><br>La parola era: <strong>${data.secretWord}</strong>`;
    } else {
        duelloGameMessage.innerHTML = `<span style="color: #ff6b6b;">😔 ${data.message}</span><br>La tua parola era: <strong>${data.secretWord}</strong>`;
    }

    // Show rematch button
    createRematchButton();
});

socket.on('duelloRematchStart', (message) => {
    resetGameUI();
    setupMessage.textContent = message;
    setupMessage.style.color = '#51cf66';
});

socket.on('duelloRematchRequested', (message) => {
    duelloGameMessage.textContent = message;
});

socket.on('duelloError', (message) => {
    if (gameStarted) {
        duelloGameMessage.textContent = message;
        duelloGameMessage.style.color = '#ff6b6b';
    } else {
        setupMessage.textContent = message;
        setupMessage.style.color = '#ff6b6b';
    }
});

// ========== GRID FUNCTIONS ==========

function generateGrid(container) {
    container.innerHTML = '';
    // Start with 6 rows
    for (let i = 0; i < 6; i++) {
        addRow(container);
    }
}

function addRow(container) {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    for (let i = 0; i < WORD_LENGTH; i++) {
        const tile = document.createElement('div');
        tile.classList.add('box');
        row.appendChild(tile);
    }

    container.appendChild(row);
}

function updateGrid(container, gridData) {
    const rows = container.querySelectorAll('.grid-row');

    // Clear all rows first
    rows.forEach(row => {
        const tiles = row.querySelectorAll('.box');
        tiles.forEach(tile => {
            tile.textContent = '';
            tile.className = 'box';
        });
    });

    // Fill with data
    gridData.forEach((attempt, rowIndex) => {
        if (rowIndex < rows.length) {
            const tiles = rows[rowIndex].querySelectorAll('.box');
            attempt.word.split('').forEach((letter, colIndex) => {
                tiles[colIndex].textContent = letter;

                // Map feedback to standard classes
                let feedbackClass = '';
                if (attempt.feedback[colIndex] === 'correct') feedbackClass = 'correct-position';
                else if (attempt.feedback[colIndex] === 'present') feedbackClass = 'wrong-position';
                else if (attempt.feedback[colIndex] === 'absent') feedbackClass = 'not-in-word';

                if (feedbackClass) tiles[colIndex].classList.add(feedbackClass);
            });
        }
    });

    // Add more rows if needed
    while (container.querySelectorAll('.grid-row').length <= gridData.length) {
        addRow(container);
    }
}

function updateCurrentRow(container) {
    const rows = container.querySelectorAll('.grid-row');
    const currentRowIndex = ownGrid.length;

    // Reset current-row class
    rows.forEach(row => row.classList.remove('current-row'));

    if (currentRowIndex < rows.length) {
        const currentRow = rows[currentRowIndex];
        currentRow.classList.add('current-row');

        const tiles = currentRow.querySelectorAll('.box');
        const letters = currentGuess.split('');

        tiles.forEach((tile, index) => {
            tile.textContent = letters[index] || '';
            tile.className = 'box';
            // Standard game relies on content and .current-row for styling
        });
    }
}

// ========== KEYBOARD ==========

function generateKeyboard() {
    const rows = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
    ];

    keyboardContainer.innerHTML = '';

    rows.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('keyboard-row');

        row.forEach(key => {
            const keyBtn = document.createElement('div');
            keyBtn.classList.add('key');
            keyBtn.textContent = key;
            keyBtn.dataset.key = key;

            if (key === 'ENTER' || key === '⌫') {
                keyBtn.classList.add('wide-key');
            }

            keyBtn.addEventListener('click', () => handleKeyInput(key));
            rowDiv.appendChild(keyBtn);
        });

        keyboardContainer.appendChild(rowDiv);
    });
}

function updateKeyboardFeedback(word, feedback) {
    const letters = word.split('');

    letters.forEach((letter, index) => {
        const keyBtn = keyboardContainer.querySelector(`[data-key="${letter}"]`);
        if (keyBtn) {
            const currentClass = keyBtn.classList.contains('correct-position') ? 'correct-position' :
                keyBtn.classList.contains('wrong-position') ? 'wrong-position' :
                    keyBtn.classList.contains('not-in-word') ? 'not-in-word' : '';

            let newClass = '';
            if (feedback[index] === 'correct') newClass = 'correct-position';
            else if (feedback[index] === 'present') newClass = 'wrong-position';
            else if (feedback[index] === 'absent') newClass = 'not-in-word';

            // Priority: correct-position > wrong-position > not-in-word
            if (newClass === 'correct-position' ||
                (newClass === 'wrong-position' && currentClass !== 'correct-position') ||
                (newClass === 'not-in-word' && !currentClass)) {

                keyBtn.classList.remove('correct-position', 'wrong-position', 'not-in-word');
                if (newClass) keyBtn.classList.add(newClass);
            }
        }
    });
}

// ========== INPUT HANDLING ==========

function resetGameUI() {
    gameStarted = false;
    currentGuess = '';
    ownGrid = [];
    opponentGrid = [];

    // Clear DOM grids
    if (ownGridContainer) ownGridContainer.innerHTML = '';
    if (opponentGridContainer) opponentGridContainer.innerHTML = '';

    // Enable setup inputs
    if (secretWordInput) {
        secretWordInput.value = '';
        secretWordInput.disabled = false;
    }
    if (hintInput) {
        hintInput.value = '';
        hintInput.disabled = false;
    }
    if (readyBtn) readyBtn.disabled = false;

    // Reset UI visibility
    if (setupContainer) setupContainer.style.display = 'flex';
    if (gameContainer) gameContainer.style.display = 'none';
    if (duelloGameMessage) duelloGameMessage.textContent = '';

    // Remove rematch button if exists
    const existingRematchBtn = document.getElementById('duello-rematch-btn');
    if (existingRematchBtn) existingRematchBtn.remove();
}

function handleKeyInput(key) {
    if (!gameStarted) return;

    if (key === 'ENTER') {
        submitGuess();
    } else if (key === '⌫' || key === 'BACKSPACE') {
        currentGuess = currentGuess.slice(0, -1);
        updateCurrentRow(ownGridContainer);
    } else if (currentGuess.length < WORD_LENGTH) {
        const letter = key.toUpperCase();
        if (/^[A-Z]$/.test(letter)) {
            currentGuess += letter;
            updateCurrentRow(ownGridContainer);
        }
    }
}

document.addEventListener('keydown', (e) => {
    if (!gameStarted) return;

    if (e.key === 'Enter') {
        handleKeyInput('ENTER');
    } else if (e.key === 'Backspace') {
        handleKeyInput('⌫');
    } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKeyInput(e.key.toUpperCase());
    }
});

function submitGuess() {
    if (currentGuess.length !== WORD_LENGTH) {
        duelloGameMessage.textContent = 'La parola deve essere di 5 lettere!';
        duelloGameMessage.style.color = '#ff6b6b';
        return;
    }

    socket.emit('submitDuelloGuess', currentGuess);
}

// ========== REMATCH ==========

function createRematchButton() {
    const existingBtn = document.getElementById('duello-rematch-btn');
    if (existingBtn) return;

    const rematchBtn = document.createElement('button');
    rematchBtn.id = 'duello-rematch-btn';
    rematchBtn.className = 'primary-btn';
    rematchBtn.innerHTML = '<span class="btn-icon">🔄</span> Rivincita';
    rematchBtn.style.marginTop = '20px';

    rematchBtn.addEventListener('click', () => {
        socket.emit('duelloRematch');
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'In attesa...';
    });

    document.getElementById('duello-game-status').appendChild(rematchBtn);
}

// ========== BACK TO LOBBY ==========

backToLobbySetupBtn.addEventListener('click', () => {
    showGameModal(
        'Torna alla Lobby',
        'Sei sicuro di voler tornare alla lobby?',
        () => {
            window.location.href = 'index.html';
        }
    );
});

backToLobbyGameBtn.addEventListener('click', () => {
    showGameModal(
        'Torna alla Lobby',
        'Sei sicuro di voler abbandonare la partita?',
        () => {
            window.location.href = 'index.html';
        }
    );
});

// ========== MODAL FUNCTIONS ==========

function showGameModal(title, message, onConfirm) {
    const overlay = document.getElementById('game-modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    overlay.style.display = 'flex';

    confirmBtn.onclick = () => {
        overlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        overlay.style.display = 'none';
    };
}
