// src/models/announcements/announcementsModel.js

const { S3Client } = require("@aws-sdk/client-s3");
const Redis = require("ioredis");
const { sql } = require("../../config/database");
const redisUrl =
  process.env.REDIS_HOST ||
  "redis-10977.c62.us-east-1-4.ec2.redns.redis-cloud.com:10977";

// Redis Configuration
const redis = new Redis({
  host: "redis-10977.c62.us-east-1-4.ec2.redns.redis-cloud.com",
  port: 10977,
  password: process.env.REDIS_PASSWORD,
});

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
// Update Announcement (Admins Only)
const updateAnnouncement = async (
  announcementId,
  adminId,
  { title, content, status }
) => {
  try {
    // Validate input
    if (title === undefined && content === undefined && status === undefined) {
      throw new Error("At least one of title, content, or status must be provided");
    }

    // Prepare update conditions dynamically
    const updateParts = [];
    const updateValues = {};

    if (title !== undefined) {
      updateParts.push('title = ${title}');
      updateValues.title = title;
    }

    if (content !== undefined) {
      updateParts.push('content = ${content}');
      updateValues.content = content;
    }

    if (status !== undefined) {
      updateParts.push('status = ${status}');
      updateValues.status = status;

      // Handle published_at based on status
      if (status === AnnouncementStatus.PUBLISHED) {
        updateParts.push('published_at = NOW()');
      } else {
        updateParts.push('published_at = NULL');
      }
    }

    // Always update updated_at
    updateParts.push('updated_at = NOW()');

    // Construct the update query
    const result = await sql`
      UPDATE announcements
      SET ${sql(updateParts.join(', '))}
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id, title, content, status, published_at, updated_at;
    `;

    if (!result[0]) {
      throw new Error("Announcement not found or unauthorized to update");
    }

    // Invalidate caches
    await redis.del("announcements:list");
    await redis.del(`announcements:${result[0].status}`);

    // Publish update event
    await redis.publish("announcements:updated", JSON.stringify(result[0]));

    return result[0];
  } catch (error) {
    console.error("Update Announcement Error:", error);
    throw error;
  }
};

// Delete Announcement (Admins Only)
const deleteAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      DELETE FROM announcements 
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id, status;
    `;

    if (!result[0]) {
      throw new Error("Announcement not found or unauthorized to delete");
    }

    // Invalidate caches
    await redis.del("announcements:list");
    await redis.del(`announcements:${result[0].status}`);

    // Publish delete event for real-time notification
    await redis.publish(
      "announcements:deleted",
      JSON.stringify({
        id: announcementId,
        status: result[0].status,
      })
    );

    return result[0];
  } catch (error) {
    console.error("Delete Announcement Error:", error);
    throw error;
  }
};

// Get Announcements (All Users)
const getAnnouncements = async (
  page = 1,
  limit = 10,
  status = AnnouncementStatus.PUBLISHED
) => {
  const offset = (page - 1) * limit;
  const cacheKey = `announcements:${status}:${page}:${limit}`;

  try {
    // Fetch announcements with comprehensive data
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

    // Count total published announcements
    const [countResult] = await sql`
      SELECT COUNT(*) as total 
      FROM announcements 
      WHERE status = ${status}
    `;

    const totalAnnouncements = parseInt(countResult.total, 10);
    const totalPages = Math.ceil(totalAnnouncements / limit);

    const result = {
      announcements,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalAnnouncements: totalAnnouncements,
        limit: limit,
      },
    };

    // Cache the result with appropriate expiration
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  } catch (error) {
    console.error("Fetch Announcements Error:", error);
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
// Real-time Announcement Subscription (for WebSocket or Server-Sent Events)
const subscribeToAnnouncements = (callback) => {
  const redisSubscriber = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  });

  redisSubscriber.subscribe("announcements:updated", "announcements:deleted");

  redisSubscriber.on("message", (channel, message) => {
    try {
      const data = JSON.parse(message);
      callback(channel, data);
    } catch (error) {
      console.error("Subscription parsing error:", error);
    }
  });

  return () => {
    redisSubscriber.unsubscribe(
      "announcements:updated",
      "announcements:deleted"
    );
    redisSubscriber.quit();
  };
};

module.exports = {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  pinAnnouncement,
  unpinAnnouncement,
  AnnouncementStatus,
  subscribeToAnnouncements,
};
