# NIE-Vault

NIE-Vault is a lost-and-found web app built with Node.js, Express, MySQL, and Socket.io. It supports item posting, claims, direct item messaging, real-time notifications, and user authentication.

## Features

- User registration, login, and session management
- Post lost/found items with details and optional images
- Submit claims for found items
- Direct messaging between item owners and finders
- Real-time notification popup for new claims and messages
- Persistent notification history on the client

## Prerequisites

- Node.js 18+ installed
- MySQL server installed and running
- Git (optional)

## Setup

1. Clone the project or copy the repo to your machine.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a MySQL database for the app.

   Example:

   ```sql
   CREATE DATABASE lost_and_found;
   ```

4. Create the `.env` file in the project root.

   Copy the example values below and update them for your local environment:

   ```text
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=lost_and_found
   DB_CONN_LIMIT=10
   SESSION_SECRET=change-this-to-a-long-random-string
   PORT=3000
   APP_URL=http://localhost:3000

   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@example.com
   SMTP_PASS=your-email-password
   SMTP_FROM="NIE-Vault <your-email@example.com>"
   ```

5. Ensure your MySQL user has access to the database:

   ```sql
   GRANT ALL PRIVILEGES ON lost_and_found.* TO 'root'@'localhost';
   FLUSH PRIVILEGES;
   ```

## Database setup

If the schema is not yet created, run the SQL schema script if provided by the project or create the required tables manually. This app already includes a runtime table check for notifications and messaging.

6. Create the `item_messages` table:

   ```bash
   node createItemMessagesTable.js
   ```

   This command creates the `item_messages` table used by the direct messaging feature.

## Run the app

Start the server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Development

You can use `nodemon` for auto-reload while developing:

```bash
npm run dev
```

## Useful Notes

- The app uses `dotenv`, so environment variables in `.env` are loaded at startup.
- If you change `.env`, restart the server to apply the new configuration.
- If port `3000` is already in use, update `PORT` in `.env`.
- Real-time notifications require WebSocket support in the browser.

## Troubleshooting

- `Access denied for user 'root'@'localhost'`: verify `DB_USER` and `DB_PASSWORD` in `.env`.
- `Port 3000 is already in use`: change `PORT` in `.env` or stop the existing process.
- If message threads do not appear, open browser console and server logs for API request failures.

## Project structure

- `server.js` — main Express/Socket.io server
- `db.js` — MySQL connection pool
- `routes/` — API routes
- `public/` — client HTML, CSS, and JS
- `ws.js` — WebSocket notification handling
- `createItemMessagesTable.js` — helper to create the item_messages table

## License

This project is provided as-is for educational and internal use.
