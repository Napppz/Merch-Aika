const nodemailer = require('nodemailer');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getPasswordSalt() {
  return getRequiredEnv('PASSWORD_SALT');
}

function createMailTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: getRequiredEnv('EMAIL_USER'),
      pass: getRequiredEnv('EMAIL_PASS')
    }
  });
}

module.exports = {
  getRequiredEnv,
  getPasswordSalt,
  createMailTransport
};
