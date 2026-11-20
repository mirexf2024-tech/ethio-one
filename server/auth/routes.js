const express = require("express");
const crypto = require("node:crypto");
const security = require("./security");
const { sendVerificationEmail, sendVerificationSms } = require("../providers");

const router = express.Router();
const ACCESS_TTL = 900;
const TERMS_VERSION = "terms-v1";

function ready(req, res, next) {
  const env = req.app.locals.authEnv || process.env;
  if (env.AUTH_ENABLED !== "true" || !req.app.locals.db ||
      !env.AUTH_CHALLENGE_PEPPER || String(env.AUTH_CHALLENGE_PEPPER).length < 32 ||
      !env.ACCESS_TOKEN_SECRET || String(env.ACCESS_TOKEN_SECRET).length < 32) {
    return res.status(503).json({ error: "Authentication is temporarily unavailable." });
  }
  next();
}
function accessToken(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
  const p = Buffer.from(JSON.stringify({ sub: user.id, username: user.username, iat: now, exp: now + ACCESS_TTL })).toString("base64url");
  const input = h + "." + p;
  return input + "." + crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(input).digest("base64url");
}
function readAccessToken(token, env) {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(parts[0] + "." + parts[1]).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return p.sub && Number.isInteger(p.exp) && p.exp > Math.floor(Date.now() / 1000) ? p : null;
  } catch { return null; }
}
function profile(u) {
  return { id:u.id, fullName:u.full_name, username:u.username, email:u.email, phone:u.phone,
    accountType:u.account_type, status:u.status, emailVerified:!!u.email_verified_at,
    phoneVerified:!!u.phone_verified_at, createdAt:u.created_at };
}
function mask(channel, value) {
  return channel === "email" ? value.slice(0,1) + "***@" + value.split("@")[1] : value.slice(0,4) + "*****" + value.slice(-2);
}
async function newSession(db, user, env) {
  const refreshToken = security.createOpaqueToken(48);
  const digest = security.digestToken(refreshToken);
  await db.query("INSERT INTO auth_sessions (user_id, family_id, refresh_token_digest, expires_at) VALUES ($1, gen_random_uuid(), $2, NOW() + INTERVAL '30 days')", [user.id, digest]);
  return { accessToken:accessToken(user,env), refreshToken, tokenType:"Bearer", expiresIn:ACCESS_TTL };
}

router.use(ready);

router.post("/register", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  try {
    const email=b.email ? security.normalizeEmail(b.email) : null;
    const phone=b.phone ? security.normalizePhone(b.phone) : null;
    if (!email && !phone) return res.status(400).json({error:"Email or phone is required."});
    if (typeof b.fullName!=="string" || b.fullName.trim().length<2 || b.fullName.trim().length>120 ||
        typeof b.username!=="string" || !/^[a-zA-Z0-9_]{3,30}$/.test(b.username) || b.termsAccepted!==true) {
      return res.status(400).json({error:"Please check the required registration details."});
    }
    const channel=b.channel;
    if (!["email","sms"].includes(channel) || (channel==="email"&&!email) || (channel==="sms"&&!phone)) {
      return res.status(400).json({error:"Choose a verification method you provided."});
    }
    const passwordHash=await security.hashPassword(b.password);
    const code=security.createOtp();
    const c=await db.connect();
    let user;
    try {
      await c.query("BEGIN");
      const inserted=await c.query(
        "INSERT INTO users (full_name,username,email,phone,password_hash,account_type,status,terms_accepted_at,terms_version) VALUES ($1,$2,$3,$4,$5,'member','pending_verification',NOW(),$6) RETURNING id,full_name,username,email,phone",
        [b.fullName.trim(),b.username.trim().toLowerCase(),email,phone,passwordHash,TERMS_VERSION]);
      user=inserted.rows[0];
      await c.query("INSERT INTO auth_challenges (user_id,channel,purpose,code_digest,expires_at) VALUES ($1,$2,'verify_contact',$3,NOW()+INTERVAL '5 minutes')",
        [user.id,channel,security.digestChallenge(code,env.AUTH_CHALLENGE_PEPPER)]);
      await c.query("COMMIT");
    } catch(e) {
      await c.query("ROLLBACK").catch(()=>{});
      if(e.code==="23505") return res.status(409).json({error:"An account with these details already exists."});
      throw e;
    } finally { c.release(); }
    try {
      if(channel==="email") await sendVerificationEmail({to:email,code,expiresMinutes:5});
      else await sendVerificationSms({to:phone,code,expiresMinutes:5});
    } catch {
      await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND purpose='verify_contact' AND consumed_at IS NULL",[user.id]).catch(()=>{});
      return res.status(503).json({error:"We could not send the verification code. Please try again later."});
    }
    const destination=channel==="email"?email:phone;
    return res.status(201).json({ok:true,status:"pending_verification",userId:user.id,channel,destination:mask(channel,destination),expiresIn:300});
  } catch(e) {
    if(e instanceof TypeError) return res.status(400).json({error:e.message});
    return res.status(503).json({error:"Registration is temporarily unavailable."});
  }
});

