// createItemMessagesTable.js - Create item_messages table for direct item communication
const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTable() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root123',
      database: process.env.DB_NAME || 'lost_and_found'
    });

    // Create item_messages table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS item_messages (
        message_id INT PRIMARY KEY AUTO_INCREMENT,
        item_id INT NOT NULL,
        sender_id INT NOT NULL,
        recipient_id INT NOT NULL,
        body TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at TIMESTAMP NULL DEFAULT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_item_messages_item (item_id),
        INDEX idx_item_messages_sender (sender_id),
        INDEX idx_item_messages_recipient (recipient_id),
        INDEX idx_item_messages_item_participants (item_id, sender_id, recipient_id)
      )
    `);

    console.log('✓ item_messages table created or already exists');
    await connection.end();
  } catch (err) {
    console.error('❌ Error creating table:', err.message);
    process.exit(1);
  }
}

createTable();
