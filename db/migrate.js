// Standalone migration script
const path = require('path');
const fs = require('fs');
const MatheriaDB = require('./database');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'matheria.db');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

console.log('Initializing Matheria SQLite database at:', DB_PATH);
const db = new MatheriaDB(DB_PATH);

if (fs.existsSync(USERS_FILE)) {
  console.log('Found users.json, running migration if database is fresh...');
  const result = db.migrateFromJson(USERS_FILE);
  if (result) {
    console.log('Migration completed successfully.');
  } else {
    console.log('Database already has data or migration was already performed.');
  }
} else {
  console.log('No users.json file found to migrate.');
}
