// --- Express app, sessions, routes, MFA, RBAC, inventory CRUD, supplier sync, cart. --- //
// server.js

const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');

const {
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
  // cart helpers
  getCart,
  setCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartWithDetails,
  // order helpers
  createOrder,
  listOrdersByUser,
  listAllOrders
} = require('./db');


const { authenticate, generateMfaCode } = require('./auth');
const { requireAuth, requireRole } = require('./rbac');

const app = express();

// Logging + parsing
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(
  session({
    secret: 'cs492-bookstore-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure: true, // enable when using HTTPS
      maxAge: 1000 * 60 * 60 // 1 hour
    }
  })
);

// Static front-end
app.use(express.static(path.join(__dirname, 'public')));

// Seed initial data
seed();

// ----------------------
// Auth / User Endpoints
// ----------------------

// Current user
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json(null);
  const user = getUserById(req.session.user.id);
  if (!user) {
    req.session.destroy(() => {});
    return res.json(null);
  }
  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    mfaVerified: !!req.session.mfaVerified
  });
});

// Register (creates Sales Clerk by default)
app.post('/api/register', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 8) {
      return res.status(400).json({
        error: 'Email and password (min 8 chars) required.'
      });
    }
    const user = createUser({
      email,
      password,
      role: ROLES.SALES_CLERK
    });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login (step 1: password, maybe MFA)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticate(email, password);
  if (!user) {
    return res.status(400).json({ error: 'Invalid credentials.' });
  }

  // MFA for system admins
  if (user.role === ROLES.SYSTEM_ADMIN && user.mfaEnabled) {
    const code = generateMfaCode();
    user.mfaCode = code;
    // In a real system, you would email/SMS this.
    // For this demo, log it so it can be tested:
    console.log(`MFA code for admin ${user.email}: ${code}`);
    req.session.pendingUserId = user.id;
    return res.json({
      mfaRequired: true,
      message: 'MFA required. Code sent (see server console in this demo).'
    });
  }

  // Normal login (no MFA)
  req.session.user = { id: user.id, email: user.email, role: user.role };
  req.session.mfaVerified = true;
  res.json({
    mfaRequired: false,
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// Login MFA (step 2 for admins)
app.post('/api/login/mfa', (req, res) => {
  const { code } = req.body;
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.status(400).json({ error: 'No MFA pending.' });

  const user = getUserById(pendingId);
  if (!user || !user.mfaCode) {
    return res.status(400).json({ error: 'Invalid MFA state.' });
  }

  if (user.mfaCode !== code) {
    return res.status(400).json({ error: 'Invalid MFA code.' });
  }

  user.mfaCode = null;
  req.session.pendingUserId = null;
  req.session.user = { id: user.id, email: user.email, role: user.role };
  req.session.mfaVerified = true;

  res.json({ success: true, user: { email: user.email, role: user.role } });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

// -------------------------
// CART ROUTES (per user)
// -------------------------

// Get cart with details (titles, prices, totals)
app.get('/api/cart', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const cart = getCartWithDetails(userId);
    res.json(cart);
  } catch (err) {
    console.error('Error getting cart:', err);
    res.status(500).json({ error: 'Failed to load cart' });
  }
});

// Add item to cart (or increase quantity)
app.post('/api/cart/add', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const { bookId, quantity } = req.body;

  if (!bookId) {
    return res.status(400).json({ error: 'bookId is required' });
  }

  try {
    addToCart(userId, bookId, quantity || 1);
    const cart = getCartWithDetails(userId);
    res.json(cart);
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(400).json({ error: err.message });
  }
});

// Update quantity for one item
app.post('/api/cart/update', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const { bookId, quantity } = req.body;

  if (!bookId) {
    return res.status(400).json({ error: 'bookId is required' });
  }

  try {
    updateCartItem(userId, bookId, quantity);
    const cart = getCartWithDetails(userId);
    res.json(cart);
  } catch (err) {
    console.error('Error updating cart item:', err);
    res.status(400).json({ error: err.message });
  }
});

// Remove an item from cart
app.post('/api/cart/remove', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json({ error: 'bookId is required' });
  }

  try {
    removeFromCart(userId, bookId);
    const cart = getCartWithDetails(userId);
    res.json(cart);
  } catch (err) {
    console.error('Error removing cart item:', err);
    res.status(400).json({ error: err.message });
  }
});

