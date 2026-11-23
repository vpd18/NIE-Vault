// viewDb.js — Quick CLI tool to view live RDS database records
require('dotenv').config();
const mysql = require('mysql2/promise');

async function viewDatabase() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'lost_and_found'
    });

    console.log('\n=========================================');
    console.log('  🌐 CONNECTED TO AMAZON RDS (MySQL)');
    console.log('  Host:', process.env.DB_HOST);
    console.log('=========================================\n');

    // 1. Table Counts
    const [tables] = await conn.query('SHOW TABLES;');
    console.log('📊 TABLES & ROW COUNTS:');
    for (const t of tables) {
      const tableName = Object.values(t)[0];
      const [count] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      console.log(`  • ${tableName.padEnd(22)} : ${count[0].cnt} rows`);
    }

    // 2. Users
    console.log('\n👥 REGISTERED USERS:');
    const [users] = await conn.query('SELECT user_id, full_name, email, username, email_verified, created_at FROM users;');
    if (!users.length) console.log('  (No users yet)');
    else console.table(users);

    // 3. Items
    console.log('\n📦 REPORTED ITEMS:');
    const [items] = await conn.query('SELECT item_id, report_type, color, location, status, image_path, created_at FROM items ORDER BY created_at DESC LIMIT 5;');
    if (!items.length) console.log('  (No items yet)');
    else console.table(items);

    // 4. Claims
    console.log('\n📋 CLAIMS:');
    const [claims] = await conn.query('SELECT claim_id, item_id, claimant_id, status, created_at FROM claims LIMIT 5;');
    if (!claims.length) console.log('  (No claims yet)');
    else console.table(claims);

    console.log('\n=========================================\n');
    await conn.end();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
}

viewDatabase();
