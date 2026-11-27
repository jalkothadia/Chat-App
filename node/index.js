    require('dotenv').config();

    const crypto = require('crypto');
    const express = require('express');
    const http = require('http');
    const { MongoClient, ObjectId } = require('mongodb');
    const { promisify } = require('util');
    const { Server } = require('socket.io');

    const scrypt = promisify(crypto.scrypt);
    const app = express();
    const server = http.createServer(app);
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    const tokenSecret = process.env.AUTH_SECRET;
    const mongoUri = process.env.MONGODB_URI;
    const databaseName = process.env.MONGODB_DB || 'chatapp';

    if (!tokenSecret || Buffer.byteLength(tokenSecret) < 32) {
        throw new Error('AUTH_SECRET must be set to a random value of at least 32 bytes.');
    }
    if (!mongoUri) {
        throw new Error('MONGODB_URI must be set to connect to MongoDB.');
    }

    const mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const databasePromise = mongoClient.connect().then(() => mongoClient.db(databaseName));

    const io = new Server(server, {
        cors: { origin: process.env.CLIENT_URL }
    });

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
    app.use(express.json({ limit: '10kb' }));

    const initializeDatabase = async () => {
        const database = await databasePromise;
        await Promise.all([
            database.collection('users').createIndex({ email: 1 }, { unique: true }),
            database.collection('messages').createIndex({ senderId: 1, recipientId: 1, createdAt: 1 }),
            database.collection('messages').createIndex({ recipientId: 1, senderId: 1, createdAt: 1 })
        ]);
        return database;
    };

    const normalizeEmail = (email) => email.trim().toLowerCase();
    const isValidEmail = (email) => (
        typeof email === 'string' &&
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );

    const createToken = (user) => {
        const payload = Buffer.from(JSON.stringify({
            id: user._id.toString(),
            email: user.email,
            displayName: user.displayName,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
        })).toString('base64url');
        const signature = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
        return `${payload}.${signature}`;
    };

    const verifyToken = (token) => {
        if (typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
        const [payload, signature] = parts;

        const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest();
        let received;
        try {
            received = Buffer.from(signature, 'base64url');
        } catch {
            return null;
        }
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

        try {
            const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            if (!ObjectId.isValid(user.id) || !user.email || !user.displayName || user.expiresAt <= Date.now()) {
                return null;
            }
            return user;
        } catch {
            return null;
        }
    };

    const authenticateRequest = (req, res, next) => {
        const authorization = req.get('authorization') || '';
        const user = authorization.startsWith('Bearer ')
            ? verifyToken(authorization.slice(7))
            : null;
        if (!user) return res.status(401).json({ error: 'Please sign in again.' });
        req.user = user;
        next();
    };

    const respondWithError = (error, res) => {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        console.error(error);
        return res.status(500).json({ error: 'The request could not be completed.' });
    };

    app.post('/api/register', async (req, res) => {
        const { email, password, displayName } = req.body || {};
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
        if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 60) {
            return res.status(400).json({ error: 'Display name must be between 1 and 60 characters.' });
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
        }

        try {
            const database = await databasePromise;
            const salt = crypto.randomBytes(16);
            const passwordHash = await scrypt(password, salt, 64);
            const user = {
                email: normalizeEmail(email),
                displayName: displayName.trim(),
                passwordSalt: salt.toString('base64'),
                passwordHash: passwordHash.toString('base64'),
                createdAt: new Date()
            };
            const result = await database.collection('users').insertOne(user);
            user._id = result.insertedId;
            res.status(201).json({
                token: createToken(user),
                user: { email: user.email, displayName: user.displayName }
            });
        } catch (error) {
            respondWithError(error, res);
        }
    });

    app.post('/api/login', async (req, res) => {
        const { email, password } = req.body || {};
        if (!isValidEmail(email) || typeof password !== 'string' || password.length > 128) {
            return res.status(400).json({ error: 'Enter a valid email address and password.' });
        }

        try {
            const database = await databasePromise;
            const user = await database.collection('users').findOne(
                { email: normalizeEmail(email) },
                { projection: { email: 1, displayName: 1, passwordSalt: 1, passwordHash: 1 } }
            );
            if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });

            const passwordHash = await scrypt(password, Buffer.from(user.passwordSalt, 'base64'), 64);
            const storedHash = Buffer.from(user.passwordHash, 'base64');
            if (!crypto.timingSafeEqual(passwordHash, storedHash)) {
                return res.status(401).json({ error: 'Email or password is incorrect.' });
            }
            res.json({
                token: createToken(user),
                user: { email: user.email, displayName: user.displayName }
            });
        } catch (error) {
            respondWithError(error, res);
        }
    });

    app.get('/api/users', authenticateRequest, async (req, res) => {
        try {
            const database = await databasePromise;
            const users = await database.collection('users')
                .find(
                    { _id: { $ne: new ObjectId(req.user.id) } },
                    { projection: { email: 1, displayName: 1 } }
                )
                .sort({ displayName: 1, email: 1 })
                .toArray();
            res.json(users.map(({ email, displayName }) => ({ email, displayName })));
        } catch (error) {
            respondWithError(error, res);
        }
    });

    app.get('/api/messages', authenticateRequest, async (req, res) => {
        const email = req.query.with;
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Select a valid user.' });

        try {
            const database = await databasePromise;
            const otherUser = await database.collection('users').findOne(
                { email: normalizeEmail(email) },
                { projection: { email: 1, displayName: 1 } }
            );
            if (!otherUser) return res.status(404).json({ error: 'User not found.' });

            const userId = new ObjectId(req.user.id);
            const messages = await database.collection('messages')
                .find({
                    $or: [
                        { senderId: userId, recipientId: otherUser._id },
                        { senderId: otherUser._id, recipientId: userId }
                    ]
                })
                .sort({ createdAt: 1, _id: 1 })
                .toArray();
            res.json(messages.map((message) => {
                const isOwnMessage = message.senderId.equals(userId);
                return {
                    id: message._id.toString(),
                    message: message.message,
                    createdAt: message.createdAt,
                    senderEmail: isOwnMessage ? req.user.email : otherUser.email,
                    senderName: isOwnMessage ? req.user.displayName : otherUser.displayName,
                    recipientEmail: isOwnMessage ? otherUser.email : req.user.email
                };
            }));
        } catch (error) {
            respondWithError(error, res);
        }
    });

    io.use(async (socket, next) => {
        const user = verifyToken(socket.handshake.auth && socket.handshake.auth.token);
        if (!user) return next(new Error('Authentication required.'));
        try {
            const database = await databasePromise;
            const record = await database.collection('users').findOne(
                { _id: new ObjectId(user.id) },
                { projection: { email: 1, displayName: 1 } }
            );
            if (!record) return next(new Error('Account not found.'));
            socket.data.user = { id: record._id.toString(), email: record.email, displayName: record.displayName };
            next();
        } catch (error) {
            console.error(error);
            next(new Error('Could not authenticate with the database.'));
        }
    });

    io.on('connection', (socket) => {
        const sender = socket.data.user;
        socket.join(`user:${sender.id}`);

        socket.on('send', async (data, acknowledge) => {
            const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
            const message = data && typeof data.message === 'string' ? data.message.trim() : '';
            const email = data && data.recipientEmail;
            if (!isValidEmail(email) || !message || message.length > 2000) {
                return reply({ error: 'Choose a user and enter a message of up to 2,000 characters.' });
            }
            try {
                const database = await databasePromise;
                const recipient = await database.collection('users').findOne(
                    { email: normalizeEmail(email) },
                    { projection: { email: 1 } }
                );
                if (!recipient) return reply({ error: 'User not found.' });
                if (recipient._id.toString() === sender.id) return reply({ error: 'You cannot message yourself.' });

                const savedMessage = {
                    senderId: new ObjectId(sender.id),
                    recipientId: recipient._id,
                    message,
                    createdAt: new Date()
                };
                const result = await database.collection('messages').insertOne(savedMessage);
                const deliveredMessage = {
                    id: result.insertedId.toString(),
                    message,
                    createdAt: savedMessage.createdAt,
                    senderEmail: sender.email,
                    senderName: sender.displayName,
                    recipientEmail: recipient.email
                };
                io.to(`user:${recipient._id.toString()}`).emit('receive', deliveredMessage);
                reply({ message: deliveredMessage });
            } catch (error) {
                console.error(error);
                reply({ error: 'Message could not be saved.' });
            }
        });
    });

    app.use((error, req, res, next) => {
        console.error(error);
        if (res.headersSent) return next(error);
        res.status(500).json({ error: 'The request could not be completed.' });
    });

    const PORT = process.env.PORT || 8000;
    initializeDatabase().then(() => {
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Backend running on port ${PORT}`);
        });
    }).catch((error) => {
        console.error('Could not initialize MongoDB:', error);
        process.exitCode = 1;
    });

    console.log("PORT:", process.env.PORT);
    console.log("SMTP HOST:", process.env.SMTP_HOST);
    console.log("SMTP USER:", process.env.SMTP_USER);
    console.log("MONGO URI loaded:", !!process.env.MONGO_URI);
