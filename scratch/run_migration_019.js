const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../src/config/db');

async function runMigration() {
  const migrationPath = path.join(__dirname, '../database/migrations/019_create_whitelist_table.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Iniciando migração 019...');
  try {
    await pool.query(sql);
    console.log('Migração 019 executada com sucesso!');
  } catch (err) {
    console.error('Erro ao executar migração 019:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
