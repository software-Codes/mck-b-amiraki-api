class NotificationModel {
  static async getUserNotifications(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const notifications = await sql`
        SELECT * FROM notifications
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
        `;

    const [{ count }] = await sql`
        SELECT COUNT(*) FROM notifications
        WHERE user_id = ${userId}
        `;

    return {
      notifications,
      pagination: {
        total: parseInt(count),
        currentPage: page,
        totalPage: Math.ceil(count / limit),
      },
    };
  }

  static async markAsRead(notificationId, userId) {
    return await sql`
        UPDATE notifications
        SET is_read = true
        WHERE id = ${notificationId}
        AND user_id = ${userId}
        `;
  }

  static async createSystemNotification(userId, message, title) {
    return await sql`
    INSERT INTO notifications(user_id, message, title, type
    )VALUES(
    ${userId}, ${message}, ${title}, 'SYSTEM_ALERT'
    )RETURNING id
    
    `;
  }
}

module.exports = NotificationModel;
