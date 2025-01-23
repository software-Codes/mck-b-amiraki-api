import { v4 as uuidv4 } from "uuid";
import AWS from "aws-sdk";
import Redis from "ioredis";
import { sql } from "../../config/database.js";

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Redis Caching Configuration
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

// Announcement Status Types
const AnnouncementStatus = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

// Media Types for Announcements
const MediaType = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
};

// Function to upload file to AWS S3
const uploadToS3 = async (file, prefix = "announcements/") => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `${prefix}${uuidv4()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read",
  };

  try {
    const uploaded = await s3.upload(params).promise();
    return {
      url: uploaded.Location,
      key: uploaded.Key,
    };
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error("Failed to upload file to S3");
  }
};

// Function to delete file from AWS S3
const deleteFromS3 = async (fileKey) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: fileKey,
  };

  try {
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error("S3 Delete Error:", error);
    throw new Error("Failed to delete file from S3");
  }
};

// Create Announcement
const createAnnouncement = async ({
  adminId,
  title,
  content,
  status = AnnouncementStatus.DRAFT,
  mediaFiles = [],
}) => {
  try {
    // Begin transaction
    await sql.begin(async (sql) => {
      // Upload media files to S3
      const uploadedMedia = await Promise.all(
        mediaFiles.map(async (file) => {
          const uploadResult = await uploadToS3(file);
          return {
            url: uploadResult.url,
            key: uploadResult.key,
            type: file.mimetype.startsWith("image/")
              ? MediaType.IMAGE
              : file.mimetype.startsWith("video/")
              ? MediaType.VIDEO
              : MediaType.DOCUMENT,
          };
        })
      );

      // Insert announcement
      const announcement = await sql`
        INSERT INTO announcements (
          admin_id,
          title,
          content,
          status,
          created_at,
          updated_at
        ) VALUES (
          ${adminId},
          ${title},
          ${content},
          ${status},
          NOW(),
          NOW()
        ) RETURNING id;
      `;

      // Insert media attachments
      if (uploadedMedia.length > 0) {
        await sql`
          INSERT INTO announcement_media (
            announcement_id,
            media_url,
            media_key,
            media_type
          ) VALUES ${sql(
            uploadedMedia.map((media) => [
              announcement[0].id,
              media.url,
              media.key,
              media.type,
            ])
          )}
        `;
      }

      // Invalidate cache
      await redis.del(`announcements:list`);
      await redis.del(`announcements:recent`);

      return announcement[0];
    });
  } catch (error) {
    console.error("Announcement Creation Error:", error);
    throw error;
  }
};

// Update Announcement
const updateAnnouncement = async (
  announcementId,
  adminId,
  updateData,
  newMediaFiles = []
) => {
  try {
    await sql.begin(async (sql) => {
      // Upload new media files
      const uploadedMedia = await Promise.all(
        newMediaFiles.map(async (file) => {
          const uploadResult = await uploadToS3(file);
          return {
            url: uploadResult.url,
            key: uploadResult.key,
            type: file.mimetype.startsWith("image/")
              ? MediaType.IMAGE
              : file.mimetype.startsWith("video/")
              ? MediaType.VIDEO
              : MediaType.DOCUMENT,
          };
        })
      );

      // Retrieve existing announcement to check ownership
      const existingAnnouncement = await sql`
        SELECT * FROM announcements 
        WHERE id = ${announcementId} AND admin_id = ${adminId}
      `;

      if (!existingAnnouncement[0]) {
        throw new Error("Announcement not found or unauthorized");
      }

      // Update announcement details
      const updatedAnnouncement = await sql`
        UPDATE announcements
        SET 
          title = ${updateData.title || existingAnnouncement[0].title},
          content = ${updateData.content || existingAnnouncement[0].content},
          status = ${updateData.status || existingAnnouncement[0].status},
          updated_at = NOW()
        WHERE id = ${announcementId}
        RETURNING id;
      `;

      // Handle media updates if new files are uploaded
      if (uploadedMedia.length > 0) {
        // Delete existing media files from S3 if needed
        const existingMedia = await sql`
          SELECT media_key FROM announcement_media 
          WHERE announcement_id = ${announcementId}
        `;

        // Remove old S3 files
        await Promise.all(
          existingMedia.map((media) => deleteFromS3(media.media_key))
        );

        // Delete existing media entries
        await sql`
          DELETE FROM announcement_media 
          WHERE announcement_id = ${announcementId}
        `;

        // Insert new media
        await sql`
          INSERT INTO announcement_media (
            announcement_id,
            media_url,
            media_key,
            media_type
          ) VALUES ${sql(
            uploadedMedia.map((media) => [
              announcementId,
              media.url,
              media.key,
              media.type,
            ])
          )}
        `;
      }

      // Invalidate cache
      await redis.del(`announcements:list`);
      await redis.del(`announcements:recent`);
      await redis.del(`announcement:${announcementId}`);

      return updatedAnnouncement[0];
    });
  } catch (error) {
    console.error("Announcement Update Error:", error);
    throw error;
  }
};

// Delete Announcement
const deleteAnnouncement = async (announcementId, adminId) => {
  try {
    await sql.begin(async (sql) => {
      // Retrieve and delete media files from S3
      const mediaToDelete = await sql`
        SELECT media_key FROM announcement_media 
        WHERE announcement_id = ${announcementId}
      `;

      // Delete S3 files
      await Promise.all(
        mediaToDelete.map((media) => deleteFromS3(media.media_key))
      );

      // Delete announcement media entries
      await sql`
        DELETE FROM announcement_media 
        WHERE announcement_id = ${announcementId}
      `;

      // Delete announcement
      const deletedAnnouncement = await sql`
        DELETE FROM announcements 
        WHERE id = ${announcementId} AND admin_id = ${adminId}
        RETURNING id;
      `;

      if (!deletedAnnouncement[0]) {
        throw new Error("Announcement not found or unauthorized");
      }

      // Invalidate cache
      await redis.del(`announcements:list`);
      await redis.del(`announcements:recent`);
      await redis.del(`announcement:${announcementId}`);

      return deletedAnnouncement[0];
    });
  } catch (error) {
    console.error("Announcement Deletion Error:", error);
    throw error;
  }
};

// Get Announcements with Caching
const getAnnouncements = async (
  page = 1,
  limit = 10,
  status = AnnouncementStatus.PUBLISHED
) => {
  const cacheKey = `announcements:list:${page}:${limit}:${status}`;

  // Try to get from cache first
  const cachedAnnouncements = await redis.get(cacheKey);
  if (cachedAnnouncements) {
    return JSON.parse(cachedAnnouncements);
  }

  try {
    const offset = (page - 1) * limit;
    const announcements = await sql`
      SELECT 
        a.id, 
        a.title, 
        a.content, 
        a.created_at, 
        u.full_name as admin_name,
        (
          SELECT json_agg(
            json_build_object(
              'url', media_url, 
              'type', media_type
            )
          )
          FROM announcement_media 
          WHERE announcement_id = a.id
        ) as media
      FROM announcements a
      JOIN users u ON a.admin_id = u.id
      WHERE a.status = ${status}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Cache the result
    await redis.setex(
      cacheKey,
      3600, // 1 hour cache
      JSON.stringify(announcements)
    );

    return announcements;
  } catch (error) {
    console.error("Get Announcements Error:", error);
    throw error;
  }
};
// Cleanup Function for Announcements
const cleanupOldAnnouncements = async (options = {}) => {
  const { retentionDays = 14, status = AnnouncementStatus.PUBLISHED } = options;

  try {
    await sql.begin(async (sql) => {
      // Find old announcements to delete
      const oldAnnouncements = await sql`
        SELECT 
          id, 
          (
            SELECT json_agg(
              json_build_object(
                'media_key', media_key,
                'media_type', media_type
              )
            ) 
            FROM announcement_media 
            WHERE announcement_id = announcements.id
          ) as media_files
        FROM announcements
        WHERE 
          created_at < NOW() - INTERVAL '${retentionDays} days'
          AND status = ${status}
          AND status != 'pinned';
      `;

      // Early return if no old announcements
      if (oldAnnouncements.length === 0) {
        return {
          deletedCount: 0,
          message: "No old announcements to delete",
        };
      }

      // Prepare S3 deletion operations
      const s3DeletionPromises = oldAnnouncements.flatMap((announcement) =>
        (announcement.media_files || []).map((media) =>
          deleteFromS3(media.media_key)
        )
      );

      // Delete S3 files in parallel
      await Promise.all(s3DeletionPromises);

      // Delete announcement media entries
      await sql`
        DELETE FROM announcement_media
        WHERE announcement_id IN ${sql(oldAnnouncements.map((a) => a.id))}
      `;

      // Delete announcements
      const deletionResult = await sql`
        DELETE FROM announcements
        WHERE id IN ${sql(oldAnnouncements.map((a) => a.id))}
        RETURNING id;
      `;

      // Invalidate cache
      await redis.del("announcements:list");
      await redis.del("announcements:recent");

      return {
        deletedCount: deletionResult.length,
        message: `Deleted ${deletionResult.length} old announcements`,
      };
    });
  } catch (error) {
    console.error("Announcement Cleanup Error:", error);
    throw new Error("Failed to clean up old announcements");
  }
};
// Pin Announcement to Prevent Automatic Deletion
const pinAnnouncement = async (announcementId, adminId) => {
  try {
    const pinnedAnnouncement = await sql`
      UPDATE announcements
      SET 
        status = 'pinned',
        updated_at = NOW()
      WHERE 
        id = ${announcementId} 
        AND admin_id = ${adminId}
      RETURNING id;
    `;

    if (!pinnedAnnouncement[0]) {
      throw new Error("Announcement not found or unauthorized to pin");
    }

    // Invalidate cache
    await redis.del("announcements:list");

    return pinnedAnnouncement[0];
  } catch (error) {
    console.error("Pin Announcement Error:", error);
    throw error;
  }
};
// Unpin Announcement
const unpinAnnouncement = async (announcementId, adminId) => {
  try {
    const unpinnedAnnouncement = await sql`
      UPDATE announcements
      SET 
        status = ${AnnouncementStatus.PUBLISHED},
        updated_at = NOW()
      WHERE 
        id = ${announcementId} 
        AND admin_id = ${adminId}
      RETURNING id;
    `;

    if (!unpinnedAnnouncement[0]) {
      throw new Error("Announcement not found or unauthorized to unpin");
    }

    // Invalidate cache
    await redis.del("announcements:list");

    return unpinnedAnnouncement[0];
  } catch (error) {
    console.error("Unpin Announcement Error:", error);
    throw error;
  }
};
// Export modules
export {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  cleanupOldAnnouncements,
  pinAnnouncement,
  unpinAnnouncement,
  AnnouncementStatus,
  MediaType,
};
