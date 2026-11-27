const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messageContainer = document.querySelector('.container');
const accountModal = document.getElementById('name-modal');
const accountForm = document.getElementById('account-form');
const nameField = document.getElementById('display-name-field');
const nameInput = document.getElementById('name-input');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const accountTitle = document.getElementById('name-title');
const accountSubmit = document.getElementById('account-submit');
const modeToggle = document.getElementById('mode-toggle');
const accountError = document.getElementById('account-error');
const chatError = document.getElementById('chat-error');
const accountLabel = document.getElementById('account-label');
const logoutButton = document.getElementById('logout-button');
const refreshUsersButton = document.getElementById('refresh-users');
const userList = document.getElementById('user-list');
const conversationTitle = document.getElementById('conversation-title');
let audioContext;
let socket = null;
let socketLoaded = false;
let isRegisterMode = true;
let token = sessionStorage.getItem('chatToken');
let currentUser = null;
let currentRecipientEmail = null;

const serverBase = () => {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || '127.0.0.1';
    return `${protocol}//${hostname}:8000`;
};

const apiRequest = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${serverBase()}${path}`, { ...options, headers });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
};

const showAccountError = (message) => {
    accountError.textContent = message;
};

const showChatError = (message) => {
    chatError.textContent = message;
};

const setAccountMode = (register) => {
    isRegisterMode = register;
    nameField.hidden = !register;
    nameInput.required = register;
    accountTitle.textContent = register ? 'Create your account' : 'Sign in';
    accountSubmit.textContent = register ? 'Create account' : 'Sign in';
    modeToggle.textContent = register
        ? 'Already have an account? Sign in'
        : 'New to ChatSpace? Create an account';
    passwordInput.autocomplete = register ? 'new-password' : 'current-password';
    showAccountError('');
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

const append = (message, position, senderName) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', position);

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

const clearConversation = () => {
    messageContainer.replaceChildren();
};

const loadConversation = async (email) => {
    currentRecipientEmail = email;
    clearConversation();
    showChatError('');
    messageInput.disabled = !email;
    messageInput.placeholder = email ? 'Write a message...' : 'Select a user to start chatting';
    const selectedUser = Array.from(userList.querySelectorAll('.user-option'))
        .find((button) => button.dataset.email === email);
    userList.querySelectorAll('.user-option').forEach((button) => {
        button.setAttribute('aria-pressed', String(button === selectedUser));
    });
    conversationTitle.textContent = selectedUser
        ? selectedUser.querySelector('.user-option-name').textContent
        : 'Select a person to start chatting';
    if (!email) return;

    try {
        const messages = await apiRequest(`/api/messages?with=${encodeURIComponent(email)}`);
        if (currentRecipientEmail !== email) return;
        messages.forEach((message) => {
            const isOwnMessage = message.senderEmail.toLowerCase() === currentUser.email.toLowerCase();
            append(message.message, isOwnMessage ? 'right' : 'left', isOwnMessage ? 'You' : message.senderName);
        });
    } catch (error) {
        showChatError(error.message);
    }
};

const connectSocket = () => {
    if (socketLoaded) return;
    socketLoaded = true;

    const startSocket = () => {
        if (typeof io !== 'function') {
            socketLoaded = false;
            showChatError('Realtime chat could not be loaded. Refresh and try again.');
            return;
        }
        socket = io(serverBase(), { auth: { token } });
        socket.on('connect_error', (error) => {
            showChatError(error.message || 'Could not connect to chat. Check that the chat server is running.');
        });
        socket.on('connect', () => showChatError(''));
        socket.on('receive', (data) => {
            if (currentRecipientEmail === data.senderEmail) {
                append(data.message, 'left', data.senderName);
                playNotificationSound();
            } else {
                showChatError(`New message from ${data.senderName}. Select them to view it.`);
                playNotificationSound();
            }
        });
    };

    if (typeof io === 'function') {
        startSocket();
        return;
    }

    const socketScript = document.createElement('script');
    socketScript.src = `${serverBase()}/socket.io/socket.io.js`;
    socketScript.onload = startSocket;
    socketScript.onerror = () => {
        socketLoaded = false;
        showChatError('Realtime chat could not be loaded. Check that the chat server is running.');
    };
    document.head.append(socketScript);
};

const signOut = () => {
    if (socket) socket.disconnect();
    socket = null;
    socketLoaded = false;
    token = null;
    currentUser = null;
    sessionStorage.removeItem('chatToken');
    sessionStorage.removeItem('chatUser');
    accountLabel.textContent = '';
    userList.replaceChildren();
    currentRecipientEmail = null;
    conversationTitle.textContent = 'Select a person to start chatting';
    messageInput.disabled = true;
    clearConversation();
    accountModal.classList.remove('is-hidden');
    setAccountMode(true);
    showChatError('');
};

const refreshUserList = async () => {
    const users = await apiRequest('/api/users');
    userList.replaceChildren();
    if (!users.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'user-list-empty';
        emptyMessage.textContent = 'No other accounts yet. Create another account to start a chat.';
        userList.append(emptyMessage);
    }
    users.forEach((user) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'user-option';
        button.dataset.email = user.email;
        button.setAttribute('aria-pressed', String(user.email === currentRecipientEmail));

        const name = document.createElement('span');
        name.className = 'user-option-name';
        name.textContent = user.displayName;
        const email = document.createElement('span');
        email.className = 'user-option-email';
        email.textContent = user.email;
        button.append(name, email);
        button.addEventListener('click', () => loadConversation(user.email));
        userList.append(button);
    });

    if (currentRecipientEmail && !users.some((user) => user.email === currentRecipientEmail)) {
        currentRecipientEmail = null;
        conversationTitle.textContent = 'Select a person to start chatting';
        messageInput.disabled = true;
        clearConversation();
    }
};

const startSession = async (auth) => {
    token = auth.token;
    currentUser = auth.user;
    sessionStorage.setItem('chatToken', token);
    sessionStorage.setItem('chatUser', JSON.stringify(currentUser));
    accountLabel.textContent = currentUser.email;
    accountModal.classList.add('is-hidden');

    try {
        await refreshUserList();
        connectSocket();
    } catch (error) {
        if (error.message === 'Please sign in again.') {
            signOut();
            showAccountError(error.message);
            return;
        }
        showChatError(error.message);
        connectSocket();
    }
};

modeToggle.addEventListener('click', () => setAccountMode(!isRegisterMode));
accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showAccountError('');
    accountSubmit.disabled = true;
    try {
        const endpoint = isRegisterMode ? '/api/register' : '/api/login';
        const body = {
            email: emailInput.value.trim(),
            password: passwordInput.value
        };
        if (isRegisterMode) body.displayName = nameInput.value.trim();
        const auth = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        await startSession(auth);
        passwordInput.value = '';
    } catch (error) {
        showAccountError(error.message);
    } finally {
        accountSubmit.disabled = false;
    }
});

logoutButton.addEventListener('click', signOut);
refreshUsersButton.addEventListener('click', async () => {
    refreshUsersButton.disabled = true;
    try {
        await refreshUserList();
        showChatError('');
    } catch (error) {
        if (error.message === 'Please sign in again.') {
            signOut();
            showAccountError(error.message);
        } else {
            showChatError(error.message);
        }
    } finally {
        refreshUsersButton.disabled = false;
    }
});

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    const recipientEmail = currentRecipientEmail;
    if (!message || !recipientEmail) return;
    if (!socket || !socket.connected) {
        showChatError('Chat is not connected. Please wait and try again.');
        return;
    }

    showChatError('');
    socket.timeout(10000).emit('send', { recipientEmail, message }, (error, response) => {
        if (error) {
            showChatError('The server did not confirm the message. Please try again.');
            return;
        }
        if (!response || response.error) {
            showChatError(response ? response.error : 'Message could not be sent.');
            return;
        }
        if (currentRecipientEmail === recipientEmail) {
            append(response.message.message, 'right', 'You');
        }
        messageInput.value = '';
    });
});

setAccountMode(true);
accountModal.classList.remove('is-hidden');
const storedUser = sessionStorage.getItem('chatUser');
if (token && storedUser) {
    try {
        currentUser = JSON.parse(storedUser);
        startSession({ token, user: currentUser });
    } catch {
        signOut();
    }
} else {
    signOut();
    window.requestAnimationFrame(() => emailInput.focus());
}