// -------------------------
// Checkout + Invoices
// -------------------------

// POST /api/checkout
// Uses current user's cart, simulates payment, creates an order, clears cart, and returns invoice.
app.post('/api/checkout', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const { paymentMethod } = req.body || {};

  try {
    const { items, cartTotal } = getCartWithDetails(userId);

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty. Cannot checkout.' });
    }

    // ---- Payment simulation ----
    // For now, always "succeeds". You could add logic here to simulate failures.
    const simulatedPaymentMethod = paymentMethod || 'CARD_SIM';
    const paymentStatus = 'APPROVED';

    // Create order / invoice
    const order = createOrder({
      userId,
      items,
      cartTotal,
      paymentMethod: simulatedPaymentMethod
    });

    // Clear cart after successful order
    clearCart(userId);

    // Return "invoice"
    res.json({
      success: true,
      message: 'Order placed successfully.',
      paymentStatus,
      invoice: {
        orderId: order.id,
        transactionId: order.transactionId,
        items: order.items,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt
      }
    });
  } catch (err) {
    console.error('Error during checkout:', err);
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

// GET /api/orders/my
// Returns list of orders for the currently-logged-in user
app.get('/api/orders/my', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const orders = listOrdersByUser(userId);
    res.json(orders);
  } catch (err) {
    console.error('Error loading orders:', err);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});


// -------------------------
// Inventory CRUD
// -------------------------

app.get(
  '/api/books',
  requireRole(ROLES.STORE_OWNER, ROLES.SALES_CLERK, ROLES.SYSTEM_ADMIN),
  (req, res) => {
    res.json(listBooks());
  }
);

app.post(
  '/api/books',
  requireRole(ROLES.STORE_OWNER, ROLES.SALES_CLERK, ROLES.SYSTEM_ADMIN),
  (req, res) => {
    try {
      const { title, author, isbn, price, quantity } = req.body;
      if (!title || !author || !isbn) {
        return res.status(400).json({
          error: 'Title, author, and ISBN are required.'
        });
      }
      const book = createBook({ title, author, isbn, price, quantity });
      res.json(book);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.put(
  '/api/books/:id',
  requireRole(ROLES.STORE_OWNER, ROLES.SALES_CLERK, ROLES.SYSTEM_ADMIN),
  (req, res) => {
    try {
      const { title, author, isbn, price, quantity } = req.body;
      const book = updateBook(req.params.id, {
        title,
        author,
        isbn,
        price,
        quantity
      });
      res.json(book);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.delete(
  '/api/books/:id',
  requireRole(ROLES.STORE_OWNER, ROLES.SALES_CLERK, ROLES.SYSTEM_ADMIN),
  (req, res) => {
    deleteBook(req.params.id);
    res.json({ success: true });
  }
);

// -------------------------
// Admin Role Management
// -------------------------

app.get('/api/users', requireRole(ROLES.SYSTEM_ADMIN), (req, res) => {
  res.json(listUsers());
});

app.put('/api/users/:id/role', requireRole(ROLES.SYSTEM_ADMIN), (req, res) => {
  try {
    const { role } = req.body;
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    const user = updateUserRole(req.params.id, role);
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------
// Supplier Integration
// -------------------------

app.get(
  '/api/suppliers',
  requireRole(ROLES.STORE_OWNER, ROLES.SALES_CLERK, ROLES.SYSTEM_ADMIN),
  (req, res) => {
    res.json(listSuppliers());
  }
);

app.post('/api/suppliers/sync', requireRole(ROLES.SYSTEM_ADMIN), (req, res) => {
  const feed = simulateSupplierFeed();
  applySupplierFeed(feed);
  res.json({ success: true, feed });
});

// -------------------------
// Start server
// -------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CS492 Bookstore server running on http://localhost:${PORT}`);
  console.log('Seeded users:');
  console.log('  Store Owner: owner@bms.com / Owner123!');
  console.log('  Sales Clerk: clerk@bms.com / Clerk123!');
  console.log('  System Admin (MFA): admin@bms.com / Admin123!');
});
