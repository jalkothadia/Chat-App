# ChatSpace server

## MongoDB requirements

The server uses MongoDB. Run a MongoDB instance locally or use MongoDB Atlas, and set `MONGODB_URI` to its connection string. The database is created automatically when the server starts; `MONGODB_DB` selects its name (default: `chatapp`). The MongoDB user must have read/write access to that database so the server can create collections and indexes.

On startup, the server creates indexes for:

- `users`: unique email address. User documents store the display name, password salt/hash, and account creation time.
- `messages`: sender and recipient IDs, message text, and creation time, with indexes to retrieve conversation history.

Passwords are stored as salted scrypt hashes, not plaintext. Messages are stored in the database, so offline users can see them when they open that conversation.

Existing SQL Server records are not automatically copied to MongoDB. Export/import them separately if you need to keep data from a previous deployment.

## Configure and run

1. Copy `.env.example` to `.env`. Set `MONGODB_URI` to your MongoDB connection string and optionally change `MONGODB_DB`.
2. Replace `AUTH_SECRET` with a private random value at least 32 bytes long. Keep `.env` out of source control.
3. Install dependencies with `npm install` in this directory, then run `npm start`.
4. Serve the project web page separately (for example with VS Code Live Server). Set `CORS_ORIGIN` to that page's origin when it is not served from the same origin; use a specific origin rather than `*` in production.

The browser connects to the API and Socket.IO server on port 8000 by default. Change `PORT` if needed and keep the frontend's backend URL in `js/client.js` aligned with it.
