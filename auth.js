// auth.js
const bcrypt = require('bcryptjs');
const { getUserByEmail } = require('./db');

async function authenticate(email, password) {
  const user = getUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

function generateMfaCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
}

module.exports = {
  authenticate,
  generateMfaCode
};
