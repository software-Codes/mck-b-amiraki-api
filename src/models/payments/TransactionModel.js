const { parse } = require("dotenv");
const { sql } = require("../../config/database");
const { Message } = require("twilio/lib/twiml/MessagingResponse");

class TransactionModel {
  static async getUserTransactions(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    //get trana sactions with pagination
    const transactions = await sql`
        SELECT * FROM user_transaction_history
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
        `;

    // Get total count for pagination
    const [{ count }] = await sql`
         SELECT  COUNT(*) FROM payments
            WHERE user_id = ${userId}
         `;
    return {
      transactions,
      pagination: {
        total: parseInt(count),
        currentPage: page,
        totalPage: Math.ceil(count / limit),
      },
    };
  }

  //generate statement
  static async generateStatement(userId, startDate, endDate) {
    const transactions = await sql`
        SELECT * FROM user_transaction_history
        WHERE user_id = ${userId}
        AND created_at BETWEEN ${startDate} AND ${endDate}
        ORDER BY created_at DESC
        `;
    if (transactions.length === 0) {
      return {
        success: false,
        Message: "No transaction found within the specified date range",
      };
    }

    const statementPeriod = `${startDate}_to_${endDate}`;
    // Generate statement logic here
    // Store statement in user_statements table

    const [{ id }] = await sql`
        INSERT INTO user_statements (
            user_id, statement_period, file_url
        ) VALUES (
            ${userId},
            ${statementPeriod},
            ${fileUrl}
        ) RETURNING id
    `;
    return {
        success: true,
        statementId: id,
        fileUrl: fileUrl
    };
  }
}

module.exports = TransactionModel;
