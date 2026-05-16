// checkTables.js - Check if messages table exists
const mysql = require('mysql2/promise');

async function checkTables() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'root123',
      database: 'lost_and_found'
    });

    // List all tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\n📊 Tables in lost_and_found database:\n');
    tables.forEach(t => {
      const tableName = Object.values(t)[0];
      console.log(`  ✓ ${tableName}`);
    });

    // Check messages table specifically
    console.log('\n🔍 Checking messages table schema:\n');
    try {
      const [schema] = await connection.query('DESCRIBE messages');
      console.log('✓ messages table EXISTS\n');
      console.log('Columns:');
      schema.forEach(col => {
        console.log(`  - ${col.Field} (${col.Type})`);
      });
    } catch (err) {
      console.log('✗ messages table DOES NOT EXIST\n');
      console.log('You need to create it with this SQL:\n');
      console.log(`CREATE TABLE messages (
  message_id INT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  sender_id INT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(claim_id),
  FOREIGN KEY (sender_id) REFERENCES users(user_id)
);`);
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Connection error:', err.message);
  }
}

checkTables();
