const dotenv = require("dotenv");
const { neon } = require("@neondatabase/serverless");
//load environment variables
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

const createAnnouncementsTable = async () => {
  try {
    // Create ENUM types if they don't exist
    await sql`
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
                            CREATE TYPE auth_provider AS ENUM ('manual', 'google');
                        END IF;
        
                        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
                            CREATE TYPE content_type AS ENUM ('text', 'image', 'video', 'audio');
                        END IF;
                    END $$;
                `;

    // Create announcements table
    await sql`
    CREATE TABLE announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    media_urls JSONB DEFAULT '[]',
    type VARCHAR(50) NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);
    `;
    console.log("Announcements table created successfully");
  } catch (error) {
    console.error("Error creating announcements table:", error.message);
    throw error;
  }
};

const initializeAnnouncementsTable = async () => {
  try {
    await createAnnouncementsTable();
    console.log("Announcements table initialized successfully");
  } catch (error) {
    console.error("Error initializing announcements table:", error.message);
    throw error;
  }
};

module.exports = {
  createAnnouncementsTable,
  initializeAnnouncementsTable,
  sql,
};