router.post("/verify", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  if(typeof b.userId!=="string" || !/^[0-9a-f-]{36}$/i.test(b.userId) || !["email","sms"].includes(b.channel) || !/^\d{6}$/.test(String(b.code||""))) {
    return res.status(400).json({error:"Invalid verification request."});
  }
  const c=await db.connect();
  try {
    await c.query("BEGIN");
    const found=await c.query("SELECT id,code_digest,expires_at,failed_attempts,max_attempts FROM auth_challenges WHERE user_id=$1 AND channel=$2 AND purpose='verify_contact' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[b.userId,b.channel]);
    const ch=found.rows[0];
    if(!ch || new Date(ch.expires_at)<=new Date() || ch.failed_attempts>=ch.max_attempts) {
      await c.query("ROLLBACK"); return res.status(400).json({error:"The code is invalid or expired. Request a new one."});
    }
    const actual=Buffer.from(security.digestChallenge(b.code,env.AUTH_CHALLENGE_PEPPER),"hex");
    const expected=Buffer.from(ch.code_digest,"hex");
    if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) {
      await c.query("UPDATE auth_challenges SET failed_attempts=failed_attempts+1 WHERE id=$1",[ch.id]);
      await c.query("COMMIT"); return res.status(400).json({error:"The code is invalid or expired. Request a new one."});
    }
    await c.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE id=$1",[ch.id]);
    const col=b.channel==="email"?"email_verified_at":"phone_verified_at";
    const updated=await c.query("UPDATE users SET "+col+"=NOW(),status='active',updated_at=NOW() WHERE id=$1 RETURNING id,full_name,username,email,phone,account_type,status,email_verified_at,phone_verified_at,created_at",[b.userId]);
    if(!updated.rows[0]) { await c.query("ROLLBACK"); return res.status(400).json({error:"This account cannot be verified."}); }
    await c.query("COMMIT");
    const session=await newSession(db,updated.rows[0],env);
    return res.json({ok:true,user:profile(updated.rows[0]),...session});
  } catch {
    await c.query("ROLLBACK").catch(()=>{});
    return res.status(503).json({error:"Verification is temporarily unavailable."});
  } finally { c.release(); }
});

router.post("/login", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  if(typeof b.identity!=="string" || typeof b.password!=="string" || !b.identity.trim() || !b.password) return res.status(400).json({error:"Enter your Ethio ID and password."});
  try {
    const value=b.identity.trim();
    let result;
    if(value.includes("@")) result=await db.query("SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1",[security.normalizeEmail(value)]);
    else if(/^[+0-9()\\s-]+$/.test(value)) {
      let phone=null; try { phone=security.normalizePhone(value); } catch {}
      result=phone ? await db.query("SELECT * FROM users WHERE phone=$1 LIMIT 1",[phone]) : await db.query("SELECT * FROM users WHERE lower(username)=lower($1) LIMIT 1",[value]);
    } else result=await db.query("SELECT * FROM users WHERE lower(username)=lower($1) LIMIT 1",[value]);
    const user=result.rows[0];
    const valid=user ? await security.verifyPassword(b.password,user.password_hash) : false;
    if(!user || !valid) return res.status(401).json({error:"The sign-in details are incorrect."});
    if(user.status!=="active") return res.status(403).json({error:"Verify your contact method before signing in."});
    return res.json({ok:true,user:profile(user),...(await newSession(db,user,env))});
  } catch(e) {
    if(e instanceof TypeError) return res.status(401).json({error:"The sign-in details are incorrect."});
    return res.status(503).json({error:"Sign-in is temporarily unavailable."});
  }
});

router.get("/me", async (req,res) => {
  const env=req.app.locals.authEnv||process.env;
  const match=/^Bearer\\s+(.+)$/i.exec(req.get("authorization")||"");
  const payload=match && readAccessToken(match[1],env);
  if(!payload) return res.status(401).json({error:"Please sign in again."});
  try {
    const result=await req.app.locals.db.query("SELECT id,full_name,username,email,phone,account_type,status,email_verified_at,phone_verified_at,created_at FROM users WHERE id=$1 AND status='active'",[payload.sub]);
    if(!result.rows[0]) return res.status(401).json({error:"Please sign in again."});
    return res.json({user:profile(result.rows[0])});
  } catch { return res.status(503).json({error:"Profile is temporarily unavailable."}); }
});

module.exports=router;
