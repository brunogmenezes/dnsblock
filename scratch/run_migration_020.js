const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../src/config/db');

async function runMigration() {
  const migrationPath = path.join(__dirname, '../database/migrations/020_add_whitelist_wildcard_support.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Iniciando migração 020...');
  try {
    await pool.query(sql);
    console.log('Migração 020 executada com sucesso!');
  } catch (err) {
    console.error('Erro ao executar migração 020:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
