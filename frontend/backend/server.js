// Lightweight lowdb-backed backend (JSON storage, no native builds needed).
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Low, JSONFile } = require('lowdb');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const DB_PATH = process.env.JSON_DB || path.join(__dirname,'bms.json');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXP = process.env.JWT_EXP || '7d';
const PORT = parseInt(process.env.PORT || '3001',10);

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize lowdb
const adapter = new JSONFile(DB_PATH);
const db = new Low(adapter);

// Load or initialize database
async function initDb(){
  await db.read();
  if(!db.data){
    db.data = { users: [], inventory: [], carts: {}, orders: [] };
    // seed admin
    const adminHash = bcrypt.hashSync(process.env.ADMIN_PW || 'adminpass', 10);
    db.data.users.push({ id:1, username:'admin', password_hash:adminHash, role:'admin', mfa_enabled:0, mfa_secret:null, created_at: new Date().toISOString() });
    // seed inventory
    db.data.inventory = [
      { id:1, title:'The Pragmatic Programmer', isbn:'978-0201616224', description:'Classic dev book', price:29.99, stock:10 },
      { id:2, title:'Eloquent JavaScript', isbn:'978-1593279509', description:'Modern JS guide', price:24.5, stock:8 },
      { id:3, title:'You Don\'t Know JS', isbn:'978-1491904244', description:'Deep dive into JS', price:19.0, stock:6 },
      { id:4, title:'Clean Code', isbn:'978-0132350884', description:'Writing readable code', price:32.0, stock:5 }
    ];
    await db.write();
  }
}

const authLimiter = rateLimit({ windowMs:60*1000, max:20, message:{error:'Too many requests'} });

function generateToken(user){ return jwt.sign({id:user.id,username:user.username,role:user.role}, JWT_SECRET, {expiresIn:JWT_EXP}); }

function requireAuth(req,res,next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'Missing token'});
  const token = auth.slice(7);
  try{ const payload = jwt.verify(token,JWT_SECRET); req.user = payload; next(); }catch(e){ return res.status(401).json({error:'Invalid token'}); }
}

function requireRole(role){ return (req,res,next)=>{ if(!req.user) return res.status(401).json({error:'Not authenticated'}); if(req.user.role!==role) return res.status(403).json({error:'Forbidden'}); next(); }; }

app.get('/api/health',(req,res)=>res.json({ok:true}));

// Register
app.post('/api/register', authLimiter, async (req,res)=>{
  const {username,password} = req.body||{};
  if(!username||!password) return res.status(400).json({error:'username and password required'});
  try{
    const exists = db.data.users.find(u=>u.username===username);
    if(exists) return res.status(409).json({error:'username exists'});
    const hash = bcrypt.hashSync(password,10);
    const id = (Math.max(...db.data.users.map(u=>u.id),0)+1);
    const user = {id,username,role:'user',mfa_enabled:0,mfa_secret:null,created_at:new Date().toISOString()};
    db.data.users.push(user);
    await db.write();
    const token = generateToken({id:user.id,username,role:'user'});
    return res.json({ok:true,user:{id,username,role:'user'},token});
  }catch(e){ console.error(e); return res.status(500).json({error:'server error'}); }
});

// Login
app.post('/api/login', authLimiter, async (req,res)=>{
  const {username,password,totp} = req.body||{};
  if(!username||!password) return res.status(400).json({error:'username and password required'});
  try{
    const row = db.data.users.find(u=>u.username===username);
    if(!row || !row.password_hash) return res.status(401).json({error:'invalid credentials'});
    if(!bcrypt.compareSync(password,row.password_hash)) return res.status(401).json({error:'invalid credentials'});
    if(row.mfa_enabled){ if(!totp) return res.status(400).json({error:'totp required'}); const ok= speakeasy.totp.verify({secret:row.mfa_secret,encoding:'base32',token:totp,window:1}); if(!ok) return res.status(401).json({error:'invalid totp'}); }
    const user = {id:row.id,username:row.username,role:row.role};
    const token = generateToken(user);
    return res.json({ok:true,user,token});
  }catch(e){ console.error(e); return res.status(500).json({error:'server error'}); }
});

// MFA setup (requires auth)
app.post('/api/mfa/setup', requireAuth, async (req,res)=>{
  try{
    const secret = speakeasy.generateSecret({name:`BMS (${req.user.username})`,length:20});
    const otpauth = secret.otpauth_url;
    qrcode.toDataURL(otpauth).then(qr=>res.json({ok:true,secret:secret.base32,qr})).catch(e=>{console.error(e);res.status(500).json({error:'qr failed'})});
  }catch(e){console.error(e);res.status(500).json({error:'server error'});} 
});

