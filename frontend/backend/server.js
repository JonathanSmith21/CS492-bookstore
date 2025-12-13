require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');

const app = express();
app.use(helmet());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-prod';
const JWT_EXP = process.env.JWT_EXP || '7d';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'bookstore',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const authLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: {error:'Too many requests'} });

async function findUserByUsername(username){
  const [rows] = await pool.execute('SELECT id,username,password_hash,role,mfa_enabled,mfa_secret FROM users WHERE username = ?', [username]);
  return rows[0];
}

function generateToken(user){
  return jwt.sign({id:user.id,username:user.username,role:user.role}, JWT_SECRET, {expiresIn: JWT_EXP});
}

async function requireAuth(req,res,next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error:'Missing token'});
  const token = auth.slice(7);
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){
    return res.status(401).json({error:'Invalid token'});
  }
}

function requireRole(role){
  return (req,res,next)=>{
    if(!req.user) return res.status(401).json({error:'Not authenticated'});
    if(req.user.role !== role) return res.status(403).json({error:'Forbidden'});
    next();
  };
}

// Public: register
app.post('/api/register', authLimiter, async (req,res)=>{
  const {username,password} = req.body || {};
  if(!username || !password) return res.status(400).json({error:'username and password required'});
  try{
    const existing = await findUserByUsername(username);
    if(existing) return res.status(409).json({error:'username exists'});
    const hash = await bcrypt.hash(password, 12);
    const role = 'user';
    const [r] = await pool.execute('INSERT INTO users (username,password_hash,role,mfa_enabled,created_at) VALUES (?,?,?,?,NOW())', [username, hash, role, 0]);
    const user = {id: r.insertId, username, role, mfa_enabled:0};
    const token = generateToken(user);
    return res.json({ok:true,user:{username,role},token});
  }catch(err){
    console.error(err);return res.status(500).json({error:'server error'});
  }
});

// Public: login (password + optional TOTP code)
app.post('/api/login', authLimiter, async (req,res)=>{
  const {username,password,totp} = req.body || {};
  if(!username || !password) return res.status(400).json({error:'username and password required'});
  try{
    const user = await findUserByUsername(username);
    if(!user) return res.status(401).json({error:'invalid credentials'});
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({error:'invalid credentials'});
    if(user.mfa_enabled){
      if(!totp) return res.status(400).json({error:'totp required'});
      const verified = speakeasy.totp.verify({secret:user.mfa_secret,encoding:'base32',token:totp,window:1});
      if(!verified) return res.status(401).json({error:'invalid totp'});
    }
    const token = generateToken({id:user.id,username:user.username,role:user.role});
    return res.json({ok:true,user:{username:user.username,role:user.role,mfa_enabled:!!user.mfa_enabled},token});
  }catch(err){console.error(err);return res.status(500).json({error:'server error'});} 
});

// Protected: generate MFA setup (returns secret and QR) — user must be authenticated
app.post('/api/mfa/setup', requireAuth, async (req,res)=>{
  try{
    const secret = speakeasy.generateSecret({name: `Bookstore (${req.user.username})`, length:20});
    const otpauth = secret.otpauth_url;
    const qr = await qrcode.toDataURL(otpauth);
    // Return secret to client; only persist after confirm
    return res.json({ok:true,secret:secret.base32,qr});
  }catch(err){console.error(err);return res.status(500).json({error:'server error'});} 
});

// Protected: confirm MFA setup (verify code then persist secret)
app.post('/api/mfa/confirm', requireAuth, async (req,res)=>{
  const {secret,token} = req.body || {};
  if(!secret || !token) return res.status(400).json({error:'secret and token required'});
  try{
    const ok = speakeasy.totp.verify({secret,encoding:'base32',token,window:1});
    if(!ok) return res.status(400).json({error:'invalid token'});
    await pool.execute('UPDATE users SET mfa_enabled=1,mfa_secret=? WHERE id=?', [secret, req.user.id]);
    return res.json({ok:true});
  }catch(err){console.error(err);return res.status(500).json({error:'server error'});} 
});

// Admin: list users (no password hashes returned)
app.get('/api/users', requireAuth, requireRole('admin'), async (req,res)=>{
  try{
    const [rows] = await pool.execute('SELECT id,username,role,mfa_enabled,created_at FROM users ORDER BY id ASC');
    return res.json(rows);
  }catch(err){console.error(err);return res.status(500).json({error:'server error'});} 
});

// Admin: change user's role
app.post('/api/users/:id/role', requireAuth, requireRole('admin'), async (req,res)=>{
  const {id} = req.params; const {role} = req.body || {};
  if(!role) return res.status(400).json({error:'role required'});
  if(!['user','admin'].includes(role)) return res.status(400).json({error:'invalid role'});
  try{
    await pool.execute('UPDATE users SET role=? WHERE id=?', [role,id]);
    return res.json({ok:true});
  }catch(err){console.error(err);return res.status(500).json({error:'server error'});} 
});

// Health
app.get('/api/health', (req,res)=>res.json({ok:true}));

// Start server — HTTPS-ready if SSL files provided via env
async function start(){
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if(keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)){
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    https.createServer({key,cert}, app).listen(PORT, ()=>console.log('HTTPS server listening on',PORT));
  }else{
    http.createServer(app).listen(PORT, ()=>console.log('HTTP server listening on',PORT));
  }
}

start().catch(e=>{console.error('Failed to start',e);process.exit(1)});
