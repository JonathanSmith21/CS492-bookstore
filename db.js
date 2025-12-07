// db.js
// Simple in-memory "database" for CS492 Bookstore Management System
// Uses bcryptjs and supports:
// - Users with roles (storeOwner, salesClerk, systemAdmin, customer)
// - Books (inventory)
// - Suppliers + supplier-stock "feed"
// - Carts (per-user)

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// ---- Role Definitions ----
const ROLES = {
  STORE_OWNER: 'storeOwner',
  SALES_CLERK: 'salesClerk',
  SYSTEM_ADMIN: 'systemAdmin',
  CUSTOMER: 'customer' // new role for customer-type users
};

// ---- In-memory storage ----
const db = {
  users: [],
  books: [],
  suppliers: [],
  carts: {} // userId -> [ { bookId, quantity } ]
};

// Simple ID generator (string IDs)
let idCounter = 1;
function nextId() {
  return String(idCounter++);
}

// ---- Seed default data ----
function seed() {
  if (db.users.length > 0) return; // only seed once

  // Store Owner
  db.users.push({
    id: nextId(),
    email: 'owner@bms.com',
    passwordHash: bcrypt.hashSync('Owner123!', SALT_ROUNDS),
    role: ROLES.STORE_OWNER,
    mfaEnabled: false,
    mfaCode: null
  });

  // Sales Clerk
  db.users.push({
    id: nextId(),
    email: 'clerk@bms.com',
    passwordHash: bcrypt.hashSync('Clerk123!', SALT_ROUNDS),
    role: ROLES.SALES_CLERK,
    mfaEnabled: false,
    mfaCode: null
  });

  // System Admin (MFA enabled)
  db.users.push({
    id: nextId(),
    email: 'admin@bms.com',
    passwordHash: bcrypt.hashSync('Admin123!', SALT_ROUNDS),
    role: ROLES.SYSTEM_ADMIN,
    mfaEnabled: true, // admins require MFA
    mfaCode: null
  });

  // Demo Customer (can log in and behave like a shopper)
  db.users.push({
    id: nextId(),
    email: 'customer@bms.com',
    passwordHash: bcrypt.hashSync('Customer123!', SALT_ROUNDS),
    role: ROLES.CUSTOMER,
    mfaEnabled: false,
    mfaCode: null
  });

  // Suppliers
  db.suppliers.push({ id: 'sup1', name: 'Alpha Books' });
  db.suppliers.push({ id: 'sup2', name: 'Omega Publishing' });

  // Books
  db.books.push({
    id: nextId(),
    title: 'Sample Book A',
    author: 'Jane Doe',
    isbn: '111-A',
    price: 19.99,
    quantity: 2,
    reorderPoint: 5,
    supplierIds: ['sup1', 'sup2']
  });

  db.books.push({
    id: nextId(),
    title: 'Sample Book B',
    author: 'John Smith',
    isbn: '222-B',
    price: 24.5,
    quantity: 10,
    reorderPoint: 5,
    supplierIds: ['sup2']
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

// ---- Books (Inventory) ----
function listBooks() {
  return db.books;
}

function createBook(data) {
  const existing = db.books.find(b => b.isbn === data.isbn);
  if (existing) throw new Error('Book with this ISBN already exists');

  const price = Number(data.price);
  const quantity = Number(data.quantity);

  if (isNaN(price) || price <= 0 || isNaN(quantity) || quantity < 0) {
    throw new Error('Invalid price or quantity');
  }

  const book = {
    id: nextId(),
    title: data.title,
    author: data.author,
    isbn: data.isbn,
    price,
    quantity,
    reorderPoint: Number(data.reorderPoint || 5),
    supplierIds: data.supplierIds || []
  };
  db.books.push(book);
  return book;
}

function updateBook(id, data) {
  const idx = db.books.findIndex(b => b.id === String(id));
  if (idx === -1) throw new Error('Book not found');

  const price = Number(data.price);
  const quantity = Number(data.quantity);
  if (isNaN(price) || price <= 0 || isNaN(quantity) || quantity < 0) {
    throw new Error('Invalid price or quantity');
  }

  db.books[idx] = {
    ...db.books[idx],
    title: data.title,
    author: data.author,
    isbn: data.isbn,
    price,
    quantity
  };
  return db.books[idx];
}

function deleteBook(id) {
  db.books = db.books.filter(b => b.id !== String(id));
}

// ---- Suppliers & stock sync ----
function listSuppliers() {
  return db.suppliers;
}

function simulateSupplierFeed() {
  // Simulated “feed” of shipments by ISBN
  return [
    { supplierId: 'sup1', isbn: '111-A', shippedQty: 3 },
    { supplierId: 'sup1', isbn: '333-C', shippedQty: 5 }, // may not exist
    { supplierId: 'sup2', isbn: '222-B', shippedQty: 4 }
  ];
}

function applySupplierFeed(feed) {
  feed.forEach(entry => {
    const { supplierId, isbn, shippedQty } = entry;
    const book = db.books.find(b => b.isbn === isbn);
    if (!book) return;

    if (!book.supplierIds.includes(supplierId)) {
      book.supplierIds.push(supplierId);
    }
    book.quantity += shippedQty;
  });
}

// ----------------------
// Cart Helpers (per user)
// ----------------------

// Get cart items for a user. Always returns an array.
function getCart(userId) {
  if (!userId) return [];
  if (!db.carts[userId]) {
    db.carts[userId] = [];
  }
  return db.carts[userId];
}

// Replace entire cart for a user (used internally)
function setCart(userId, items) {
  db.carts[userId] = items || [];
  return db.carts[userId];
}

// Add an item (or increase quantity if already present)
function addToCart(userId, bookId, quantity = 1) {
  if (!userId) throw new Error('User ID is required for cart.');
  const cart = getCart(userId);

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive number.');
  }

  const existing = cart.find(item => item.bookId === String(bookId));
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ bookId: String(bookId), quantity: qty });
  }

  return cart;
}

