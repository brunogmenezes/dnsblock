const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../src/config/db');

async function runMigration() {
  const migrationPath = path.join(__dirname, '../database/migrations/018_create_ips_table.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Iniciando migração 018...');
  try {
    await pool.query(sql);
    console.log('Migração 018 executada com sucesso!');
  } catch (err) {
    console.error('Erro ao executar migração 018:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