// MFA confirm
app.post('/api/mfa/confirm', requireAuth, async (req,res)=>{
  const {secret,token} = req.body||{}; if(!secret||!token) return res.status(400).json({error:'secret and token required'});
  try{ const ok = speakeasy.totp.verify({secret,encoding:'base32',token,window:1}); if(!ok) return res.status(400).json({error:'invalid token'}); const user = db.data.users.find(u=>u.id===req.user.id); if(user){ user.mfa_enabled=1; user.mfa_secret=secret; await db.write(); } return res.json({ok:true}); }catch(e){console.error(e);return res.status(500).json({error:'server error'});} 
});

// Inventory endpoints
app.get('/api/inventory', async (req,res)=>{
  res.json(db.data.inventory);
});
app.get('/api/inventory/:id', async (req,res)=>{ const id = parseInt(req.params.id,10); const row = db.data.inventory.find(b=>b.id===id); if(!row) return res.status(404).json({error:'not found'}); res.json(row); });
app.post('/api/inventory', requireAuth, requireRole('admin'), async (req,res)=>{ const {title,isbn,description,price,stock}=req.body||{}; if(!title) return res.status(400).json({error:'title required'}); const id=(Math.max(...db.data.inventory.map(b=>b.id),0)+1); db.data.inventory.push({id,title,isbn:isbn||'',description:description||'',price:price||0,stock:stock||0}); await db.write(); res.json({ok:true,id}); });
app.put('/api/inventory/:id', requireAuth, requireRole('admin'), async (req,res)=>{ const id=parseInt(req.params.id,10); const {title,isbn,description,price,stock}=req.body||{}; const book=db.data.inventory.find(b=>b.id===id); if(book){ book.title=title; book.isbn=isbn; book.description=description; book.price=price; book.stock=stock; await db.write(); } res.json({ok:true}); });
app.delete('/api/inventory/:id', requireAuth, requireRole('admin'), async (req,res)=>{ const id=parseInt(req.params.id,10); db.data.inventory=db.data.inventory.filter(b=>b.id!==id); await db.write(); res.json({ok:true}); });

// Supplier update: accept an array of {isbn,stock,price,title} and upsert
app.post('/api/supplier/update', requireAuth, requireRole('admin'), async (req,res)=>{
  const feed = Array.isArray(req.body) ? req.body : (req.body.feed||[]);
  let changed=0;
  for(const item of feed){
    const found = db.data.inventory.find(b=>b.isbn===item.isbn);
    if(found){ found.title=item.title||''; found.price=item.price||0; found.stock=item.stock||0; changed++; }
    else { const id=(Math.max(...db.data.inventory.map(b=>b.id),0)+1); db.data.inventory.push({id,title:item.title||'',isbn:item.isbn||'',description:item.description||'',price:item.price||0,stock:item.stock||0}); changed++; }
  }
  await db.write();
  res.json({ok:true,changed});
});

// Cart endpoints (persistent per user)
app.get('/api/cart', requireAuth, async (req,res)=>{ 
  const cartKey = String(req.user.id);
  const cart = db.data.carts[cartKey] || [];
  const items = cart.map(ci => { const book = db.data.inventory.find(b=>b.id===ci.book_id); return book ? {book_id:ci.book_id,title:book.title,price:book.price,qty:ci.qty} : null; }).filter(Boolean);
  res.json(items);
});
app.post('/api/cart', requireAuth, async (req,res)=>{ 
  const {book_id,qty}=req.body||{}; if(!book_id) return res.status(400).json({error:'book_id required'});
  const cartKey = String(req.user.id);
  if(!db.data.carts[cartKey]) db.data.carts[cartKey] = [];
  const q=parseInt(qty||1,10);
  const exists = db.data.carts[cartKey].find(ci=>ci.book_id===book_id);
  if(exists){ exists.qty += q; } else { db.data.carts[cartKey].push({book_id,qty:q}); }
  await db.write();
  const cart = db.data.carts[cartKey] || [];
  const items = cart.map(ci => { const book = db.data.inventory.find(b=>b.id===ci.book_id); return book ? {book_id:ci.book_id,title:book.title,price:book.price,qty:ci.qty} : null; }).filter(Boolean);
  res.json(items);
});
app.post('/api/cart/update', requireAuth, async (req,res)=>{ 
  const {book_id,qty}=req.body||{}; if(!book_id) return res.status(400).json({error:'book_id required'});
  const cartKey = String(req.user.id);
  if(!db.data.carts[cartKey]) db.data.carts[cartKey] = [];
  const q=parseInt(qty||0,10);
  if(q<=0){ db.data.carts[cartKey] = db.data.carts[cartKey].filter(ci=>ci.book_id!==book_id); }
  else { const exists = db.data.carts[cartKey].find(ci=>ci.book_id===book_id); if(exists){ exists.qty=q; } else { db.data.carts[cartKey].push({book_id,qty:q}); } }
  await db.write();
  const cart = db.data.carts[cartKey] || [];
  const items = cart.map(ci => { const book = db.data.inventory.find(b=>b.id===ci.book_id); return book ? {book_id:ci.book_id,title:book.title,price:book.price,qty:ci.qty} : null; }).filter(Boolean);
  res.json(items);
});

