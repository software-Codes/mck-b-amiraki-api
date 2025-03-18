const dotenv = require("dotenv");
const { neon } = require("@neondatabase/serverless");
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

const createEnumTypes = async () => {
  try {
    const enumCommands = [
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
          CREATE TYPE auth_provider AS ENUM ('manual', 'google');
        END IF;
      END $$;`,

      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
          CREATE TYPE content_type AS ENUM ('text', 'image', 'video', 'audio');
        END IF;
      END $$;`,

      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
          CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
        END IF;
      END $$;`,

      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_purpose') THEN
          CREATE TYPE payment_purpose AS ENUM ('TITHE', 'OFFERING', 'SPECIAL_OFFERING', 'DEVELOPMENT_FUND');
        END IF;
      END $$;`,

      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
          CREATE TYPE notification_type AS ENUM ('PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'SYSTEM_ALERT', 'RECEIPT');
        END IF;
      END $$;`,
      `
-- Enum creation with proper existence checks
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestion_status') THEN
    CREATE TYPE suggestion_status AS ENUM ('pending', 'reviewed', 'implemented', 'rejected', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestion_urgency') THEN
    CREATE TYPE suggestion_urgency AS ENUM ('low', 'normal', 'high', 'critical');
  END IF;
END $$;`,
      // Enum creation with proper existence checks
      `DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
  CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'deleted');
END IF;
END $$;`,
    ];

    for (const command of enumCommands) {
      await sql(command);
    }
    console.log("Enum types created successfully");
  } catch (error) {
    console.error("Error creating enum types:", error.message);
  }
};

const createUsersTable = async () => {
  try {
    await sql(`
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  phone_number VARCHAR(20),
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'super_admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_super_admin BOOLEAN DEFAULT false,
  verification_code VARCHAR(6),
  verification_code_expires_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  token_invalidated_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  profile_photo TEXT,
  auth_provider auth_provider DEFAULT 'manual',
  google_id VARCHAR(255) UNIQUE,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

    `);
    console.log("Users table created successfully");
  } catch (error) {
    console.error("Error creating users table:", error.message);
  }
};

const createPaymentsTable = async () => {
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        purpose payment_purpose NOT NULL,
        description TEXT,
        phone_number VARCHAR(15) NOT NULL,
        merchant_request_id VARCHAR(255),
        checkout_request_id VARCHAR(255),
        mpesa_receipt_number VARCHAR(255) UNIQUE,
        status payment_status DEFAULT 'PENDING',
        payment_date DATE DEFAULT CURRENT_DATE,
        payment_time TIME DEFAULT CURRENT_TIME,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    const indexCommands = [
      "CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);",
      "CREATE INDEX IF NOT EXISTS idx_payments_purpose ON payments(purpose);",
      "CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);",
    ];

    for (const command of indexCommands) {
      await sql(command);
    }
    console.log("Payments table created successfully");
  } catch (error) {
    console.error("Error creating payments table:", error.message);
  }
};

const createNotificationsTable = async () => {
  try {
    // Create table
    await sql(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type notification_type NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes separately
    await sql(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    `);

    await sql(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `);

    console.log("Notifications table created successfully");
  } catch (error) {
    console.error("Error creating notifications table:", error.message);
  }
};

const createPaymentSummariesTable = async () => {
  try {
    // Create table
    await sql(`
      CREATE TABLE IF NOT EXISTS payment_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        purpose payment_purpose NOT NULL, 
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(date, purpose)
      );
    `);

    // Create function
    await sql(`
      CREATE OR REPLACE FUNCTION update_payment_summary()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO payment_summaries (date, purpose, total_amount, transaction_count)
        VALUES (NEW.payment_date, NEW.purpose, NEW.amount, 1)
        ON CONFLICT (date, purpose)
        DO UPDATE SET 
          total_amount = payment_summaries.total_amount + NEW.amount,
          transaction_count = payment_summaries.transaction_count + 1,
          last_updated = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger
    await sql(`
      DROP TRIGGER IF EXISTS after_payment_insert ON payments;
    `);

    await sql(`
      CREATE TRIGGER after_payment_insert
        AFTER INSERT ON payments
        FOR EACH ROW
        WHEN (NEW.status = 'COMPLETED')
        EXECUTE FUNCTION update_payment_summary();
    `);

    console.log("Payment summaries table and trigger created successfully");
  } catch (error) {
    console.error("Error creating payment summaries table:", error.message);
  }
};

const createStatementsTable = async () => {
  try {
    // Create table
    await sql(`
      CREATE TABLE IF NOT EXISTS user_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        statement_period VARCHAR(50) NOT NULL,
        file_url TEXT NOT NULL,
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        downloaded_at TIMESTAMP WITH TIME ZONE,
        is_available BOOLEAN DEFAULT true
      );
    `);

    // Create index
    await sql(`
      CREATE INDEX IF NOT EXISTS idx_user_statements_user_id ON user_statements(user_id);
    `);

    console.log("Statements table created successfully");
  } catch (error) {
    console.error("Error creating statements table:", error.message);
  }
};
const createViews = async () => {
  try {
    await sql(`
      CREATE OR REPLACE VIEW user_transaction_history AS
      SELECT 
        p.id as transaction_id,
        p.user_id,
        p.amount,
        p.purpose,
        p.description,
        p.status,
        p.payment_date,
        p.payment_time,
        p.mpesa_receipt_number,
        p.created_at,
        CASE 
          WHEN p.status = 'COMPLETED' THEN 'Success'
          WHEN p.status = 'PENDING' THEN 'Processing'
          WHEN p.status = 'FAILED' THEN 'Failed'
          ELSE 'Cancelled'
        END as transaction_status
      FROM payments p;
    `);

    await sql(`
      CREATE OR REPLACE VIEW daily_payment_report AS
      SELECT 
        p.payment_date,
        p.purpose,
        COUNT(*) as transaction_count,
        SUM(p.amount) as total_amount,
        array_agg(json_build_object(
          'user_name', u.full_name,
          'amount', p.amount,
          'time', p.payment_time,
          'phone', p.phone_number
        )) as transaction_details
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'COMPLETED'
      GROUP BY p.payment_date, p.purpose;
    `);
    console.log("Views created successfully");
  } catch (error) {
    console.error("Error creating views:", error.message);
  }
};

const createAnnouncementsTable = async () => {
  try {
    await sql(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_status') THEN
          CREATE TYPE announcement_status AS ENUM ('draft', 'published', 'archived', 'pinned');
        END IF;
      END $$;
    `);

    await sql(`
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
    `);
    console.log("Announcements table initialized successfully");
  } catch (error) {
    console.error("Error creating announcements table:", error.message);
  }
};

const createContactsTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS contacts (
        contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (user_id, contact_user_id)
      );
    `;
    console.log("Contacts table created successfully");
  } catch (error) {
    console.error("Error creating contacts table:", error.message);
  }
};
// Update messages table
const createMessagesTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT,
        media_id UUID REFERENCES media_contents(id),
        status message_status DEFAULT 'sent',
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        delivered_at TIMESTAMP WITH TIME ZONE,
        read_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // // Add indexes
    // await sql`
    //   CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    //   CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    //   CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    // `;

    console.log("Messages table created successfully");
  } catch (error) {
    console.error("Error creating messages table:", error.message);
  }
};
// Update suggestions table
// Fixed the suggestions table index creation
const createSuggestionsTable = async () => {
  try {
    await sql(`
CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category suggestion_category DEFAULT 'general',
  urgency_level suggestion_urgency DEFAULT 'normal',
  status suggestion_status DEFAULT 'pending',
  admin_response TEXT,
  admin_notes JSONB,
  is_anonymous BOOLEAN DEFAULT false,
  user_notification_preference BOOLEAN DEFAULT true,
  reviewed_by UUID REFERENCES users(id),
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
      );

    `);

    // Create indexes - fixed is_archived reference
    const indexCommands = [
      `CREATE INDEX IF NOT EXISTS idx_suggestions_user_id ON suggestions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_category ON suggestions(category)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_urgency ON suggestions(urgency_level)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_is_archived ON suggestions(is_archived)`,
      `CREATE INDEX IF NOT EXISTS idx_suggestions_anonymous ON suggestions(is_anonymous)`,
    ];

    for (const command of indexCommands) {
      await sql(command);
    }
    console.log("Suggestions table created successfully");
  } catch (error) {
    console.error("Error creating suggestions table:", error.message);
  }
};
const createMediaContentsTable = async () => {
  try {
    // Create the content_type enum type if it doesn't exist
    await sql(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
          CREATE TYPE content_type AS ENUM ('text', 'image', 'video', 'audio');
        END IF;
      END $$;
    `);

    // Create the media_contents table
    await sql(`
CREATE TABLE IF NOT EXISTS media_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  content_type content_type NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  size BIGINT NOT NULL,
  duration INTEGER,
  views_count INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  is_attached BOOLEAN DEFAULT true,
  message_id UUID,  -- remove FK constraint here
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
    `);

    // Create indexes for media_contents table
    const indexCommands = [
      "CREATE INDEX IF NOT EXISTS idx_media_contents_uploaded_by ON media_contents(uploaded_by);",
      "CREATE INDEX IF NOT EXISTS idx_media_contents_content_type ON media_contents(content_type);",
      "CREATE INDEX IF NOT EXISTS idx_media_contents_created_at ON media_contents(created_at);",
    ];

    for (const command of indexCommands) {
      await sql(command);
    }

    console.log("Media contents table created successfully");
  } catch (error) {
    console.error("Error creating media contents table:", error.message);
  }
};
const createSuggestionNotificationsTable = async () => {
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS suggestion_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suggestion_id UUID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
        admin_notified BOOLEAN DEFAULT false,
        user_notified BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE INDEX IF NOT EXISTS idx_suggestion_notifications_suggestion_id 
      ON suggestion_notifications(suggestion_id);
    `);

    console.log("Suggestion notifications table created successfully");
  } catch (error) {
    console.error(
      "Error creating suggestion notifications table:",
      error.message
    );
  }
};

