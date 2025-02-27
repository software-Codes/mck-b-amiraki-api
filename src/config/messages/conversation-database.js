const dotenv = require('dotenv');
dotenv.config();
const {neon} = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);


const createContactsTable = async () =>{
    try {
        await sql`
        CREATE TABLE contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, contact_user_id)
);
        `
        
    } catch (error) {
        
    }
}