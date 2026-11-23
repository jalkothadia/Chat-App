const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messageContainer = document.querySelector('.container');
const nameModal = document.getElementById('name-modal');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
let audioContext;
let socket = null;
let socketLoaded = false;

const connectSocket = () => {
    if (!name1 || socketLoaded) return;
    socketLoaded = true;

    const socketProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const socketHostname = window.location.hostname || '127.0.0.1';
    const socketPort = window.location.protocol === 'file:' ? '8000' : (
        window.location.port && window.location.port !== '8000' ? '8000' : window.location.port
    );
    const socketHost = `${socketProtocol}//${socketHostname}${socketPort ? `:${socketPort}` : ''}`;
    const startSocket = () => {
        if (typeof io !== 'function') return;
        socket = io(socketHost);

        socket.on('connect', () => {
            socket.emit('new-user-joined', name1);
        });

        socket.on('user-joined', (name) => {
            append(`${name} Joined Chat`, 'center');
        });

        socket.on('receive', (data) => {
            append(data.message, 'left', data.name);
            playNotificationSound();
        });
    };

    if (typeof io === 'function') {
        startSocket();
        return;
    }

    const socketScript = document.createElement('script');
    socketScript.src = `${socketHost}/socket.io/socket.io.js`;
    socketScript.onload = startSocket;
    document.head.append(socketScript);
};

const unlockAudio = () => {
    if (!audioContext && 'AudioContext' in window) {
        audioContext = new AudioContext();
    }
};

const playNotificationSound = () => {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    [660, 880].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + index * 0.08;

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
    });
};

document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// Append message to chat
const append = (message, position, senderName) => {

    const messageElement = document.createElement('div');

    messageElement.classList.add('message');
    messageElement.classList.add(position);

    if (senderName) {
        const senderElement = document.createElement('span');
        senderElement.classList.add('message-sender');
        senderElement.textContent = senderName;
        messageElement.append(senderElement);

        const contentElement = document.createElement('span');
        contentElement.classList.add('message-content');
        contentElement.textContent = message;
        messageElement.append(contentElement);
    } else {
        messageElement.textContent = message;
    }

    messageContainer.append(messageElement);
    messageContainer.scrollTo({
        top: messageContainer.scrollHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });

};

let name1 = sessionStorage.getItem('chatDisplayName');

const joinChat = (name) => {
    name1 = name.trim();
    if (!name1) return;

    sessionStorage.setItem('chatDisplayName', name1);
    nameModal.classList.add('is-hidden');
    connectSocket();
    messageInput.focus();
};

if (name1) {
    joinChat(name1);
} else {
    nameModal.classList.remove('is-hidden');
    window.requestAnimationFrame(() => nameInput.focus());
}

nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    joinChat(nameInput.value);
});

// Send message
form.addEventListener('submit', (e) => {

    e.preventDefault();

    const message = messageInput.value.trim();

    if (!message) return;

    // Send message to server
    if (socket) socket.emit('send', message);

    // Display your own message
    append(message, 'right', 'You');

    // Clear input
    messageInput.value = '';

});
