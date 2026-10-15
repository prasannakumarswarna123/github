/**
 * Supabase Automated Migration Runner
 * Executes supabase/migrations/20261014000000_create_chatbot_tables.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env and .ev
const envPath = path.join(__dirname, '.env');
const evPath = path.join(__dirname, '.ev');

if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
if (fs.existsSync(evPath)) {
  const evConfig = dotenv.parse(fs.readFileSync(evPath));
  for (const k in evConfig) {
    if (!process.env[k]) process.env[k] = evConfig[k];
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Path to SQL migration file
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261014000000_create_chatbot_tables.sql');
const fallbackSqlPath = path.join(__dirname, '..', 'supabase_schema.sql');

async function runMigration() {
  console.log('\n======================================================');
  console.log('⚡ Supabase Migration Runner');
  console.log('======================================================\n');

  // Read SQL file
  let sqlContent = '';
  if (fs.existsSync(migrationPath)) {
    sqlContent = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📄 Loaded migration: supabase/migrations/20261014000000_create_chatbot_tables.sql`);
  } else if (fs.existsSync(fallbackSqlPath)) {
    sqlContent = fs.readFileSync(fallbackSqlPath, 'utf8');
    console.log(`📄 Loaded schema: supabase_schema.sql`);
  } else {
    console.error('❌ Migration SQL file not found!');
    process.exit(1);
  }

  // Extract project ref
  let projectRef = '';
  const match = SUPABASE_URL.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (match) {
    projectRef = match[1];
  }

  // Check if we have direct PostgreSQL connection parameters
  let connectionString = DATABASE_URL;
  if (!connectionString && DB_PASSWORD && projectRef) {
    connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require`;
  }

  if (connectionString) {
    console.log('🔌 Connecting to Supabase PostgreSQL database...');
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log(' Connected to PostgreSQL. Executing migration script...');
      
      await client.query(sqlContent);
      
      console.log(' Migration applied successfully!');
      console.log(' Tables created:');
      console.log('   - public.conversations (with updated_at trigger & RLS)');
      console.log('   - public.messages (with foreign key cascade & RLS)');
      
      await client.end();
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration failed via PostgreSQL connection:', err.message);
      await client.end();
    }
  }

  // If direct DB connection is not configured yet, check with Supabase client
  if (SUPABASE_URL && SUPABASE_KEY) {
    console.log(`🔍 Checking Supabase project (${SUPABASE_URL})...`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
      const { data, error } = await supabase.from('conversations').select('id').limit(1);
      if (!error) {
        console.log('✅ The "conversations" table is already created and ready in your Supabase project!');
        process.exit(0);
      }
    } catch (_) {}
  }

  // Provide instructions for 1-step completion
  console.log('\n------------------------------------------------------');
  console.log('📌 Next Step to Execute Migration in 1 Click:');
  console.log('------------------------------------------------------');
  if (projectRef) {
    console.log(`\n👉 Option 1 (Instant Web Editor):`);
    console.log(`   1. Open: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log(`   2. Copy contents of "supabase_schema.sql" and click "RUN".`);
    console.log(`\n👉 Option 2 (Automated CLI via DB Password):`);
    console.log(`   Add your Supabase DB password to backend/.env:`);
    console.log(`     DB_PASSWORD=your_db_password_here`);
    console.log(`   Then re-run:`);
    console.log(`     npm run migrate\n`);
  }
}

runMigration().catch(err => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
