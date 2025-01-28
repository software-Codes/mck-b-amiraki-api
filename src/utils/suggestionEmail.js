const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

//create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_ACCOUNT || "collinsentrepreneur@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "ewpk ofve yoyo nhhn",
  },
});

//email template
const emailTemplates = {
  newSuggestion: (suggestion) => ({
    subject: "New Suggestion Received",
    html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Suggestion Submitted</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Title:</strong> ${suggestion.title}</p>
            <p><strong>Description:</strong> ${suggestion.description}</p>
            <p><strong>Submitted by:</strong> ${
              suggestion.isAnonymous ? "Anonymous" : suggestion.userName
            }</p>
          </div>
          <p style="color: #666;">You can review this suggestion in your admin dashboard.</p>
        </div>
      `,
  }),

  suggestionUpdate: (suggestion, userName) => ({
    subject: "Your Suggestion Has Been Updated",
    html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${userName},</h2>
          <p>Your suggestion has been reviewed and updated.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Status:</strong> ${suggestion.status}</p>
            <p><strong>Admin Response:</strong> ${suggestion.adminResponse}</p>
          </div>
          <p style="color: #666;">Thank you for your contribution to our community!</p>
        </div>
      `,
  }),
  adminDashboardNotification: (suggestion) => ({
    subject: "Suggestion Requires Review",
    html: `
    <div style="...">
      <h2>New Suggestion Ready for Review</h2>
      <p><strong>ID:</strong> ${suggestion.id}</p>
      <p><strong>Submitted:</strong> ${new Date(
        suggestion.created_at
      ).toLocaleString()}</p>
      <p>View in dashboard: ${process.env.DASHBOARD_URL}/suggestions/${
      suggestion.id
    }</p>
    </div>
  `,
  }),
  suggestionDeleted: (suggestion) => ({
    subject: "Suggestion Deleted by User",
    html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h3 style="color: #dc3545;">Suggestion Deleted</h3>
      <p><strong>Title:</strong> ${suggestion.title}</p>
      <p><strong>Deleted At:</strong> ${new Date(
        suggestion.deletedAt
      ).toLocaleString()}</p>
      <p><strong>Original Submission Date:</strong> ${new Date(
        suggestion.created_at
      ).toLocaleString()}</p>
      <p style="color: #666;">This suggestion was permanently deleted by the user.</p>
    </div>
  `,
  }),
  directResponse: (suggestion, userName) => ({
    subject: "New Response to Your Suggestion",
    html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h3>Hello ${userName},</h3>
      <p>You've received a new response regarding your suggestion:</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
        <p><strong>Original Suggestion:</strong></p>
        <p>${suggestion.title}</p>
        <p>${suggestion.description}</p>
        <hr>
        <p><strong>Admin Response:</strong></p>
        <p>${suggestion.directMessage}</p>
      </div>
      <p style="margin-top: 20px; color: #666;">
        You can reply to this email directly or contact us through the app.
      </p>
    </div>
  `,
  }),
};

// Main send email function
const sendEmail = async ({ to, template, data, subject, html }) => {
  try {
    // Validate email address
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new Error("Invalid email address");
    }

    let emailContent;
    if (template && data) {
      // Use template if provided
      if (!emailTemplates[template]) {
        throw new Error("Invalid email template");
      }
      emailContent = emailTemplates[template](data);
    } else {
      // Use direct subject and html if provided
      emailContent = { subject, html };
    }

    // Send email
    const info = await transporter.sendMail({
      from:
        process.env.SMTP_FROM || '"Church App" "collinsentrepreneur@gmail.com"',
      to,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Utility function to send suggestion notifications to all admins
const notifyAdmins = async (suggestion, adminEmails) => {
  try {
    const emailPromises = adminEmails.map((email) =>
      sendEmail({
        to: email,
        template: "newSuggestion",
        data: suggestion,
      })
    );

    await Promise.all(emailPromises);
    return true;
  } catch (error) {
    console.error("Error notifying admins:", error);
    throw new Error("Failed to notify admins");
  }
};

// Utility function to notify user of suggestion update
 const notifyUser = async (suggestion, userEmail, userName) => {
  try {
    await sendEmail({
      to: userEmail,
      template: "suggestionUpdate",
      data: {
        ...suggestion,
        userName,
      },
    });
    return true;
  } catch (error) {
    console.error("Error notifying user:", error);
    throw new Error("Failed to notify user");
  }
};

module.exports = {
  sendEmail,
  notifyAdmins,
  notifyUser,
}
