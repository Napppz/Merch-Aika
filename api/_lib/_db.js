const { Pool } = require('@neondatabase/serverless');
const { getRequiredEnv } = require('./env');

const connectionString = getRequiredEnv('DATABASE_URL');

const pool = new Pool({ connectionString });

module.exports = {
  query: (text, params) => pool.query(text, params),
};
