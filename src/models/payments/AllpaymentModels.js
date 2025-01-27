const { sql } = require("../../config/database");
const { ValidationError, DatabaseError } = require("../errors");
const Mpesa = require("mpesa-node-api");
const Joi = require("joi");

// Initialize Mpesa
const mpesa = new Mpesa({
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  shortCode: process.env.MPESA_PAYBILL,
  lipaNaMpesaShortCode: process.env.MPESA_PAYBILL,
  lipaNaMpesaShortPass: process.env.MPESA_PASSKEY,
  securityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
});

// Validation schema
const paymentSchema = Joi.object({
  userId: Joi.string().required().guid({ version: "uuidv4" }),
  phoneNumber: Joi.string()
    .required()
    .pattern(/^254[0-9]{9}$/)
    .message("Phone number must be in format 254XXXXXXXXX"),
  amount: Joi.number()
    .required()
    .min(1)
    .message("Amount must be greater than 0"),
  purpose: Joi.string()
    .required()
    .valid(
      "TITHE",
      "OFFERING",
      "SPECIAL_OFFERING",
      "DEVELOPMENT_FUND",
      "Youth Ministry",
      "Women Ministry",
      "Men Ministrt"
    ),
  description: Joi.string().allow("", null),
});

class PaymentModel {
  static async initiateSTKPush(paymentData) {
    try {
      // Validate input data
      const { error, value } = paymentSchema.validate(paymentData);
      if (error) {
        throw new ValidationError(error.details[0].message, "VALIDATION_ERROR");
      }

      const { userId, phoneNumber, amount, purpose, description } = value;

      // Generate timestamp for the request
      const timestamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, -3);

      // Prepare STK push request
      const stkPushRequest = {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: Buffer.from(
          `${process.env.MPESA_PAYBILL}${process.env.MPESA_PASSKEY}${timestamp}`
        ).toString("base64"),
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: phoneNumber,
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: phoneNumber,
        CallBackURL: `${process.env.BASE_URL}/api/payments/mpesa-callback`,
        AccountReference: purpose, // Using purpose as account reference
        TransactionDesc: description || purpose,
      };

      // Initiate STK push
      const stkResponse = await mpesa.lipaNaMpesaOnline(stkPushRequest);

      if (!stkResponse.ResponseCode === "0") {
        throw new Error(`STK Push failed: ${stkResponse.ResponseDescription}`);
      }

      // Save payment record
      const [payment] = await sql`
        INSERT INTO payments (
          user_id,
          amount,
          purpose,
          description,
          phone_number,
          merchant_request_id,
          checkout_request_id,
          status,
          payment_date,
          payment_time,
          created_at,
          updated_at
        ) VALUES (
          ${userId},
          ${amount},
          ${purpose}::payment_purpose,
          ${description || null},
          ${phoneNumber},
          ${stkResponse.MerchantRequestID},
          ${stkResponse.CheckoutRequestID},
          'PENDING'::payment_status,
          CURRENT_DATE,
          CURRENT_TIME,
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      return {
        success: true,
        message: "STK push initiated successfully",
        data: {
          paymentId: payment.id,
          checkoutRequestId: payment.checkout_request_id,
          merchantRequestId: payment.merchant_request_id,
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `Error initiating STK push: ${error.message}`,
        "STK_PUSH_FAILED"
      );
    }
  }

  static async handleMpesaCallback(callbackData) {
    try {
      const {
        Body: {
          stkCallback: {
            ResultCode,
            ResultDesc,
            CheckoutRequestID,
            CallbackMetadata,
          },
        },
      } = callbackData;

      // Extract payment details from callback metadata
      let mpesaReceiptNumber = null;
      let transactionDate = null;

      if (CallbackMetadata && CallbackMetadata.Item) {
        CallbackMetadata.Item.forEach((item) => {
          if (item.Name === "MpesaReceiptNumber")
            mpesaReceiptNumber = item.Value;
          if (item.Name === "TransactionDate") transactionDate = item.Value;
        });
      }

      // Update payment status
      const [payment] = await sql`
        UPDATE payments
        SET 
          status = ${ResultCode === 0 ? "COMPLETED" : "FAILED"}::payment_status,
          mpesa_receipt_number = ${mpesaReceiptNumber},
          updated_at = NOW()
        WHERE checkout_request_id = ${CheckoutRequestID}
        RETURNING *
      `;

      if (!payment) {
        throw new ValidationError("Payment not found", "PAYMENT_NOT_FOUND");
      }

      // If payment successful, create notifications
      if (ResultCode === 0) {
        // Notify user
        await sql`
          INSERT INTO notifications (
            user_id,
            title,
            message,
            type
          ) VALUES (
            ${payment.user_id},
            'Payment Successful',
            ${`Your ${payment.purpose} payment of KES ${payment.amount} has been received. Receipt: ${mpesaReceiptNumber}`},
            'PAYMENT_SUCCESS'::notification_type
          )
        `;

        // Notify admins
        const admins = await sql`
          SELECT id FROM users WHERE role IN ('admin', 'super_admin')
        `;

        for (const admin of admins) {
          await sql`
            INSERT INTO notifications (
              user_id,
              title,
              message,
              type
            ) VALUES (
              ${admin.id},
              'New Payment Received',
              ${`${payment.purpose} payment of KES ${payment.amount} received. Receipt: ${mpesaReceiptNumber}`},
              'PAYMENT_SUCCESS'::notification_type
            )
          `;
        }
      }

      return {
        success: ResultCode === 0,
        message: ResultDesc,
        payment,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `Error handling M-Pesa callback: ${error.message}`,
        "CALLBACK_HANDLING_FAILED"
      );
    }
  }
}

module.exports = { PaymentModel };