// Update the quantity for a single item.
// If qty <= 0, remove the item from the cart.
function updateCartItem(userId, bookId, quantity) {
  const cart = getCart(userId);

  const qty = Number(quantity);
  const idx = cart.findIndex(item => item.bookId === String(bookId));
  if (idx === -1) return cart; // nothing to update

  if (isNaN(qty) || qty <= 0) {
    // remove item
    cart.splice(idx, 1);
  } else {
    cart[idx].quantity = qty;
  }

  return cart;
}

// Remove an item completely from the cart
function removeFromCart(userId, bookId) {
  const cart = getCart(userId);
  const filtered = cart.filter(item => item.bookId !== String(bookId));
  return setCart(userId, filtered);
}

// Clear cart (e.g., after successful checkout)
function clearCart(userId) {
  return setCart(userId, []);
}

// Calculate cart total and enrich items with book details
function getCartWithDetails(userId) {
  const cart = getCart(userId);

  const items = cart.map(item => {
    const book = db.books.find(b => b.id === String(item.bookId));
    if (!book) {
      return {
        bookId: item.bookId,
        title: 'Unknown',
        price: 0,
        quantity: item.quantity,
        lineTotal: 0
      };
    }
    const lineTotal = book.price * item.quantity;
    return {
      bookId: book.id,
      title: book.title,
      price: book.price,
      quantity: item.quantity,
      lineTotal
    };
  });

  const cartTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  return { items, cartTotal };
}

// ---- Exports ----
module.exports = {
  db,
  ROLES,
  seed,
  getUserByEmail,
  getUserById,
  createUser,
  listUsers,
  updateUserRole,
  listBooks,
  createBook,
  updateBook,
  deleteBook,
  listSuppliers,
  simulateSupplierFeed,
  applySupplierFeed,
  // cart exports
  getCart,
  setCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartWithDetails
};
