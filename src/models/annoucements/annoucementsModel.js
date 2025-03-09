const { sql } = require("../../config/database");

// Announcement Status
const AnnouncementStatus = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  PINNED: "pinned",
};

/**
 * Create a new announcement
 * @param {Object} params - Parameters for announcement creation
 * @param {string} params.adminId - ID of the admin creating the announcement
 * @param {string} params.title - Title of the announcement
 * @param {string} params.content - Content of the announcement
 * @returns {Promise<Object>} - Created announcement details
 * @throws {Error} - Throws if database operation fails
 */
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

    return { id: result[0].id };
  } catch (error) {
    console.error("Announcement Creation Error:", error);
    throw error;
  }
};

/**
 * Update an existing announcement
 * @param {string} announcementId - ID of the announcement to update
 * @param {string} adminId - ID of the admin performing the update
 * @param {Object} updateData - Data to update
 * @param {string} [updateData.title] - New title of the announcement
 * @param {string} [updateData.content] - New content of the announcement
 * @param {string} [updateData.status] - New status of the announcement
 * @returns {Promise<Object>} - Updated announcement details
 * @throws {Error} - Throws if update fails or announcement not found
 */
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

    return result[0];
  } catch (error) {
    console.error("Update Announcement Error:", error);
    throw error;
  }
};

/**
 * Delete an announcement
 * @param {string} announcementId - ID of the announcement to delete
 * @param {string} adminId - ID of the admin performing the deletion
 * @returns {Promise<Object>} - Deleted announcement details
 * @throws {Error} - Throws if deletion fails or announcement not found
 */
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

    return result[0];
  } catch (error) {
    console.error("Delete Announcement Error:", error);
    throw error;
  }
};

/**
 * Retrieve announcements with pagination
 * @param {number} [page=1] - Page number for pagination
 * @param {number} [limit=10] - Number of items per page
 * @param {string} [status=PUBLISHED] - Filter by announcement status
 * @returns {Promise<Object>} - Object containing announcements and pagination details
 * @throws {Error} - Throws if query execution fails
 */
const getAnnouncements = async (
  page = 1,
  limit = 10,
  status = AnnouncementStatus.PUBLISHED
) => {
  const offset = (page - 1) * limit;

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

    return result;
  } catch (error) {
    console.error("Fetch Announcements Error:", error);
    throw error;
  }
};

/**
 * Pin an announcement to make it appear at the top
 * @param {string} announcementId - ID of the announcement to pin
 * @param {string} adminId - ID of the admin performing the action
 * @returns {Promise<Object>} - Pinned announcement details
 * @throws {Error} - Throws if operation fails or announcement not found
 */
const pinAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      UPDATE announcements
      SET status = 'pinned', updated_at = NOW()
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;
    if (!result[0]) throw new Error("Announcement not found");
    return result[0];
  } catch (error) {
    console.error("Pin Error:", error);
    throw error;
  }
};

/**
 * Unpin an announcement to remove it from the top position
 * @param {string} announcementId - ID of the announcement to unpin
 * @param {string} adminId - ID of the admin performing the action
 * @returns {Promise<Object>} - Unpinned announcement details
 * @throws {Error} - Throws if operation fails or announcement not found
 */
const unpinAnnouncement = async (announcementId, adminId) => {
  try {
    const result = await sql`
      UPDATE announcements
      SET status = 'published', updated_at = NOW()
      WHERE id = ${announcementId} AND admin_id = ${adminId}
      RETURNING id;
    `;
    if (!result[0]) throw new Error("Announcement not found");
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