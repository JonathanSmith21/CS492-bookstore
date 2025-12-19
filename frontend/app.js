// Minimal storefront app using localStorage for persistence.
(function(){
    // --- SEARCH FEATURE ---
    const searchBar = document.getElementById('search-bar');
    const searchResults = document.getElementById('search-results');
    if(searchBar) searchBar.addEventListener('input',function(){
      const q = searchBar.value.trim().toLowerCase();
      if(!q){searchResults.innerHTML='';return;}
      const found = inventory.filter(b=>
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.desc && b.desc.toLowerCase().includes(q)) ||
        (b.isbn && b.isbn.toLowerCase().includes(q)) ||
        (!isNaN(Number(q)) && Number(b.price) === Number(q))
      );
      renderSearchResults(found);
    });

    function renderSearchResults(list){
      const user = users.find(u=>u.username===currentUser?.username);
      const isAdmin = user && user.admin;
      searchResults.innerHTML = '';
      if(list.length===0){searchResults.textContent = 'No books found.';return;}
      list.forEach((b,i)=>{
        const div = document.createElement('div');
        div.className = 'search-book';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '8px';
        div.innerHTML = `<span><strong>${escapeHtml(b.title)}</strong> ($${b.price.toFixed(2)})<br><span style='font-size:12px;color:#555'>ISBN: ${escapeHtml(b.isbn||'')}</span><br><span style='font-size:12px;color:#555'>${escapeHtml(b.desc)}</span></span>`;
        if(isAdmin){
          // Edit form for admin
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.textContent = 'Edit';
          editBtn.style.marginLeft = '12px';
          editBtn.onclick = function(){ openEditBook(b); };
          div.appendChild(editBtn);
        }else{
          // Add to cart for client
          const buyBtn = document.createElement('button');
          buyBtn.type = 'button';
          buyBtn.textContent = 'Add to cart';
          buyBtn.style.marginLeft = '12px';
          buyBtn.onclick = function(){ addToCart(b.id); };
          div.appendChild(buyBtn);
        }
        searchResults.appendChild(div);
      });
    }

    // --- ADMIN BOOK EDIT ---
    function openEditBook(book){
      // Show inline edit form
      searchResults.innerHTML = '';
      const form = document.createElement('form');
      form.style.background = '#fff';
      form.style.padding = '16px';
      form.style.borderRadius = '8px';
      form.style.boxShadow = '0 2px 8px #0001';
      form.innerHTML = `<h4>Edit Book</h4>
        <label>Title<br><input type='text' id='edit-title' value='${escapeHtml(book.title)}' style='width:80%'></label><br>
        <label>ISBN<br><input type='text' id='edit-isbn' value='${escapeHtml(book.isbn||'')}' style='width:60%'></label><br>
        <label>Price<br><input type='number' id='edit-price' value='${book.price}' min='0' step='0.01' style='width:40%'></label><br>
        <label>Stock<br><input type='number' id='edit-stock' value='${book.stock||1}' min='1' step='1' style='width:30%'></label><br>
        <label>Description<br><input type='text' id='edit-desc' value='${escapeHtml(book.desc)}' style='width:80%'></label><br>
        <button type='submit'>Save</button> <button type='button' id='cancel-edit'>Cancel</button>`;
      form.onsubmit = function(e){
        e.preventDefault();
        book.title = document.getElementById('edit-title').value.trim();
        book.isbn = document.getElementById('edit-isbn').value.trim();
        book.price = parseFloat(document.getElementById('edit-price').value);
        book.stock = parseInt(document.getElementById('edit-stock').value, 10);
        book.desc = document.getElementById('edit-desc').value.trim();
        if(isNaN(book.stock) || book.stock < 1) { alert('Stock must be at least 1'); return; }
        const token = localStorage.getItem('cs_customer_token');
        const user = users.find(u=>u.username===currentUser?.username);
        if(apiAvailable && token && user && user.admin){
          fetchWithAuth('/api/inventory/' + String(book.id),{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({title:book.title,isbn:book.isbn,description:book.desc,price:book.price,stock:book.stock})
          }).then(()=>{ loadInventoryFromAPI(); searchBar.value = ''; searchResults.innerHTML = ''; })
            .catch(()=>{ saveJSON(inventoryKey,inventory); renderProducts(); searchBar.value = ''; searchResults.innerHTML = ''; });
        }else{
          saveJSON(inventoryKey,inventory);
          renderProducts();
          searchBar.value = '';
          searchResults.innerHTML = '';
        }
      };
      form.querySelector('#cancel-edit').onclick = function(){ searchBar.value = ''; searchResults.innerHTML = ''; };
      searchResults.appendChild(form);
    }
  const storage = {
    cartKey: 'cs_customer_cart',
    ordersKey: 'cs_customer_orders',
    userKey: 'cs_customer_user'
  };

  // --- LOGIN SYSTEM ---
  let currentUser = null;
  const loginPanel = document.getElementById('login-panel');
  const appPanel = document.getElementById('app-panel');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const mfaBtn = document.getElementById('setup-mfa-btn');  // May not exist, that's OK

  // Verify DOM elements exist
  if(!loginForm) console.error('[INIT] loginForm not found!');
  if(!loginPanel) console.error('[INIT] loginPanel not found!');
  if(!appPanel) console.error('[INIT] appPanel not found!');

  // Load users.json (local file)
  let users = [];
  // API base (backend runs on localhost:3001 by default)
  const API_BASE = 'http://localhost:3001';
  let apiAvailable = false;
  // try health endpoint to detect backend and load remote inventory when available - wait with timeout
  const healthCheck = fetch(API_BASE + '/api/health', {method:'GET',timeout:3000}).then(r=>r.json()).then(()=>{ apiAvailable = true; loadInventoryFromAPI(); return true; }).catch(()=>{ apiAvailable = false; return false; });
  fetch('users.json').then(r=>r.json()).then(data=>{users=data;}).catch(()=>{users=[];});
  
  // Wait for health check or 3 second timeout before initializing login
  Promise.race([healthCheck, new Promise(resolve=>setTimeout(resolve,3000))]).then(()=>initLogin());

  function initLogin(){
    console.log('[INIT] initLogin called');
    // Check session
    const u = loadJSON(storage.userKey);
    if(u){currentUser=u;showApp();}else{showLogin();}
    
    if(!loginForm) {
      console.error('[LOGIN] loginForm is null, cannot attach submit listener');
      return;
    }
    
    loginForm.addEventListener('submit',async function(e){
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      loginError.style.display = 'none';
      console.log('[LOGIN] Form submitted, username:', username, 'apiAvailable:', apiAvailable);
      if(apiAvailable){
        try {
          console.log('[LOGIN] Sending request to backend');
          const r = await fetch(API_BASE + '/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
          console.log('[LOGIN] Response received, status:', r.status);
          const res = await r.json();
          console.log('[LOGIN] Parsed response:', res);
          if(res && res.ok){
            console.log('[LOGIN] Login successful');
            // Store full backend user info
            currentUser = res.user;
            saveJSON(storage.userKey,currentUser);
            if(res.token) localStorage.setItem('cs_customer_token', res.token);
            // Sync cart from backend after login
            console.log('[LOGIN] Syncing cart from server');
            await syncCartFromServer();
            console.log('[LOGIN] Cart synced, showing app');
            showApp();
          }else{
            loginError.textContent = res && res.error ? res.error : 'Invalid username or password.';
            loginError.style.display = 'block';
            console.error('[LOGIN] Backend login failed:', res);
          }
        } catch(err) {
          // fallback to local
          console.error('[LOGIN] Backend error, falling back to local:', err);
          const user = users.find(u=>u.username===username && u.password===password);
          if(user){ 
            console.log('[LOGIN] Local fallback succeeded for', username);
            currentUser = {username:user.username, admin: !!user.admin}; 
            saveJSON(storage.userKey,currentUser); 
            showApp(); 
          }
          else{ 
            loginError.textContent = 'Invalid username or password.'; 
            loginError.style.display = 'block'; 
            console.error('[LOGIN] Local fallback also failed');
          }
        }
      }else{
        console.log('[LOGIN] No API available, using local authentication');
        const user = users.find(u=>u.username===username && u.password===password);
        if(user){ 
          console.log('[LOGIN] Local auth succeeded');
          currentUser = {username:user.username, admin: !!user.admin}; 
          saveJSON(storage.userKey,currentUser); 
          showApp(); 
        }
        else{ 
          loginError.textContent = 'Invalid username or password.'; 
          loginError.style.display = 'block'; 
          console.error('[LOGIN] Local auth failed, user not found');
        }
      }
    });
    // Registration logic
    const registerForm = document.getElementById('register-form');
    const registerError = document.getElementById('register-error');
    if(registerForm) registerForm.addEventListener('submit',function(e){
      e.preventDefault();
      const username = document.getElementById('register-username').value.trim();
      const password = document.getElementById('register-password').value;
      const confirm = document.getElementById('register-confirm').value;
      if(!username || !password){registerError.textContent='All fields required.';registerError.style.display='block';return;}
      if(password!==confirm){registerError.textContent='Passwords do not match.';registerError.style.display='block';return;}
      if(users.find(u=>u.username===username)){registerError.textContent='Username already exists.';registerError.style.display='block';return;}
      registerError.style.display='none';
      console.log('[REGISTER] Attempting registration for', username);
      if(apiAvailable){
        console.log('[REGISTER] Sending to backend');
        fetch(API_BASE + '/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})})
          .then(r=>{
            console.log('[REGISTER] Backend response status:', r.status);
            return r.json();
          })
          .then(res=>{
            console.log('[REGISTER] Backend response:', res);
            if(res && res.ok){
              console.log('[REGISTER] Backend registration successful');
              currentUser = {username:res.user.username, admin: res.user.role==='admin'};
              saveJSON(storage.userKey,currentUser);
              if(res.token) localStorage.setItem('cs_customer_token', res.token);
              if(!users.find(u=>u.username===currentUser.username)) users.push({username:currentUser.username,admin:currentUser.admin});
              showApp();
            }else{
              console.log('[REGISTER] Backend failed, doing local fallback');
              // fallback to local registration
              users.push({username,password});
              localStorage.setItem('cs_customer_users',JSON.stringify(users));
              currentUser = {username}; saveJSON(storage.userKey,currentUser); showApp();
            }
          }).catch(err=>{
            console.error('[REGISTER] Backend error, doing local fallback:', err);
            users.push({username,password});
            localStorage.setItem('cs_customer_users',JSON.stringify(users));
            currentUser = {username}; saveJSON(storage.userKey,currentUser); showApp();
          });
      }else{
        console.log('[REGISTER] No API, using local registration');
        users.push({username,password});
        localStorage.setItem('cs_customer_users',JSON.stringify(users));
        currentUser = {username}; saveJSON(storage.userKey,currentUser); showApp();
      }
    });
  }

  // Logout button handler (outside initLogin so it's always registered)
  if(logoutBtn) {
    logoutBtn.addEventListener('click',function(e){
      console.log('[LOGOUT] Logout button clicked');
      e.preventDefault();
      currentUser = null;
      localStorage.removeItem(storage.userKey);
      localStorage.removeItem('cs_customer_token');
      console.log('[LOGOUT] Cleared user session, showing login');
      showLogin();
    });
  } else {
    console.error('[LOGOUT] Logout button not found!');
  }

  function showLogin(){
    loginPanel.style.display = 'block';
    appPanel.style.display = 'none';
    loginError.style.display = 'none';
    loginForm.reset();
    // Hide reports tab when not logged in
    const reportsBtn = document.getElementById('tab-reports');
    if(reportsBtn) reportsBtn.style.display = 'none';
    if(mfaBtn) mfaBtn.style.display = 'none';
  }
  function showApp(){
    loginPanel.style.display = 'none';
    appPanel.style.display = 'block';
    // Always trust backend user info for admin
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.admin === true);
    document.getElementById('admin-books-panel').style.display = isAdmin ? 'block' : 'none';
    if(isAdmin) renderAdminBooks();
    // Show/hide Reports tab based on admin status
    const reportsBtn = document.getElementById('tab-reports');
    const reportsSection = document.getElementById('reports');
    if(reportsBtn) reportsBtn.style.display = isAdmin ? 'inline-block' : 'none';
    // ensure non-admins aren't viewing the reports tab
    if(!isAdmin){
      if(reportsSection) reportsSection.style.display = 'none';
      // switch to shop tab if reports was active
      const active = document.querySelector('nav button.active');
      if(active && active.id==='tab-reports') showTab('shop');
    }
    if(mfaBtn) mfaBtn.style.display = currentUser ? 'inline-block' : 'none';
  }

  // Inventory: load/save from localStorage for admin changes
  const defaultInventory = [
    {id:'b1',title:'The Pragmatic Programmer',price:29.99,desc:'Classic dev book',img:''},
    {id:'b2',title:'Eloquent JavaScript',price:24.50,desc:'Modern JS guide',img:''},
    {id:'b3',title:'You Don\'t Know JS',price:19.00,desc:'Deep dive into JS',img:''},
    {id:'b4',title:'Clean Code',price:32.00,desc:'Writing readable code',img:''}
  ];
  const inventoryKey = 'cs_customer_inventory';
  let inventory = loadJSON(inventoryKey) || defaultInventory.slice();

  // State
  let cart = loadJSON(storage.cartKey) || {};
  let orders = loadJSON(storage.ordersKey) || [];

  // DOM refs
  const productsEl = document.getElementById('products');
  const prodT = document.getElementById('product-template');
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutModal = document.getElementById('checkout-modal');
  const orderSummary = document.getElementById('order-summary');
  const payBtn = document.getElementById('pay-btn');
  const cancelPay = document.getElementById('cancel-pay');

  // --- REPORT PDF FUNCTION ---
  function reportPDF(){
    try {
      const user = users.find(u=>u.username===currentUser?.username);
      if(!user || !user.admin){alert('Not authorized');return}
      if(!currentReport){alert('Run report first');return}
      // Use jsPDF for PDF generation
      if(typeof window.jspdf === 'undefined'){
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = reportPDF;
        document.body.appendChild(script);
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Daily Sales Report', 10, 15);
      doc.setFontSize(12);
      doc.text(`Date: ${currentReport.date}`, 10, 25);
      doc.text(`Total Sales: $${currentReport.totals.toFixed(2)}`, 10, 35);
      doc.text(`Orders: ${currentReport.orders.length}`, 10, 45);
      doc.text('Top Sellers:', 10, 55);
      (currentReport.top||[]).forEach((t,i)=>{
        doc.text(`${i+1}. ${t[0]} — ${t[1]}`, 15, 65+i*8);
      });
      let y = 65 + (currentReport.top||[]).length*8 + 10;
      doc.text('Order List:', 10, y);
      y += 8;
      doc.text('OrderID   Date                Total', 10, y);
      y += 6;
      currentReport.orders.forEach(o=>{
        doc.text(`${o.id}   ${new Date(o.created_at||o.date).toLocaleString()}   $${o.total.toFixed(2)}`, 10, y);
        y += 6;
        if(y > 270){ doc.addPage(); y = 15; }
      });
      doc.save(`report-${currentReport.date}.pdf`);
    } catch (err) {
      alert('PDF export failed: ' + (err && err.message ? err.message : err));
    }
  }

  // Tabs
  document.getElementById('tab-shop').addEventListener('click',function(e){e.preventDefault();showTab('shop');});
  document.getElementById('tab-orders').addEventListener('click',function(e){e.preventDefault();showTab('orders');});
  document.getElementById('tab-reports').addEventListener('click',function(e){e.preventDefault();showTab('reports');});

  document.getElementById('export-orders-pdf').addEventListener('click',function(e){e.preventDefault();exportOrdersPDF();});
  document.getElementById('clear-orders').addEventListener('click',function(e){e.preventDefault();clearOrders();});
  document.getElementById('run-report').addEventListener('click',function(e){e.preventDefault();runReport();});
  // Removed export-report-csv button and logic
  // Removed print-report button and logic
  document.getElementById('report-pdf').addEventListener('click',function(e){e.preventDefault();reportPDF();});

  renderProducts();
  renderCart();
  renderOrdersList();

  checkoutBtn.addEventListener('click',openCheckout);
  payBtn.addEventListener('click',doPayment);
  cancelPay.addEventListener('click',()=>checkoutModal.style.display='none');

  // helpers
  function loadJSON(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}
  function saveJSON(k,v){localStorage.setItem(k,JSON.stringify(v))}

  // Helper to call backend endpoints with Authorization header when token present
  function fetchWithAuth(path, opts){
    opts = opts || {};
    opts.headers = opts.headers || {};
    const token = localStorage.getItem('cs_customer_token');
    if(token) opts.headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, opts);
  }

  // Load inventory from API when available and normalize to local shape
  async function loadInventoryFromAPI(){
    try{
      const resp = await fetch(API_BASE + '/api/inventory');
      if(!resp.ok) return;
      const list = await resp.json();
      // normalize fields: id (string), title, price, desc, isbn
      inventory = list.map(i=>({id:String(i.id), title:i.title, isbn:i.isbn, price:parseFloat(i.price||0), desc:i.description||'', stock: i.stock}));
      saveJSON(inventoryKey,inventory);
      renderProducts();
      // if logged in, sync cart from server
      const user = loadJSON(storage.userKey);
      if(user && localStorage.getItem('cs_customer_token')) await syncCartFromServer();
    }catch(e){ console.warn('Failed to load inventory from API',e); }
  }

  // Sync local cart state from server-side cart
  async function syncCartFromServer(){
    try{
      const resp = await fetchWithAuth('/api/cart');
      if(!resp.ok) return;
      const rows = await resp.json();
      // rows: [{book_id,title,price,qty}]
      cart = {};
      rows.forEach(r=>{ cart[String(r.book_id)] = r.qty; });
      saveJSON(storage.cartKey,cart);
      renderCart();
    }catch(e){ console.warn('syncCart failed',e); }
  }

  function renderProducts(){
    productsEl.innerHTML='';
    inventory.forEach(p=>{
      const node = prodT.content.cloneNode(true);
      const el = node.querySelector('.product');
      el.querySelector('img').src = p.img || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96"><rect width="72" height="96" fill="%23ddd"/></svg>';
      el.querySelector('h4').textContent = p.title;
      el.querySelector('.price').textContent = '$' + p.price.toFixed(2);
      el.querySelector('.desc').textContent = p.desc;
      el.querySelector('.add-btn').addEventListener('click',()=>{addToCart(p.id)});
      productsEl.appendChild(node);
    });
    // If admin, re-render admin books list
    const user = users.find(u=>u.username===currentUser?.username);
    if(user && user.admin) renderAdminBooks();
  }

  // --- ADMIN BOOKS ---
  const adminBooksList = document.getElementById('admin-books-list');
  const addBookForm = document.getElementById('add-book-form');
  if(addBookForm) addBookForm.addEventListener('submit',function(e){
    e.preventDefault();
    const title = document.getElementById('book-title').value.trim();
    const isbn = document.getElementById('book-isbn').value.trim();
    const price = parseFloat(document.getElementById('book-price').value);
    const stock = parseInt(document.getElementById('book-stock').value, 10);
    const desc = document.getElementById('book-desc').value.trim();
    if(!title || isNaN(price) || isNaN(stock) || stock < 1) return;
    const token = localStorage.getItem('cs_customer_token');
    const user = users.find(u=>u.username===currentUser?.username);
    if(apiAvailable && token && user && user.admin){
      fetchWithAuth('/api/inventory',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title,description:desc,isbn,price,stock})
      }).then(r=>r.json()).then(body=>{
        if(body && body.ok){ loadInventoryFromAPI(); addBookForm.reset(); }
        else { alert('Failed to add book'); }
      }).catch(()=>{ alert('Failed to add book'); });
    }else{
      const id = 'b'+Math.random().toString(36).slice(2,8);
      inventory.push({id,isbn,title,price,stock,desc,img:''});
      saveJSON(inventoryKey,inventory);
      renderProducts();
      addBookForm.reset();
    }
  });

  function renderAdminBooks(){
    adminBooksList.innerHTML = '';
    if(inventory.length===0){adminBooksList.textContent = 'No books.';return;}
    inventory.forEach((b,i)=>{
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'space-between';
      div.style.marginBottom = '4px';
      div.innerHTML = `<span>${escapeHtml(b.title)} ($${b.price.toFixed(2)})<br><span style='font-size:12px;color:#555'>ISBN: ${escapeHtml(b.isbn||'')}</span></span> <button type="button" data-i="${i}">Remove</button>`;
      div.querySelector('button').addEventListener('click',function(){
        const user = users.find(u=>u.username===currentUser?.username);
        const token = localStorage.getItem('cs_customer_token');
        if(apiAvailable && token && user && user.admin){
          fetchWithAuth('/api/inventory/' + String(b.id),{method:'DELETE'}).then(()=>loadInventoryFromAPI()).catch(()=>{ inventory.splice(i,1); saveJSON(inventoryKey,inventory); renderProducts(); });
        }else{
          inventory.splice(i,1);
          saveJSON(inventoryKey,inventory);
          renderProducts();
        }
      });
      adminBooksList.appendChild(div);
    });
  }

  function addToCart(id){
    // If backend is available and user is authenticated, update server-side cart
    const token = localStorage.getItem('cs_customer_token');
    if(apiAvailable && token){
      fetchWithAuth('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({book_id: parseInt(id,10), qty:1})})
        .then(r=>r.json())
        .then(()=>syncCartFromServer())
        .catch(()=>{ cart[id] = (cart[id]||0)+1; saveJSON(storage.cartKey,cart); renderCart(); });
    }else{
      cart[id] = (cart[id]||0)+1;
      saveJSON(storage.cartKey,cart);
      renderCart();
    }
  }

  function renderCart(){
    cartItems.innerHTML='';
    let total = 0;
    const keys = Object.keys(cart);
    if(keys.length===0){cartItems.textContent='Cart is empty';cartTotal.textContent='0.00';return}
    keys.forEach(id=>{
      const p = inventory.find(x=>x.id===id);
      const qty = cart[id];
      const line = document.createElement('div');
      line.className='cart-item';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${p.title}</strong><div class="small">$${p.price.toFixed(2)}</div>`;
      const right = document.createElement('div');
      right.innerHTML = `<input class="qty" type="number" min="0" value="${qty}" style="width:60px"> <button type="button" class="rm">Remove</button>`;
      line.appendChild(left);line.appendChild(right);
      cartItems.appendChild(line);
      total += p.price * qty;

      right.querySelector('.qty').addEventListener('change',e=>{
        const v = parseInt(e.target.value)||0;
        const token = localStorage.getItem('cs_customer_token');
        if(apiAvailable && token){
          // update server-side cart
          fetchWithAuth('/api/cart/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({book_id: parseInt(id,10), qty: v})})
            .then(r=>r.json()).then(()=>syncCartFromServer()).catch(()=>{ if(v<=0) delete cart[id]; else cart[id]=v; saveJSON(storage.cartKey,cart); renderCart(); });
        }else{
          if(v<=0) delete cart[id]; else cart[id]=v;
          saveJSON(storage.cartKey,cart);
          renderCart();
        }
      });
      right.querySelector('.rm').addEventListener('click',()=>{
        const token = localStorage.getItem('cs_customer_token');
        if(apiAvailable && token){ fetchWithAuth('/api/cart/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({book_id: parseInt(id,10), qty:0})}).then(()=>syncCartFromServer()).catch(()=>{ delete cart[id]; saveJSON(storage.cartKey,cart); renderCart(); }); }
        else { delete cart[id]; saveJSON(storage.cartKey,cart); renderCart(); }
      });
    });
    cartTotal.textContent = total.toFixed(2);
  }

  async function openCheckout(){
    // Always sync cart from backend before showing checkout
    const token = localStorage.getItem('cs_customer_token');
    if(apiAvailable && token){
      await syncCartFromServer();
      await loadInventoryFromAPI && loadInventoryFromAPI();
    }
    const keys = Object.keys(cart);
    if(keys.length===0){alert('Cart is empty');return}
    orderSummary.innerHTML='';
    let sum = 0;
    const ul = document.createElement('div');
    keys.forEach(id=>{
      const p = inventory.find(x=>x.id===id);
      const qty = cart[id];
      const line = document.createElement('div');
      line.textContent = `${p.title} x ${qty} — $${(p.price*qty).toFixed(2)}`;
      ul.appendChild(line);
      sum += p.price*qty;
    });
    const fee = 0;
    const total = sum + fee;
    const summary = document.createElement('div');
    summary.innerHTML = `<hr><div><strong>Subtotal:</strong> $${sum.toFixed(2)}</div><div><strong>Total:</strong> $${total.toFixed(2)}</div>`;
    orderSummary.appendChild(ul);orderSummary.appendChild(summary);
    checkoutModal.style.display='flex';
  }

  function doPayment(){
    // simulate payment success/failure
    payBtn.disabled = true;
    setTimeout(()=>{
      payBtn.disabled = false;
      const approved = true; // always approve in this simple demo
      if(!approved){alert('Payment failed');return}
      // If backend available and authenticated, perform server checkout
      const token = localStorage.getItem('cs_customer_token');
      if(apiAvailable && token){
        fetchWithAuth('/api/checkout',{method:'POST'}).then(r=>r.json()).then(async res=>{
          if(!res || !res.ok){ alert(res && res.error ? res.error : 'Checkout failed'); return; }
          checkoutModal.style.display='none';
          // clear local cart and refresh from server
          await syncCartFromServer();
          // fetch order details and render
          const orderId = res.orderId;
          const od = await fetchWithAuth('/api/orders/' + orderId).then(r=>r.json()).catch(()=>null);
          const order = od && od.order ? { id: 'ORD-'+orderId, date: od.order.created_at || new Date().toISOString(), items: (od.items||[]).map(i=>({title:i.title,qty:i.qty,price:i.price})), total: od.order.total } : finalizeOrder();
          renderCart(); renderOrdersList(); openInvoice(order);
        }).catch(err=>{ console.error(err); alert('Checkout error'); });
      }else{
        const order = finalizeOrder();
        checkoutModal.style.display='none';
        renderCart();
        renderOrdersList();
        // generate invoice and open printable view
        openInvoice(order);
      }
    },600);
  }

  function finalizeOrder(){
    const items = Object.keys(cart).map(id=>{
      const p = inventory.find(x=>x.id===id);
      return {id:p.id,title:p.title,price:p.price,qty:cart[id]};
    });
    const subtotal = items.reduce((s,i)=>s+i.price*i.qty,0);
    const order = {
      id: 'ORD-' + Date.now().toString(36),
      date: new Date().toISOString(),
      items,
      subtotal,
      total: subtotal
    };
    orders.push(order);
    saveJSON(storage.ordersKey,orders);
    // clear cart
    cart = {}; saveJSON(storage.cartKey,cart);
    return order;
  }

  function openInvoice(order){
    const w = window.open('','_blank');
    const html = buildInvoiceHTML(order);
    w.document.write(html);
    w.document.close();
  }

  function buildInvoiceHTML(order){
    const rows = order.items.map(i=>`<tr><td>${escapeHtml(i.title)}</td><td>${i.qty}</td><td>$${i.price.toFixed(2)}</td><td>$${(i.price*i.qty).toFixed(2)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${order.id}</title><style>body{font-family:Arial;padding:18px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}</style></head><body><h2>Invoice</h2><div>Order: ${order.id}</div><div>Date: ${new Date(order.date).toLocaleString()}</div><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line</th></tr></thead><tbody>${rows}</tbody></table><h3>Total: $${order.total.toFixed(2)}</h3><div><button onclick="window.print()">Print / Save PDF</button></div></body></html>`;
  }

  function renderOrdersList(){
    const el = document.getElementById('orders-list');
    el.innerHTML='';
    const token = localStorage.getItem('cs_customer_token');
    if(apiAvailable && token){
      fetchWithAuth('/api/orders').then(r=>r.json()).then(list=>{
        if(!Array.isArray(list) || list.length===0){ 
          el.textContent='No orders yet'; 
          orders=[]; 
          saveJSON(storage.ordersKey,orders); 
          return;
        }
        // Store fetched orders in local array for export/clear functions
        orders = [];
        list.forEach(o=>{
          const d = document.createElement('div'); 
          d.className='order';
          d.innerHTML = `<strong>ORD-${o.id}</strong> — ${new Date(o.created_at).toLocaleString()} — $${o.total.toFixed(2)} <button type="button" data-id="${o.id}">View</button>`;
          el.appendChild(d);
          d.querySelector('button[data-id]').addEventListener('click', async ()=>{
            const od = await fetchWithAuth('/api/orders/' + o.id).then(r=>r.json()).catch(()=>null);
            if(od && od.order){ 
              const order = { 
                id: 'ORD-'+od.order.id, 
                date: od.order.created_at, 
                items: (od.items||[]).map(i=>({title:i.title,qty:i.qty,price:i.price})), 
                total: od.order.total 
              }; 
              openInvoice(order); 
            }
          });
          // Store in local array for export/clear
          orders.push({id: 'ORD-'+o.id, date: o.created_at, total: o.total, items: []});
        });
        saveJSON(storage.ordersKey,orders);
      }).catch(err=>{ 
        console.error('[renderOrdersList] Backend fetch error:', err);
        el.textContent='No orders yet'; 
        orders=[];
        saveJSON(storage.ordersKey,orders);
      });
    }else{
      if(orders.length===0){el.textContent='No orders yet';return}
      orders.slice().reverse().forEach(o=>{
        const d = document.createElement('div');
        d.className='order';
        d.innerHTML = `<strong>${o.id}</strong> — ${new Date(o.date).toLocaleString()} — $${o.total.toFixed(2)} <button type="button" data-id="${o.id}">View</button>`;
        el.appendChild(d);
        d.querySelector('button[data-id]').addEventListener('click',()=>openInvoice(o));
      });
    }
  }


  async function exportOrdersPDF(){
    try {
      console.log('[PDF Export] Start - local orders count:', orders.length, 'apiAvailable:', apiAvailable);
      
      let ordersToExport = orders.length > 0 ? [...orders] : null;
      
      // If no local orders and backend available, fetch from API
      if((!ordersToExport || ordersToExport.length === 0) && apiAvailable){
        const token = localStorage.getItem('cs_customer_token');
        if(token){
          console.log('[PDF Export] Fetching orders from backend');
          try{
            const list = await fetchWithAuth('/api/orders').then(r=>r.json());
            if(Array.isArray(list) && list.length > 0){
              // Fetch full details for each order including items
              const fullOrders = await Promise.all(
                list.map(o => 
                  fetchWithAuth('/api/orders/' + o.id)
                    .then(r => r.json())
                    .then(body => {
                      if(body && body.order && body.items){
                        return {
                          id: 'ORD-' + body.order.id,
                          date: body.order.created_at,
                          total: body.order.total,
                          items: body.items.map(i => ({title: i.title, qty: i.qty, price: i.price}))
                        };
                      }
                      return null;
                    })
                    .catch(err => {
                      console.error('[PDF Export] Error fetching order details:', err);
                      return null;
                    })
                )
              );
              ordersToExport = fullOrders.filter(o => o !== null);
              console.log('[PDF Export] Fetched', ordersToExport.length, 'orders from backend with details');
            }
          }catch(err){
            console.error('[PDF Export] Backend fetch error:', err);
          }
        }
      }
      
      if(!ordersToExport || ordersToExport.length===0){
        alert('No orders to export.');
        return;
      }
      
      // Load jsPDF if not already loaded
      if(typeof window.jspdf === 'undefined'){
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = exportOrdersPDF;
        document.body.appendChild(script);
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Orders Export', 10, 15);
      doc.setFontSize(12);
      doc.text(`Total Orders: ${ordersToExport.length}`, 10, 25);
      let y = 35;
      ordersToExport.forEach((o, idx) => {
        if(y > 250){
          doc.addPage();
          y = 15;
        }
        doc.setFontSize(11);
        doc.text(`Order ${idx + 1}: ${o.id}`, 10, y);
        y += 6;
        doc.setFontSize(10);
        doc.text(`Date: ${new Date(o.date).toLocaleString()}`, 15, y);
        y += 5;
        if(o.items && Array.isArray(o.items) && o.items.length > 0){
          o.items.forEach(item => {
            doc.text(`  \u2022 ${item.title} x${item.qty} @ $${item.price.toFixed(2)} = $${(item.qty * item.price).toFixed(2)}`, 15, y);
            y += 5;
            if(y > 270){
              doc.addPage();
              y = 15;
            }
          });
        }
        doc.text(`Total: $${o.total.toFixed(2)}`, 15, y);
        y += 10;
      });
      doc.save('orders.pdf');
      console.log('[PDF Export] Downloaded');
    } catch (err) {
      console.error('[PDF Export] Error:', err);
      alert('PDF export failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function clearOrders(){
    console.log('[Clear Orders] Clicked - apiAvailable:', apiAvailable, 'currentUser:', currentUser);
    if(!confirm('Clear all orders?'))return;
    
    // Always try backend first if available
    if(apiAvailable){
      const token = localStorage.getItem('cs_customer_token');
      if(token){
        try{
          console.log('[Clear Orders] Calling backend endpoint');
          const resp = await fetch(API_BASE + '/api/admin/orders/clear', {
            method:'POST',
            headers:{'Authorization':'Bearer '+token, 'Content-Type':'application/json'},
            body: '{}'
          });
          console.log('[Clear Orders] Response status:', resp.status);
          if(resp.ok){
            alert('Orders cleared');
            orders=[];
            saveJSON(storage.ordersKey,orders);
            renderOrdersList();
            return;
          } else {
            const body = await resp.text();
            console.error('[Clear Orders] Backend error response:', body);
            alert('Failed to clear orders on server: ' + (resp.statusText || resp.status));
          }
        }catch(e){
          console.error('[Clear Orders] Backend error:', e);
          alert('Failed to clear orders: ' + e.message);
        }
      }
    }
    
    // Fallback: clear local storage
    console.log('[Clear Orders] Clearing local storage');
    orders=[];
    saveJSON(storage.ordersKey,orders);
    renderOrdersList();
  }

  // Reports
  let currentReport = null;
  function runReport(){
    const user = users.find(u=>u.username===currentUser?.username);
    if(!user || !user.admin){alert('Not authorized');return}
    let dateInput = document.getElementById('report-date').value;
    if(!dateInput){alert('Pick a date');return}
    // Convert to UTC YYYY-MM-DD to match backend order timestamps
    const dateObj = new Date(dateInput);
    const utcDate = dateObj.getUTCFullYear() + '-' + String(dateObj.getUTCMonth()+1).padStart(2,'0') + '-' + String(dateObj.getUTCDate()).padStart(2,'0');
    dateInput = utcDate;
    const token = localStorage.getItem('cs_customer_token');
    const out = document.getElementById('report-results');
    if(apiAvailable && token){
      fetchWithAuth('/api/reports/daily?date=' + dateInput).then(r=>r.json()).then(body=>{
        if(!body || body.error){ alert(body && body.error ? body.error : 'Failed to run report'); return; }
        out.innerHTML = `<div><strong>Orders:</strong> ${body.orders.length}</div><div><strong>Total Sales:</strong> $${(body.totals||0).toFixed(2)}</div><div><strong>Top Sellers:</strong><ol>${(body.top||[]).map(t=>`<li>${escapeHtml(t[0])} — ${t[1]}</li>`).join('')}</ol></div>`;
        currentReport = {date:dateInput,orders:body.orders,totals:body.totals||0,itemMap:body.top||[],top:body.top||[]};
      }).catch(err=>{ console.error(err); alert('Report failed'); });
    }else{
      const dayStart = new Date(dateInput); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dateInput); dayEnd.setHours(23,59,59,999);
      const dayOrders = orders.filter(o=>{const d=new Date(o.date);return d>=dayStart && d<=dayEnd});
      const totals = dayOrders.reduce((s,o)=>s+o.total,0);
      const itemMap = {};
      dayOrders.forEach(o=>o.items.forEach(i=>{itemMap[i.title]=(itemMap[i.title]||0)+i.qty}));
      const top = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const out = document.getElementById('report-results');
      out.innerHTML = `<div><strong>Orders:</strong> ${dayOrders.length}</div><div><strong>Total Sales:</strong> $${totals.toFixed(2)}</div><div><strong>Top Sellers:</strong><ol>${top.map(t=>`<li>${escapeHtml(t[0])} — ${t[1]}</li>`).join('')}</ol></div>`;
      currentReport = {date:dateInput,orders:dayOrders,totals,itemMap,top};
    }
  }

  // Removed exportReportCSV function

  // Removed printReport function

  function showTab(name){
    document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.id===('tab-'+name)));
    document.querySelectorAll('.tab').forEach(t=>t.style.display = t.id===name? 'block':'none');
    if(name==='orders') renderOrdersList();
  }

  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

})();
