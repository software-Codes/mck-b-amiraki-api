const { sql } = require('../config/database');

const AnnouncementModel = {
    create: async (announcement) => {
        return await sql`
            INSERT INTO announcements (
                title,
                content,
                media_urls,
                created_by,
                type
            ) VALUES (
                ${announcement.title},
                ${announcement.content},
                ${announcement.mediaUrls},
                ${announcement.createdBy},
                ${announcement.type}
            ) RETURNING *
        `;
    },

    findAll: async () => {
        return await sql`
            SELECT * FROM announcements 
            ORDER BY created_at DESC
        `;
    },

    // Add other database operations as needed
};

module.exports = AnnouncementModel;