// Checkout: create order from cart, decrement stock
app.post('/api/checkout', requireAuth, async (req,res)=>{
  const cartKey = String(req.user.id);
  const cart = db.data.carts[cartKey] || [];
  const items = cart.map(ci => { const book = db.data.inventory.find(b=>b.id===ci.book_id); return book ? {book_id:ci.book_id,title:book.title,price:book.price,qty:ci.qty,stock:book.stock} : null; }).filter(Boolean);
  if(!items || items.length===0) return res.status(400).json({error:'cart empty'});
  let total=0; for(const it of items){ if(it.stock < it.qty) return res.status(400).json({error:`Not enough stock for ${it.title}`}); total += it.price * it.qty; }
  const orderId = (Math.max(...db.data.orders.map(o=>o.id),0)+1);
  const order = {id:orderId,user_id:req.user.id,created_at:new Date().toISOString(),total,items:items.map(it=>({book_id:it.book_id,title:it.title,qty:it.qty,price:it.price}))};
  db.data.orders.push(order);
  for(const it of items){ const book = db.data.inventory.find(b=>b.id===it.book_id); if(book) book.stock -= it.qty; }
  db.data.carts[cartKey] = [];
  await db.write();
  res.json({ok:true,orderId});
});

// Orders
app.get('/api/orders', requireAuth, async (req,res)=>{ const orders = db.data.orders.filter(o=>o.user_id===req.user.id).map(o=>({id:o.id,created_at:o.created_at,total:o.total})).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); res.json(orders); });
app.get('/api/orders/:id', requireAuth, async (req,res)=>{ const id=parseInt(req.params.id,10); const order = db.data.orders.find(o=>o.id===id); if(!order) return res.status(404).json({error:'not found'}); const items = order.items || []; res.json({order:{id:order.id,created_at:order.created_at,total:order.total},items}); });
app.get('/api/admin/orders', requireAuth, requireRole('admin'), async (req,res)=>{ const orders = db.data.orders.map(o=>({id:o.id,user_id:o.user_id,created_at:o.created_at,total:o.total})).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); res.json(orders); });

// Reports: daily sales
app.get('/api/reports/daily', requireAuth, requireRole('admin'), async (req,res)=>{
  const date = req.query.date; if(!date) return res.status(400).json({error:'date required (YYYY-MM-DD)'});
  const orders = db.data.orders.filter(o=>o.created_at.startsWith(date));
  let total = 0; const itemMap = {};
  for(const o of orders){ total += o.total; for(const it of (o.items||[])){ itemMap[it.title] = (itemMap[it.title]||0) + it.qty; } }
  const top = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  res.json({date,orders:orders.map(o=>({id:o.id,created_at:o.created_at,total:o.total})),totals:total,top});
});

app.get('/api/reports/daily/export', requireAuth, requireRole('admin'), async (req,res)=>{
  const date = req.query.date; if(!date) return res.status(400).json({error:'date required'});
  const orders = db.data.orders.filter(o=>o.created_at.startsWith(date));
  const rows = [['Date','OrderID','Item','Qty','Price','Line']];
  for(const o of orders){ for(const it of (o.items||[])){ rows.push([date,o.id,it.title,it.qty,it.price,(it.qty*it.price).toFixed(2)]) } }
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition',`attachment; filename="report-${date}.csv"`); res.send(csv);
});

// Start server with HTTPS if certs provided
function start(){ 
  const keyPath = process.env.SSL_KEY_PATH; 
  const certPath = process.env.SSL_CERT_PATH; 
  if(keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)){ 
    const key = fs.readFileSync(keyPath); 
    const cert = fs.readFileSync(certPath); 
    https.createServer({key,cert},app).listen(PORT,()=>console.log('HTTPS server listening',PORT)); 
  } else { 
    http.createServer(app).listen(PORT,()=>console.log('HTTP server listening',PORT)); 
  } 
}

initDb().then(()=>start()).catch(err=>{
  console.error('Failed to initialize database:',err);
  process.exit(1);
});
