// src/models/announcements/announcementsModel.js

const { S3Client } = require("@aws-sdk/client-s3");
const Redis = require("ioredis");
const { sql } = require("../../config/database");
const redisUrl = process.env.REDIS_HOST || "redis-10977.c62.us-east-1-4.ec2.redns.redis-cloud.com:10977";

// Redis Configuration
const redis = new Redis({
  host: 'redis-10977.c62.us-east-1-4.ec2.redns.redis-cloud.com',
  port: 10977,
  password: process.env.REDIS_PASSWORD,

})

// Announcement Status
const AnnouncementStatus = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  PINNED: "pinned",
};

// Create Announcement (Text-Only)
const createAnnouncement = async ({ adminId, title, content }) => {
  try {
    const result = await sql`
      INSERT INTO announcements (
        admin_id, 
        title, 
        content, 
        status, 
        created_at,
        published_at
      ) VALUES (
        ${adminId},
        ${title},
        ${content},
        ${AnnouncementStatus.PUBLISHED},
        NOW(),
        NOW()
      ) RETURNING id;
    `;

    await redis.del("announcements:list");
    return { id: result[0].id };
  } catch (error) {
    console.error("Announcement Creation Error:", error);
    throw error;
  }
};

// Update Announcement (Admins Only)
const updateAnnouncement = async (announcementId, adminId, { title, content, status }) => {
  try {
    const result = await sql`
      UPDATE announcements
      SET 
        title = ${title},
        content = ${content},
        status = ${status},
        published_at = ${status === AnnouncementStatus.PUBLISHED ? sql`NOW()` : null},
        updated_at = NOW()
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;

    if (!result[0]) throw new Error("Announcement not found or unauthorized");
    await redis.del("announcements:list");
    return result[0];
  } catch (error) {
    console.error("Update Error:", error);
    throw error;
  }
};

// Delete Announcement (Admins Only)
const deleteAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      DELETE FROM announcements 
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;

    if (!result[0]) throw new Error("Announcement not found");
    await redis.del("announcements:list");
    return result[0];
  } catch (error) {
    console.error("Deletion Error:", error);
    throw error;
  }
};

// Get Announcements (All Users)
const getAnnouncements = async (page = 1, limit = 10, status = AnnouncementStatus.PUBLISHED) => {
  const offset = (page - 1) * limit;
  try {
    const announcements = await sql`
      SELECT 
        a.id, 
        a.title, 
        a.content, 
        a.created_at, 
        a.published_at,
        u.full_name AS admin_name
      FROM announcements a
      JOIN users u ON a.admin_id = u.id
      WHERE a.status = ${status}
      ORDER BY a.published_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Cache for 1 hour
    await redis.setex(`announcements:${status}:${page}:${limit}`, 3600, JSON.stringify(announcements));
    return announcements;
  } catch (error) {
    console.error("Fetch Error:", error);
    throw error;
  }
};

// Pin/Unpin Announcement (Admins Only)
const pinAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      UPDATE announcements
      SET status = 'pinned', updated_at = NOW()
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;
    if (!result[0]) throw new Error("Announcement not found");
    await redis.del("announcements:list");
    return result[0];
  } catch (error) {
    console.error("Pin Error:", error);
    throw error;
  }
};

const unpinAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      UPDATE announcements
      SET status = 'published', updated_at = NOW()
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;
    if (!result[0]) throw new Error("Announcement not found");
    await redis.del("announcements:list");
    return result[0];
  } catch (error) {
    console.error("Unpin Error:", error);
    throw error;
  }
};

module.exports = {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  pinAnnouncement,
  unpinAnnouncement,
  AnnouncementStatus,
};