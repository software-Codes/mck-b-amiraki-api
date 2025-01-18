// src/services/sendSms.js
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const formatPhoneNumber = (phoneNumber) => {
  // Remove any spaces or special characters
  const cleaned = phoneNumber.replace(/\s+/g, "").replace(/[^\d+]/g, "");

  // Ensure number starts with +
  if (!cleaned.startsWith("+")) {
    // Assume Kenyan number if no country code
    return cleaned.startsWith("0") ? `+254${cleaned.slice(1)}` : `+${cleaned}`;
  }
  return cleaned;
};

const sendVerificationCode = async (phoneNumber, code) => {
  const formattedNumber = formatPhoneNumber(phoneNumber);

  const messageTemplate = `Your verification code for Bishop Amiraki Church is: ${code}. This code will expire in 10 minutes.`;

  try {
    // Send SMS
    const smsMessage = await client.messages.create({
      body: messageTemplate,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber,
    });

        // // Send WhatsApp message
        // const whatsappMessage = await client.messages.create({
        // body: messageTemplate,
        // from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        // to: `whatsapp:${formattedNumber}`,
        // });

    return {
      success: true,
      smsId: smsMessage.sid,
    //   whatsappId: whatsappMessage.sid,
      phoneNumber: formattedNumber,
    };
  } catch (error) {
    console.error("Verification code sending failed:", error);
    throw new Error(`Failed to send verification code: ${error.message}`);
  }
};

// Verify if the code matches and hasn't expired
const verifyCode = async (code, storedCode, codeTimestamp) => {
  if (!storedCode || !codeTimestamp) {
    return false;
  }

  // Check if code has expired (10 minutes)
  const expirationTime = 10 * 60 * 1000; // 10 minutes in milliseconds
  const now = new Date();
  const codeTime = new Date(codeTimestamp);

  if (now - codeTime > expirationTime) {
    throw new Error("Verification code has expired");
  }

  return code === storedCode;
};

module.exports = {
  generateVerificationCode,
  sendVerificationCode,
  verifyCode,
  formatPhoneNumber,
};
