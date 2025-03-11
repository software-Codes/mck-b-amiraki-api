const { sql } = require("../../config/database");

class MediaContent {
  static async create({
    title,
    description,
    contentType,
    url,
    thumbnailUrl,
    uploadedBy,
    size,
    duration,
  }) {
    const query = `
      INSERT INTO media_contents (
        title,
        description,
        content_type,
        url,
        thumbnail_url,
        uploaded_by,
        size,
        duration,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, title, description, content_type, url, thumbnail_url, 
        uploaded_by, size, duration, created_at, updated_at,
        (SELECT name FROM users WHERE id = $6) AS uploaded_by_name
    `;
  
    const result = await sql(query, [
      title,
      description,
      contentType,
      url,
      thumbnailUrl,
      uploadedBy,
      size,
      duration,
    ]);
  
    return result[0];
  }
  static async findAll({ page = 1, limit = 10, contentType = null }) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT mc.*, u.full_name as uploader_name 
      FROM media_contents mc
      JOIN users u ON mc.uploaded_by = u.id
      WHERE mc.deleted_at IS NULL
    `;

    const params = [];
    if (contentType) {
      query += ` AND mc.content_type = $1`;
      params.push(contentType);
    }

    query += ` ORDER BY mc.created_at DESC LIMIT $${
      params.length + 1
    } OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    return await sql(query, params);
  }

  static async findById(id) {
    const query = `
      SELECT mc.*, u.full_name as uploader_name 
      FROM media_contents mc
      JOIN users u ON mc.uploaded_by = u.id
      WHERE mc.id = $1 AND mc.deleted_at IS NULL
    `;
    const result = await sql(query, [id]);
    return result[0];
  }

  static async delete(id, userId) {
    const query = `
      UPDATE media_contents 
      SET deleted_at = NOW(), 
          deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await sql(query, [id, userId]);
    return result[0];
  }

  static async updateViewCount(id) {
    const query = `
      UPDATE media_contents 
      SET views_count = views_count + 1 
      WHERE id = $1
      RETURNING views_count
    `;
    const result = await sql(query, [id]);
    return result[0];
  }
}

module.exports = { MediaContent };

