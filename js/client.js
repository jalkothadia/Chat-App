const socket = io('http://localhost:8000');

const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messageContainer = document.querySelector('.container');
let audioContext;

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

};

// Get username
const name1 = prompt("Enter your name:");

socket.emit('new-user-joined', name1);

// When another user joins
socket.on('user-joined', (name) => {

    append(`${name} Joined Chat`, 'center');

});

// Receive message from another user
socket.on('receive', (data) => {

    append(data.message, 'left', data.name);
    playNotificationSound();

});

// Send message
form.addEventListener('submit', (e) => {

    e.preventDefault();

    const message = messageInput.value.trim();

    if (!message) return;

    // Send message to server
    socket.emit('send', message);

    // Display your own message
    append(message, 'right', 'You');

    // Clear input
    messageInput.value = '';

});
