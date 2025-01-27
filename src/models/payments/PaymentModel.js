const { sql } = require("../../config/database");

class paymentModel {
  //get daiily payments summary
  static async getDailySummary(date) {
    return await sql`
        SELECT * FROM daily_payment_report 
        WHERE payment_date = ${date}
        ORDER BY purpose;
        `;
  }
  //Get payment summary by date range
  static async getPaymentsByDateRange(startDate, endDate, purpose = null) {
    const query = purpose
      ? sql`
        SELECT * FROM daily_payment_report
        WHERE payment_date BETWEEN ${startDate} AND ${endDate}
        AND purpose = ${purpose}
        ORDER BY payment_date;        
        `
      : sql`
        SELECT * FROM daily_payment_report
        WHERE payment_date BETWEEN ${startDate} AND ${endDate}
        ORDER BY payment_date;

        `;
    return await query;
  }

  //Send notification to admins

  static async notifyAdmins(paymentDetails) {
    const admins = await sql`
    SELECT u.email, u.fullName
     FROM users u
     JOIN admin_notification_preferences p ON u.id = p.admin_id
     WHERE u.role = 'admin'
     AND p.payment_alerts = true;
    `;
            // Return admin details for email notification processing
            return admins;
  }

}


module.exports = paymentModel;
