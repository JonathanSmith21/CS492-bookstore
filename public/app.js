// public/app.js
// Front-end UI for CS492 Bookstore:
// - Auth (register, login, MFA, logout)
// - Role-based visibility (customer, clerk, owner, admin)
// - Inventory & admin management
// - Cart, checkout, invoices, order history

// ------------- Helper for JSON APIs -------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    // ignore JSON parse errors for empty responses
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// -------------------------------------
// Main UI wiring
// -------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Common elements
  const currentUserEl = document.getElementById('currentUser');
  const logoutBtn = document.getElementById('logoutBtn');

  const authMessageEl = document.getElementById('authMessage');
  const invMessageEl = document.getElementById('invMessage');
  const adminMessageEl = document.getElementById('adminMessage');

  const inventorySection = document.getElementById('inventory-section');
  const adminSection = document.getElementById('admin-section');

  // Auth elements
  const regEmail = document.getElementById('regEmail');
  const regPassword = document.getElementById('regPassword');
  const registerBtn = document.getElementById('registerBtn');

  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginBtn = document.getElementById('loginBtn');

  const mfaBox = document.getElementById('mfaBox');
  const mfaCodeInput = document.getElementById('mfaCode');
  const mfaBtn = document.getElementById('mfaBtn');

  // Inventory elements
  const bookTitleInput = document.getElementById('bookTitle');
  const bookAuthorInput = document.getElementById('bookAuthor');
  const bookIsbnInput = document.getElementById('bookIsbn');
  const bookPriceInput = document.getElementById('bookPrice');
  const bookQtyInput = document.getElementById('bookQty');
  const addBookBtn = document.getElementById('addBookBtn');
  const booksTableBody = document.getElementById('booksTableBody');

  // Admin elements
  const usersTableBody = document.getElementById('usersTableBody');
  const manualSyncBtn = document.getElementById('manualSyncBtn');

  // Cart / checkout elements
  const ccBooksTableBody = document.getElementById('cc-books-tbody');
  const ccBooksMessageEl = document.getElementById('cc-books-message');
  const ccLoadBooksBtn = document.getElementById('cc-load-books-btn');

  const ccCartTableBody = document.getElementById('cc-cart-tbody');
  const ccCartMessageEl = document.getElementById('cc-cart-message');
  const ccCartTotalEl = document.getElementById('cc-cart-total');

  const ccCheckoutForm = document.getElementById('cc-checkout-form');
  const ccPaymentMethodSelect = document.getElementById('cc-payment-method');
  const ccCheckoutMessageEl = document.getElementById('cc-checkout-message');
  const ccInvoiceDisplayEl = document.getElementById('cc-invoice-display');

  const ccLoadOrdersBtn = document.getElementById('cc-load-orders-btn');
  const ccOrdersTableBody = document.getElementById('cc-orders-tbody');

  // Local state
  let currentUser = null;

  // -------------------------------
  // Helper: update UI based on user
  // -------------------------------
  function updateUserUI(user) {
    currentUser = user || null;

    if (!user) {
      currentUserEl.textContent = 'Not logged in';
      logoutBtn.classList.add('hidden');
      inventorySection.classList.add('hidden');
      adminSection.classList.add('hidden');
      return;
    }

    currentUserEl.textContent = `${user.email} (role: ${user.role})`;
    logoutBtn.classList.remove('hidden');

    // Inventory visible for owner, salesClerk, systemAdmin
    if (
      user.role === 'storeOwner' ||
      user.role === 'salesClerk' ||
      user.role === 'systemAdmin'
    ) {
      inventorySection.classList.remove('hidden');
    } else {
      inventorySection.classList.add('hidden');
    }

    // Admin section visible only for systemAdmin
    if (user.role === 'systemAdmin') {
      adminSection.classList.remove('hidden');
    } else {
      adminSection.classList.add('hidden');
    }
  }

  // Fetch /api/me and update UI
  async function fetchMe() {
    try {
      const me = await api('/api/me');
      updateUserUI(me);
      if (me) {
        loadBooks();       // inventory table
        ccLoadCart();      // cart
      }
    } catch (err) {
      console.error(err);
      updateUserUI(null);
    }
  }

  // -------------------------------
  // AUTH: Register, login, MFA, logout
  // -------------------------------
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const email = regEmail.value.trim();
      const password = regPassword.value;

      authMessageEl.textContent = '';
      if (!email || !password) {
        authMessageEl.textContent = 'Email and password are required.';
        return;
      }

      try {
        const data = await api('/api/register', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        authMessageEl.textContent = `Registered user: ${data.email} (role: ${data.role})`;
        regEmail.value = '';
        regPassword.value = '';
      } catch (err) {
        console.error(err);
        authMessageEl.textContent = err.message || 'Registration failed.';
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = loginEmail.value.trim();
      const password = loginPassword.value;

      authMessageEl.textContent = '';
      mfaBox.classList.add('hidden');

      if (!email || !password) {
        authMessageEl.textContent = 'Email and password are required.';
        return;
      }

      try {
        const data = await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (data.mfaRequired) {
          // Admin login step 1
          authMessageEl.textContent = data.message || 'MFA required. Check server console.';
          mfaBox.classList.remove('hidden');
        } else {
          authMessageEl.textContent = 'Login successful.';
          loginEmail.value = '';
          loginPassword.value = '';
          await fetchMe();
        }
      } catch (err) {
        console.error(err);
        authMessageEl.textContent = err.message || 'Login failed.';
      }
    });
  }

  if (mfaBtn) {
    mfaBtn.addEventListener('click', async () => {
      const code = mfaCodeInput.value.trim();
      if (!code) {
        authMessageEl.textContent = 'Enter MFA code.';
        return;
      }

      try {
        const data = await api('/api/login/mfa', {
          method: 'POST',
          body: JSON.stringify({ code })
        });

        if (data.success) {
          authMessageEl.textContent = 'MFA verified. Login complete.';
          mfaCodeInput.value = '';
          mfaBox.classList.add('hidden');
          await fetchMe();
        } else {
          authMessageEl.textContent = 'MFA verification failed.';
        }
      } catch (err) {
        console.error(err);
        authMessageEl.textContent = err.message || 'MFA verification failed.';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST' });
      } catch (_) {
        // ignore
      }
      updateUserUI(null);
      authMessageEl.textContent = 'Logged out.';
      ccRenderCart({ items: [], cartTotal: 0 });
    });
  }

  // -------------------------------
  // INVENTORY
  // -------------------------------
  async function loadBooks() {
    if (!booksTableBody) return;
    try {
      const books = await api('/api/books');
      booksTableBody.innerHTML = '';
      books.forEach(book => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${book.title}</td>
          <td>${book.author || ''}</td>
          <td>${book.isbn}</td>
          <td>$${book.price.toFixed(2)}</td>
          <td>${book.quantity}</td>
        `;
        booksTableBody.appendChild(tr);
      });
      invMessageEl.textContent = '';
    } catch (err) {
      console.error(err);
      invMessageEl.textContent = err.message || 'Failed to load inventory.';
    }
  }

  if (addBookBtn) {
    addBookBtn.addEventListener('click', async () => {
      const title = bookTitleInput.value.trim();
      const author = bookAuthorInput.value.trim();
      const isbn = bookIsbnInput.value.trim();
      const price = parseFloat(bookPriceInput.value);
      const quantity = parseInt(bookQtyInput.value, 10);

      if (!title || !author || !isbn) {
        invMessageEl.textContent = 'Title, author, and ISBN are required.';
        return;
      }

      try {
        await api('/api/books', {
          method: 'POST',
          body: JSON.stringify({ title, author, isbn, price, quantity })
        });
        invMessageEl.textContent = 'Book added successfully.';
        bookTitleInput.value = '';
        bookAuthorInput.value = '';
        bookIsbnInput.value = '';
        bookPriceInput.value = '';
        bookQtyInput.value = '';
        loadBooks();
        ccLoadBooks(); // also refresh customer-facing book list
      } catch (err) {
        console.error(err);
        invMessageEl.textContent = err.message || 'Failed to add book.';
      }
    });
  }

  // -------------------------------
  // ADMIN: users + supplier sync
  // -------------------------------
  async function loadUsers() {
    if (!usersTableBody) return;
    try {
      const users = await api('/api/users');
      usersTableBody.innerHTML = '';
      users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td>
            <select data-user-id="${user.id}">
              <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>customer</option>
              <option value="salesClerk" ${user.role === 'salesClerk' ? 'selected' : ''}>salesClerk</option>
              <option value="storeOwner" ${user.role === 'storeOwner' ? 'selected' : ''}>storeOwner</option>
              <option value="systemAdmin" ${user.role === 'systemAdmin' ? 'selected' : ''}>systemAdmin</option>
            </select>
          </td>
        `;
        usersTableBody.appendChild(tr);
      });
      adminMessageEl.textContent = '';
    } catch (err) {
      console.error(err);
      adminMessageEl.textContent = err.message || 'Failed to load users.';
    }
  }

  if (usersTableBody) {
    usersTableBody.addEventListener('change', async evt => {
      const select = evt.target.closest('select[data-user-id]');
      if (!select) return;
      const userId = select.getAttribute('data-user-id');
      const role = select.value;

      try {
        await api(`/api/users/${userId}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role })
        });
        adminMessageEl.textContent = 'Role updated.';
        fetchMe();
      } catch (err) {
        console.error(err);
        adminMessageEl.textContent = err.message || 'Failed to update role.';
      }
    });
  }

  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      try {
        await api('/api/suppliers/sync', { method: 'POST' });
        adminMessageEl.textContent = 'Supplier sync completed.';
        loadBooks();
        ccLoadBooks();
      } catch (err) {
        console.error(err);
        adminMessageEl.textContent = err.message || 'Supplier sync failed.';
      }
    });
  }

  // -------------------------------
  // CART + CHECKOUT + ORDERS
  // -------------------------------
  let ccCart = { items: [], cartTotal: 0 };

  function ccRenderCart(cart) {
    ccCart = cart || { items: [], cartTotal: 0 };
    if (!ccCartTableBody || !ccCartTotalEl) return;

    ccCartTableBody.innerHTML = '';

    if (!ccCart.items || !ccCart.items.length) {
      ccCartMessageEl.textContent = 'Cart is currently empty.';
      ccCartTotalEl.textContent = 'Cart Total: $0.00';
      return;
    }

    ccCartMessageEl.textContent = '';
    ccCart.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.title}</td>
        <td>$${item.price.toFixed(2)}</td>
        <td>
          <input type="number" min="0" value="${item.quantity}"
                 style="width:60px;"
                 data-cc-cart-qty="${item.bookId}">
        </td>
        <td>$${item.lineTotal.toFixed(2)}</td>
        <td>
          <button data-cc-remove-from-cart="${item.bookId}">Remove</button>
        </td>
      `;
      ccCartTableBody.appendChild(tr);
    });

    ccCartTotalEl.textContent = `Cart Total: $${(ccCart.cartTotal || 0).toFixed(2)}`;
  }

  async function ccLoadCart() {
    if (!ccCartTableBody) return;
    try {
      const cart = await api('/api/cart');
      ccRenderCart(cart);
    } catch (err) {
      console.error(err);
      ccCartMessageEl.textContent = err.message || 'Failed to load cart.';
      ccCartTableBody.innerHTML = '';
      ccCartTotalEl.textContent = 'Cart Total: $0.00';
    }
  }

  async function ccLoadBooks() {
    if (!ccBooksTableBody) return;
    ccBooksMessageEl.textContent = 'Loading books...';
    ccBooksTableBody.innerHTML = '';
    try {
      const books = await api('/api/books');
      if (!books.length) {
        ccBooksMessageEl.textContent = 'No books in inventory.';
        return;
      }
      ccBooksMessageEl.textContent = '';
      books.forEach(book => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${book.title}</td>
          <td>${book.author || ''}</td>
          <td>$${book.price.toFixed(2)}</td>
          <td>${book.quantity}</td>
          <td>
            <button data-cc-add-to-cart="${book.id}">Add to Cart</button>
          </td>
        `;
        ccBooksTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      ccBooksMessageEl.textContent = err.message || 'Failed to load books.';
    }
  }

  async function ccAddToCart(bookId) {
    try {
      const cart = await api('/api/cart/add', {
        method: 'POST',
        body: JSON.stringify({ bookId, quantity: 1 })
      });
      ccRenderCart(cart);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to add to cart. Are you logged in?');
    }
  }

  async function ccUpdateCartQty(bookId, quantity) {
    try {
      const cart = await api('/api/cart/update', {
        method: 'POST',
        body: JSON.stringify({ bookId, quantity })
      });
      ccRenderCart(cart);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update cart.');
    }
  }

  async function ccRemoveFromCart(bookId) {
    try {
      const cart = await api('/api/cart/remove', {
        method: 'POST',
        body: JSON.stringify({ bookId })
      });
      ccRenderCart(cart);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to remove item.');
    }
  }

  async function ccCheckout(evt) {
    evt.preventDefault();
    ccCheckoutMessageEl.textContent = 'Processing checkout...';
    ccInvoiceDisplayEl.textContent = '';

    try {
      const paymentMethod = ccPaymentMethodSelect.value;
      const result = await api('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ paymentMethod })
      });

      ccCheckoutMessageEl.textContent =
        result.message || 'Order placed successfully.';
      if (result.invoice) {
        ccInvoiceDisplayEl.textContent = JSON.stringify(
          result.invoice,
          null,
          2
        );
      } else {
        ccInvoiceDisplayEl.textContent = 'No invoice returned.';
      }

      ccLoadCart();
    } catch (err) {
      console.error(err);
      ccCheckoutMessageEl.textContent = err.message || 'Checkout failed.';
    }
  }

  async function ccLoadOrders() {
    if (!ccOrdersTableBody) return;
    ccOrdersTableBody.innerHTML = '';
    try {
      const orders = await api('/api/orders/my');
      if (!orders.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="padding:6px;">No orders found.</td>`;
        ccOrdersTableBody.appendChild(tr);
        return;
      }

      orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${order.id}</td>
          <td>${order.transactionId}</td>
          <td>$${order.totalAmount.toFixed(2)}</td>
          <td>${order.paymentMethod}</td>
          <td>${order.createdAt}</td>
        `;
        ccOrdersTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="padding:6px; color:red;">${
        err.message || 'Failed to load orders.'
      }</td>`;
      ccOrdersTableBody.appendChild(tr);
    }
  }

  // Event wiring for cart UI
  if (ccLoadBooksBtn) {
    ccLoadBooksBtn.addEventListener('click', () => {
      ccLoadBooks();
    });
  }

  if (ccLoadOrdersBtn) {
    ccLoadOrdersBtn.addEventListener('click', () => {
      ccLoadOrders();
    });
  }

  if (ccBooksTableBody) {
    ccBooksTableBody.addEventListener('click', evt => {
      const btn = evt.target.closest('button[data-cc-add-to-cart]');
      if (!btn) return;
      const bookId = btn.getAttribute('data-cc-add-to-cart');
      ccAddToCart(bookId);
    });
  }

  if (ccCartTableBody) {
    ccCartTableBody.addEventListener('click', evt => {
      const btn = evt.target.closest('button[data-cc-remove-from-cart]');
      if (!btn) return;
      const bookId = btn.getAttribute('data-cc-remove-from-cart');
      ccRemoveFromCart(bookId);
    });

    ccCartTableBody.addEventListener('change', evt => {
      const input = evt.target.closest('input[data-cc-cart-qty]');
      if (!input) return;
      const bookId = input.getAttribute('data-cc-cart-qty');
      const qty = Number(input.value || 0);
      ccUpdateCartQty(bookId, qty);
    });
  }

  if (ccCheckoutForm) {
    ccCheckoutForm.addEventListener('submit', ccCheckout);
  }

  // Initial load
  fetchMe();
  ccLoadBooks();
  ccLoadCart();
});
