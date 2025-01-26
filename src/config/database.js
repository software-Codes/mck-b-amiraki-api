    // Initialize database tables and types

    const dotenv = require('dotenv')
    const {neon} = require ('@neondatabase/serverless')
    // Load environment variables
    dotenv.config();

    const sql = neon(process.env.DATABASE_URL);

    const createUsersTable = async () => {
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

            // Create users table with expanded fields
            await sql`
                CREATE TABLE IF NOT EXISTS users (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    full_name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255),
                    phone_number VARCHAR(20),
                    auth_provider auth_provider DEFAULT 'manual',

                    -- OAuth Identifiers
                    google_id VARCHAR(255) UNIQUE,
                    facebook_id VARCHAR(255) UNIQUE,

                    -- Profile Information
                    profile_picture_url TEXT,
                    is_verified BOOLEAN DEFAULT false,

                    -- Timestamps
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `;

            console.log('Users table initialized successfully');
        } catch (error) {
            console.error('Error creating users table:', error.message);
        }
    };

    const createAnnouncementsTable = async () => {
        try {
          await sql`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_status') THEN
                CREATE TYPE announcement_status AS ENUM ('draft', 'published', 'archived', 'pinned');
              END IF;
            END $$;
          `;
      
          // Simplified announcements table (text-only)
          await sql`
            CREATE TABLE IF NOT EXISTS announcements (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NOT NULL,
              status announcement_status DEFAULT 'draft',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              published_at TIMESTAMP WITH TIME ZONE,
              views_count INTEGER DEFAULT 0
            );
          `;
      
          console.log('Announcements table initialized successfully');
        } catch (error) {
          console.error('Error creating announcements table:', error.message);
        }
      };
      

    //  export  const createAdditionalTables = async () => 
    //     try {
    //         // Create announcements table
    //         await sql`
    //             CREATE TABLE IF NOT EXISTS announcements (
    //                 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    //                 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    //                 title VARCHAR(255) NOT NULL,
    //                 content TEXT,
    //                 content_type content_type NOT NULL,
    //                 media_url TEXT,
    //                 thumbnail_url TEXT,
    //                 is_approved BOOLEAN DEFAULT false,

    //                 -- Timestamps
    //                 created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    //                 updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    //             );
    //         `;

    //         // Create media gallery table
    //         await sql`
    //             CREATE TABLE IF NOT EXISTS media_gallery (
    //                 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    //                 admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    //                 title VARCHAR(255) NOT NULL,
    //                 description TEXT,
    //                 file_url TEXT NOT NULL,
    //                 file_type VARCHAR(50),
                    
    //                 -- Timestamps
    //                 created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    //                 updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    //             );
    //         `;

    //         console.log('Additional tables (Announcements and Media Gallery) created successfully');
    //     } catch (error) {
    //         console.error('Error creating additional tables:', error.message);
    //     }
    // };

    const initializeDatabaseTables = async () => {
        try {
            await createUsersTable();
            await createAnnouncementsTable();
            console.log('Database tables successfully initialized');
        } catch (error) {
            console.error('Error initializing users database tables:', error.message);
        } 
    };

    module.exports = {
        initializeDatabaseTables, sql, createUsersTable
    }