import { Pool } from 'pg';

let pool = null;

function sslConfig() {
  const sslMode = process.env.DB_SSLMODE || process.env.PGSSLMODE || '';
  if (sslMode === 'disable' || process.env.DB_SSL === 'false') {
    return false;
  }
  return {
    rejectUnauthorized: false,
  };
}

export default function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: sslConfig(),
    });
  }
  return pool;
}
