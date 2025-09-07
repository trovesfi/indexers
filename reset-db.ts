import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function resetDatabase() {
  const client = new Client({
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
    // ssl: {
    //   rejectUnauthorized: false, // For development; use proper certs in production
    // },
  });

  try {
    await client.connect();
    // Get all table names
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    const tables = result.rows.map((row) => row.tablename);

    if (tables.length === 0) {
      console.log("No tables found to drop");
      return;
    }

    // Drop all tables
    console.log("Dropping tables:", tables);
    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`✓ Dropped table: ${table}`);
    }

    // Drop all sequences (auto-increment counters)
    const sequencesResult = await client.query(`
      SELECT sequencename 
      FROM pg_sequences 
      WHERE schemaname = 'public'
    `);

    const sequences = sequencesResult.rows.map((row) => row.sequencename);
    for (const sequence of sequences) {
      await client.query(`DROP SEQUENCE IF EXISTS "${sequence}" CASCADE`);
      console.log(`✓ Dropped sequence: ${sequence}`);
    }

    console.log("✅ Database reset complete!");
  } catch (error) {
    console.error("❌ Error resetting database:", error);
  } finally {
    await client.end();
  }
}

resetDatabase();
