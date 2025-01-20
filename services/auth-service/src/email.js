// test-email.js
require('dotenv').config(); // Make sure this is at the top
const EmailService = require('./services/nodemailer');
async function testEmail() {
  try {
    console.log('Starting email test...');
    console.log('Using email:', process.env.EMAIL_ACCOUNT);
    console.log('Using password:', process.env.EMAIL_PASSWORD)
    
    await EmailService.sendVerificationCode(
      'collinsnesh04@gmail.com', // Replace with your test email
      '123456'
    );
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', {
      name: error.name,
      message: error.message
    });
  }
}

testEmail();