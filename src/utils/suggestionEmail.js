const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();


//create transporter
const transporter =  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_ACCOUNT || "collinsentrepreneur@gmail.com",
      pass: process.env.EMAIL_PASSWORD || "ewpk ofve yoyo nhhn", 
      
    },
});

        //email template
const emailTemplates = {
    newSuggestion: (suggestion) => ({
      subject: 'New Suggestion Received',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Suggestion Submitted</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Title:</strong> ${suggestion.title}</p>
            <p><strong>Description:</strong> ${suggestion.description}</p>
            <p><strong>Submitted by:</strong> ${suggestion.isAnonymous ? 'Anonymous' : suggestion.userName}</p>
          </div>
          <p style="color: #666;">You can review this suggestion in your admin dashboard.</p>
        </div>
      `
    }),
  
    suggestionUpdate: (suggestion, userName) => ({
      subject: 'Your Suggestion Has Been Updated',
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
      `
    })
  };
  
  // Utility function to send suggestion notifications to all admins
export const notifyAdmins = async (suggestion, adminEmails) => {
    try {
      const emailPromises = adminEmails.map(email => 
        sendEmail({
          to: email,
          template: 'newSuggestion',
          data: suggestion
        })
      );
  
      await Promise.all(emailPromises);
      return true;
    } catch (error) {
      console.error('Error notifying admins:', error);
      throw new Error('Failed to notify admins');
    }
  };
  
  // Utility function to notify user of suggestion update
  export const notifyUser = async (suggestion, userEmail, userName) => {
    try {
      await sendEmail({
        to: userEmail,
        template: 'suggestionUpdate',
        data: {
          ...suggestion,
          userName
        }
      });
      return true;
    } catch (error) {
      console.error('Error notifying user:', error);
      throw new Error('Failed to notify user');
    }
  };
