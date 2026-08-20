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
  const user = getRequiredEnv('EMAIL_USER');
  const pass = getRequiredEnv('EMAIL_PASS');
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: true
    }
  });
}

module.exports = {
  getRequiredEnv,
  getPasswordSalt,
  createMailTransport
};