const createRefreshTokensTable = async () => {
  try {
    await sql`
      CREATE TABLE refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,  -- Change from INTEGER to UUID
        token TEXT NOT NULL UNIQUE,
        is_revoked BOOLEAN DEFAULT false,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMP,
        CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;

    // Create indexes separately after the table creation
    await sql`
      CREATE INDEX idx_token ON refresh_tokens (token);
    `;
    
    await sql`
      CREATE INDEX idx_user_id ON refresh_tokens (user_id);
    `;

    console.log("Refresh tokens table and indexes created successfully");
  } catch (error) {
    console.error("Error creating refresh tokens table:", error.message);
  }
};



const initializeDatabaseTables = async () => {
  try {
    await createEnumTypes();
    await createUsersTable();
    await createPaymentsTable();
    await createNotificationsTable();
    await createPaymentSummariesTable();
    await createStatementsTable();
    await createViews();
    await createAnnouncementsTable();
    await createSuggestionsTable();
    await createMediaContentsTable();
    await createContactsTable();
    await createMessagesTable();
    await createSuggestionNotificationsTable();
    await createRefreshTokensTable();
    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("Error initializing database:", error.message);
  }
};

module.exports = {
  initializeDatabaseTables,
  sql,
  createUsersTable,
  createAnnouncementsTable,
  createPaymentsTable,
  // createNotificationsTable,
  // createPaymentSummariesTable,
  // createStatementsTable,
  createViews,
  createEnumTypes,
  createSuggestionsTable,
  createMediaContentsTable,
  // createContactsTable,
  createSuggestionNotificationsTable,
  createMessagesTable,
  createRefreshTokensTable,
};
