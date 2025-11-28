// db.js
// Simple in-memory "database" + roles for CS492-bookstore-server
// Use bcryptjs (already in package.json)

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// ---- Role Definitions ----
const ROLES = {
  STORE_OWNER: 'storeOwner',
  SALES_CLERK: 'salesClerk',
  SYSTEM_ADMIN: 'systemAdmin'
};

// ---- In-memory storage ----
const db = {
  users: []
};

// Simple ID generator (no extra deps needed)
let userIdCounter = 1;
function nextId() {
  return String(userIdCounter++);
}

// ---- Seed default users ----
// owner@bms.com  / Owner123!
// clerk@bms.com  / Clerk123!
// admin@bms.com  / Admin123!  (MFA-enabled)
function seed() {
  if (db.users.length > 0) return; // only seed once

  db.users.push({
    id: nextId(),
    email: 'owner@bms.com',
    passwordHash: bcrypt.hashSync('Owner123!', SALT_ROUNDS),
    role: ROLES.STORE_OWNER,
    mfaEnabled: false,
    mfaCode: null
  });

  db.users.push({
    id: nextId(),
    email: 'clerk@bms.com',
    passwordHash: bcrypt.hashSync('Clerk123!', SALT_ROUNDS),
    role: ROLES.SALES_CLERK,
    mfaEnabled: false,
    mfaCode: null
  });

  db.users.push({
    id: nextId(),
    email: 'admin@bms.com',
    passwordHash: bcrypt.hashSync('Admin123!', SALT_ROUNDS),
    role: ROLES.SYSTEM_ADMIN,
    mfaEnabled: true,   // admins require MFA
    mfaCode: null
  });
}

// ---- User helpers ----
function getUserByEmail(email) {
  return db.users.find(
    u => u.email.toLowerCase() === String(email).toLowerCase()
  );
}

function getUserById(id) {
  return db.users.find(u => u.id === String(id));
}

function createUser({ email, password, role }) {
  const existing = getUserByEmail(email);
  if (existing) throw new Error('Email already exists');

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const user = {
    id: nextId(),
    email,
    passwordHash,
    role,
    mfaEnabled: role === ROLES.SYSTEM_ADMIN,
    mfaCode: null
  };
  db.users.push(user);
  return user;
}

function listUsers() {
  return db.users.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
    mfaEnabled: u.mfaEnabled
  }));
}

function updateUserRole(id, role) {
  const user = getUserById(id);
  if (!user) throw new Error('User not found');
  user.role = role;
  user.mfaEnabled = role === ROLES.SYSTEM_ADMIN;
  return user;
}

module.exports = {
  db,
  ROLES,
  seed,
  getUserByEmail,
  getUserById,
  createUser,
  listUsers,
  updateUserRole
};
