const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDb() {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    const isProduction = process.env.NODE_ENV === 'production' || connectionString !== undefined;

    let dbClient;

    if (connectionString) {
        // Direct cloud database connection (creation is handled by cloud provider)
        dbClient = new Client({
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false }
        });
    } else {
        // Local offline development database check & creation
        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
            port: parseInt(process.env.DB_PORT || '5432', 10),
        };

        const adminClient = new Client({
            ...dbConfig,
            database: 'postgres',
        });

        const targetDbName = process.env.DB_NAME || 'kr8tivestudiox';

        try {
            await adminClient.connect();
            const res = await adminClient.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                [targetDbName]
            );
            if (res.rowCount === 0) {
                await adminClient.query(`CREATE DATABASE "${targetDbName}"`);
                console.log(`Database '${targetDbName}' created successfully.`);
            } else {
                console.log(`Database '${targetDbName}' already exists.`);
            }
        } catch (err) {
            console.error("Error checking/creating database:", err);
        } finally {
            await adminClient.end();
        }

        dbClient = new Client({
            ...dbConfig,
            database: targetDbName,
        });
    }

    try {
        await dbClient.connect();

        // Create clients table
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                client_name VARCHAR(100) UNIQUE NOT NULL,
                display_name VARCHAR(255) NOT NULL,
                pin VARCHAR(50) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create photos table
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS photos (
                id SERIAL PRIMARY KEY,
                client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_client_filename UNIQUE(client_id, filename)
            )
        `);

        // Migration: widen filename column from VARCHAR(255) to TEXT for Vercel Blob URLs
        await dbClient.query(`
            ALTER TABLE photos ALTER COLUMN filename TYPE TEXT
        `);

        // Create messages table
        await dbClient.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration query to add client_id column if the table already existed without it
        await dbClient.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL
        `);

        console.log("Database tables initialized successfully.");

        // 3. Seed default 'events' client with PIN 'KR8TIVE2026'
        const clientRes = await dbClient.query(
            "SELECT id FROM clients WHERE client_name = $1",
            ['events']
        );
        
        let clientId;
        if (clientRes.rowCount === 0) {
            const insertRes = await dbClient.query(
                "INSERT INTO clients (client_name, display_name, pin) VALUES ($1, $2, $3) RETURNING id",
                ['events', 'Default Collection', 'KR8TIVE2026']
            );
            clientId = insertRes.rows[0].id;
            console.log("Seeded default collection 'events' with PIN 'KR8TIVE2026'.");
        } else {
            clientId = clientRes.rows[0].id;
        }

        // 4. Scan physical directory 'uploads/events' to sync any existing files
        const eventsDir = path.join(__dirname, '../../uploads/events');
        if (fs.existsSync(eventsDir)) {
            const files = fs.readdirSync(eventsDir);
            let syncCount = 0;
            for (const file of files) {
                // Ignore directories or background files if any
                const filePath = path.join(eventsDir, file);
                if (fs.statSync(filePath).isFile()) {
                    // Check if already in DB
                    const photoRes = await dbClient.query(
                        "SELECT 1 FROM photos WHERE client_id = $1 AND filename = $2",
                        [clientId, file]
                    );
                    if (photoRes.rowCount === 0) {
                        const originalName = file.includes('-') ? file.substring(file.indexOf('-') + 1) : file;
                        await dbClient.query(
                            "INSERT INTO photos (client_id, filename, original_name) VALUES ($1, $2, $3)",
                            [clientId, file, originalName]
                        );
                        syncCount++;
                    }
                }
            }
            if (syncCount > 0) {
                console.log(`Synced ${syncCount} pre-existing photo(s) from uploads/events to database.`);
            }
        }

    } catch (err) {
        console.error("Error setting up database tables/seeding:", err);
    } finally {
        await dbClient.end();
    }
}

module.exports = initDb;
