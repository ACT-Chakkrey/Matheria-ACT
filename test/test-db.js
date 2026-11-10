// Quick verification test for MatheriaDB
const path = require('path');
const fs = require('fs');
const MatheriaDB = require('../db/database');

const testDbPath = path.join(__dirname, 'test-matheria.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

console.log('Testing MatheriaDB initialization...');
const db = new MatheriaDB(testDbPath);

// Test migration from users.json
const usersJsonPath = path.join(__dirname, '../data/users.json');
console.log('Testing migration from users.json...');
const migrated = db.migrateFromJson(usersJsonPath);
console.log('Migration completed, result:', migrated);

// Test getUser
const chakrey = db.getUser('leangchakrey');
console.log('Found user leangchakrey:', chakrey ? {
  name: chakrey.name,
  level: chakrey.level,
  gold: chakrey.gold,
  hasSave: !!chakrey.save
} : null);

if (!chakrey) {
  console.error('FAIL: User leangchakrey not found in DB!');
  process.exit(1);
}

// Test leaderboard
const lb = db.getLeaderboard(5);
console.log('Leaderboard top 5:');
lb.forEach((r, i) => console.log(` ${i + 1}. ${r.name} - Gold: ${r.gold.toLocaleString()}, Lvl: ${r.level}`));

// Test friend functions
const friendsData = db.getFriendsData('leangchakrey', () => true);
console.log('Friends for leangchakrey:', friendsData.friends.map(f => f.name));

// Test create user
const newUser = db.createUser({
  username: 'test_hero',
  name: 'TestHero',
  salt: 'abc123salt',
  hash: 'hashedpassword',
  gold: 500,
  level: 10
});
console.log('Created test user:', newUser ? newUser.name : null);

// Clean up test db
fs.unlinkSync(testDbPath);
try { fs.unlinkSync(testDbPath + '-wal'); } catch (e) {}
try { fs.unlinkSync(testDbPath + '-shm'); } catch (e) {}

console.log('ALL DB TESTS PASSED SUCCESSFULLY! ✅');
