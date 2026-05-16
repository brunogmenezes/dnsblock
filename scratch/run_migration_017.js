require('dotenv').config();
const pool = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '017_add_type_to_notices.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    console.log('Running migration...');
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
