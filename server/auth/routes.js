const express = require("express");
const crypto = require("node:crypto");
const security = require("./security");
const { recordSecurityEvent } = require("../admin/audit");
const { sendVerificationEmail } = require("../providers");

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
  return { id:u.id, ethioId:u.ethio_id, fullName:u.full_name, username:u.username, email:u.email, phone:u.phone,
    accountType:u.account_type, status:u.status, emailVerified:!!u.email_verified_at,
    phoneVerified:!!u.phone_verified_at, identityVerificationStatus:u.identity_verification_status || "unverified",
    identityVerificationUpdatedAt:u.identity_verification_updated_at || null, createdAt:u.created_at };
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
    const phone=security.normalizePhone(b.phone);
    const country=typeof b.country==="string"?b.country.trim():"";
    const locale=["om","am","en"].includes(b.locale)?b.locale:null;
    if (!email) return res.status(400).json({error:"A valid email address is required."});
    if (!country || country.length>80 || !locale) return res.status(400).json({error:"Choose your country and preferred language."});
    if (typeof b.fullName!=="string" || b.fullName.trim().length<2 || b.fullName.trim().length>120 ||
        typeof b.username!=="string" || !/^[a-zA-Z0-9_]{3,30}$/.test(b.username) || b.termsAccepted!==true) {
      return res.status(400).json({error:"Please check the required registration details."});
    }
    const channel=b.channel;
    if (channel !== "email" || !email) {
      return res.status(400).json({error:"Choose a verification method you provided."});
    }
    const passwordHash=await security.hashPassword(b.password);
    const code=security.createOtp();
    const c=await db.connect();
    let user;
    try {
      await c.query("BEGIN");
      const inserted=await c.query(
        "WITH identity AS (SELECT gen_random_uuid() AS id) INSERT INTO users (id,ethio_id,full_name,username,email,phone,password_hash,account_type,status,terms_accepted_at,terms_version) SELECT id,'E1-' || UPPER(SUBSTRING(REPLACE(id::text,'-','') FROM 1 FOR 12)),$1,$2,$3,$4,$5,'member','pending_verification',NOW(),$6 FROM identity RETURNING id,ethio_id,full_name,username,email,phone",
        [b.fullName.trim(),b.username.trim().toLowerCase(),email,phone,passwordHash,TERMS_VERSION]);
      user=inserted.rows[0];
      await c.query("INSERT INTO user_profiles (user_id,country,locale) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET country=EXCLUDED.country,locale=EXCLUDED.locale,updated_at=NOW()",[user.id,country,locale]);
      await c.query("INSERT INTO user_roles (user_id,role_key) VALUES ($1,'member') ON CONFLICT DO NOTHING",[user.id]);
      await c.query("INSERT INTO auth_challenges (user_id,channel,purpose,code_digest,expires_at) VALUES ($1,$2,'verify_contact',$3,NOW()+INTERVAL '5 minutes')",
        [user.id,channel,security.digestChallenge(code,env.AUTH_CHALLENGE_PEPPER)]);
      await c.query("COMMIT");
    } catch(e) {
      await c.query("ROLLBACK").catch(()=>{});
      if(e.code==="23505") return res.status(409).json({error:"An account with these details already exists."});
      throw e;
    } finally { c.release(); }
    try {
      await sendVerificationEmail({to:email,code,expiresMinutes:5});
    } catch (mailError) {
      console.error("Verification email delivery failed:", {
        name: mailError?.name || "Error",
        code: mailError?.code || null,
        responseCode: mailError?.responseCode || null
      });
      await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND purpose='verify_contact' AND consumed_at IS NULL",[user.id]).catch(()=>{});
      return res.status(503).json({error:"We could not send the verification code. Please try again later.",userId:user.id,channel});
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
  if(typeof b.userId!=="string" || !/^[0-9a-f-]{36}$/i.test(b.userId) || b.channel !== "email" || !/^\d{6}$/.test(String(b.code||""))) {
    return res.status(400).json({error:"Invalid verification request."});
  }
  const c=await db.connect();
  try {
    await c.query("BEGIN");
    const found=await c.query("SELECT id,code_digest,expires_at,failed_attempts,max_attempts FROM auth_challenges WHERE user_id=$1 AND channel=$2 AND purpose='verify_contact' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[b.userId,b.channel]);
    const ch=found.rows[0];
    if(!ch || new Date(ch.expires_at)<=new Date() || ch.failed_attempts>=ch.max_attempts) {
      await c.query("ROLLBACK");
      await recordSecurityEvent(req, { type: "otp_expired", severity: "warning", userId: b.userId, metadata: { channel: b.channel, reason: "missing_expired_or_locked" } });
      return res.status(400).json({error:"The code is invalid or expired. Request a new one."});
    }
    const actual=Buffer.from(security.digestChallenge(b.code,env.AUTH_CHALLENGE_PEPPER),"hex");
    const expected=Buffer.from(ch.code_digest,"hex");
    if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) {
      await c.query("UPDATE auth_challenges SET failed_attempts=failed_attempts+1 WHERE id=$1",[ch.id]);
      await c.query("COMMIT");
      await recordSecurityEvent(req, { type: "otp_invalid", severity: "warning", userId: b.userId, metadata: { channel: b.channel, reason: "incorrect_code" } });
      return res.status(400).json({error:"The code is invalid or expired. Request a new one."});
    }
    await c.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE id=$1",[ch.id]);
    const col=b.channel==="email"?"email_verified_at":"phone_verified_at";
    const updated=await c.query("UPDATE users SET "+col+"=NOW(),status='active',updated_at=NOW() WHERE id=$1 AND status IN ('pending_verification','active') RETURNING id,ethio_id,full_name,username,email,phone,account_type,status,email_verified_at,phone_verified_at,identity_verification_status,identity_verification_updated_at,created_at",[b.userId]);
    if(!updated.rows[0]) { await c.query("ROLLBACK"); return res.status(400).json({error:"This account cannot be verified."}); }
    const adminEmail=String(env.ADMIN_EMAIL||"").trim().toLowerCase();
    if(b.channel==="email" && adminEmail && String(updated.rows[0].email||"").toLowerCase()===adminEmail) {
      await c.query("INSERT INTO user_roles (user_id,role_key) VALUES ($1,'super_admin') ON CONFLICT DO NOTHING",[updated.rows[0].id]);
    }
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
    else if(/^[+0-9()\s-]+$/.test(value)) {
      let phone=null; try { phone=security.normalizePhone(value); } catch {}
      result=phone ? await db.query("SELECT * FROM users WHERE phone=$1 LIMIT 1",[phone]) : await db.query("SELECT * FROM users WHERE lower(username)=lower($1) LIMIT 1",[value]);
    } else result=await db.query("SELECT * FROM users WHERE lower(ethio_id)=lower($1) OR lower(username)=lower($1) LIMIT 1",[value]);
    const user=result.rows[0];
    const valid=user ? await security.verifyPassword(b.password,user.password_hash) : false;
    if(!user || !valid) {
      await recordSecurityEvent(req, { type: "login_failed", severity: "warning", userId: user?.id || null, metadata: { reason: "invalid_credentials", route: "/auth/login" } });
      return res.status(401).json({error:"The sign-in details are incorrect."});
    }
    if(user.status==="pending_verification") return res.status(403).json({error:"Verify your email before signing in.",status:"pending_verification",userId:user.id,channel:"email"});
    if(user.status!=="active") return res.status(403).json({error:"This account cannot sign in yet."});
    return res.json({ok:true,user:profile(user),...(await newSession(db,user,env))});
  } catch(e) {
    if(e instanceof TypeError) return res.status(401).json({error:"The sign-in details are incorrect."});
    return res.status(503).json({error:"Sign-in is temporarily unavailable."});
  }
});

router.get("/me", async (req,res) => {
  const env=req.app.locals.authEnv||process.env;
  const match=/^Bearer\s+(.+)$/i.exec(req.get("authorization")||"");
  const payload=match && readAccessToken(match[1],env);
  if(!payload) return res.status(401).json({error:"Please sign in again."});
  try {
    const result=await req.app.locals.db.query("SELECT id,ethio_id,full_name,username,email,phone,account_type,status,email_verified_at,phone_verified_at,identity_verification_status,identity_verification_updated_at,created_at FROM users WHERE id=$1 AND status='active'",[payload.sub]);
    if(!result.rows[0]) return res.status(401).json({error:"Please sign in again."});
    return res.json({user:profile(result.rows[0])});
  } catch { return res.status(503).json({error:"Profile is temporarily unavailable."}); }
});


router.post("/refresh", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env;
  let digest;
  try { digest=security.digestToken(req.body?.refreshToken); }
  catch { return res.status(401).json({error:"Session expired. Sign in again."}); }
  const c=await db.connect();
  try {
    await c.query("BEGIN");
    const found=await c.query(
      "SELECT s.id,s.user_id,s.family_id,s.expires_at,s.revoked_at,s.replaced_by_digest,u.username,u.status FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_digest=$1 FOR UPDATE OF s",
      [digest]);
    const session=found.rows[0];
    if(!session) { await c.query("ROLLBACK"); return res.status(401).json({error:"Session expired. Sign in again."}); }
    if(session.revoked_at || session.replaced_by_digest) {
      await c.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE family_id=$1",[session.family_id]);
      await c.query("COMMIT");
      await recordSecurityEvent(req, { type: "refresh_reuse", severity: "high", userId: session.user_id, metadata: { reason: "rotated_token_reuse", route: "/auth/refresh" } });
      return res.status(401).json({error:"Session expired. Sign in again."});
    }
    if(new Date(session.expires_at)<=new Date() || session.status!=="active") {
      await c.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1",[session.id]);
      await c.query("COMMIT");
      return res.status(401).json({error:"Session expired. Sign in again."});
    }
    const nextToken=security.createOpaqueToken(48), nextDigest=security.digestToken(nextToken);
    await c.query("UPDATE auth_sessions SET revoked_at=NOW(),replaced_by_digest=$2,last_used_at=NOW() WHERE id=$1",[session.id,nextDigest]);
    await c.query("INSERT INTO auth_sessions (user_id,family_id,refresh_token_digest,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '30 days')",
      [session.user_id,session.family_id,nextDigest]);
    await c.query("COMMIT");
    return res.json({accessToken:accessToken({id:session.user_id,username:session.username},env),refreshToken:nextToken,tokenType:"Bearer",expiresIn:ACCESS_TTL});
  } catch {
    await c.query("ROLLBACK").catch(()=>{});
    return res.status(503).json({error:"Session refresh is temporarily unavailable."});
  } finally { c.release(); }
});

router.post("/logout", async (req,res) => {
  try {
    const digest=security.digestToken(req.body?.refreshToken);
    await req.app.locals.db.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE refresh_token_digest=$1 AND revoked_at IS NULL",[digest]);
  } catch {}
  return res.json({ok:true});
});


router.post("/verification/resend", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  if(typeof b.userId!=="string" || !/^[0-9a-f-]{36}$/i.test(b.userId) || b.channel !== "email") {
    return res.status(400).json({error:"Invalid verification request."});
  }
  try {
    const col=b.channel==="email"?"email":"phone";
    const verified=b.channel==="email"?"email_verified_at":"phone_verified_at";
    const found=await db.query("SELECT id,"+col+" AS destination,"+verified+" AS verified_at,status FROM users WHERE id=$1",[b.userId]);
    const user=found.rows[0];
    if(!user || !user.destination || user.verified_at || user.status!=="pending_verification") {
      return res.status(400).json({error:"A new verification code cannot be sent for this account."});
    }
    const recent=await db.query("SELECT last_sent_at FROM auth_challenges WHERE user_id=$1 AND channel=$2 AND purpose='verify_contact' ORDER BY created_at DESC LIMIT 1",[user.id,b.channel]);
    if(recent.rows[0] && Date.now()-new Date(recent.rows[0].last_sent_at).getTime()<60000) {
      return res.status(429).json({error:"Please wait before requesting another code."});
    }
    const code=security.createOtp();
    await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND channel=$2 AND purpose='verify_contact' AND consumed_at IS NULL",[user.id,b.channel]);
    await db.query("INSERT INTO auth_challenges (user_id,channel,purpose,code_digest,expires_at) VALUES ($1,$2,'verify_contact',$3,NOW()+INTERVAL '5 minutes')",
      [user.id,b.channel,security.digestChallenge(code,env.AUTH_CHALLENGE_PEPPER)]);
    try {
      await sendVerificationEmail({to:user.destination,code,expiresMinutes:5});
    } catch (mailError) {
      console.error("Verification email resend failed:", {
        name: mailError?.name || "Error",
        code: mailError?.code || null,
        responseCode: mailError?.responseCode || null
      });
      await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND channel=$2 AND purpose='verify_contact' AND consumed_at IS NULL",[user.id,b.channel]).catch(()=>{});
      return res.status(503).json({error:"We could not send the verification code. Please try again later."});
    }
    return res.json({ok:true,channel:b.channel,destination:mask(b.channel,user.destination),expiresIn:300});
  } catch {
    return res.status(503).json({error:"Verification is temporarily unavailable."});
  }
});

router.post("/password/forgot", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  if(typeof b.channel!=="string" || b.channel !== "email" || typeof b.destination!=="string") {
    return res.status(400).json({error:"Enter the email address or phone number linked to your account."});
  }
  try {
    let destination;
    try { destination=b.channel==="email"?security.normalizeEmail(b.destination):security.normalizePhone(b.destination); }
    catch { return res.json({ok:true,message:"If the account exists, a reset code will be sent."}); }
    const col=b.channel==="email"?"email":"phone";
    const found=await db.query("SELECT id,status,"+col+" AS destination FROM users WHERE "+col+"=$1 LIMIT 1",[destination]);
    const user=found.rows[0];
    if(user && user.status==="active") {
      const recent=await db.query("SELECT last_sent_at FROM auth_challenges WHERE user_id=$1 AND channel=$2 AND purpose='password_reset' ORDER BY created_at DESC LIMIT 1",[user.id,b.channel]);
      if(!recent.rows[0] || Date.now()-new Date(recent.rows[0].last_sent_at).getTime()>=60000) {
        const code=security.createOtp();
        await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND channel=$2 AND purpose='password_reset' AND consumed_at IS NULL",[user.id,b.channel]);
        await db.query("INSERT INTO auth_challenges (user_id,channel,purpose,code_digest,expires_at) VALUES ($1,$2,'password_reset',$3,NOW()+INTERVAL '5 minutes')",
          [user.id,b.channel,security.digestChallenge(code,env.AUTH_CHALLENGE_PEPPER)]);
        try {
          await sendVerificationEmail({to:destination,code,expiresMinutes:5});
        } catch {
          await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND channel=$2 AND purpose='password_reset' AND consumed_at IS NULL",[user.id,b.channel]).catch(()=>{});
        }
      }
    }
    return res.json({ok:true,message:"If the account exists, a reset code will be sent."});
  } catch {
    return res.json({ok:true,message:"If the account exists, a reset code will be sent."});
  }
});

router.post("/password/reset", async (req,res) => {
  const db=req.app.locals.db, env=req.app.locals.authEnv||process.env, b=req.body||{};
  if(typeof b.destination!=="string" || b.channel !== "email" || !/^\d{6}$/.test(String(b.code||""))) {
    return res.status(400).json({error:"Invalid password reset request."});
  }
  try { security.validatePassword(b.newPassword); }
  catch(e) { return res.status(400).json({error:e.message}); }
  let destination;
  try { destination=b.channel==="email"?security.normalizeEmail(b.destination):security.normalizePhone(b.destination); }
  catch { return res.status(400).json({error:"The code is invalid or expired."}); }
  const c=await db.connect();
  try {
    await c.query("BEGIN");
    const col=b.channel==="email"?"email":"phone";
    const found=await c.query("SELECT u.id,ch.id AS challenge_id,ch.code_digest,ch.expires_at,ch.failed_attempts,ch.max_attempts FROM users u JOIN auth_challenges ch ON ch.user_id=u.id WHERE u."+col+"=$1 AND u.status='active' AND ch.channel=$2 AND ch.purpose='password_reset' AND ch.consumed_at IS NULL ORDER BY ch.created_at DESC LIMIT 1 FOR UPDATE OF ch",
      [destination,b.channel]);
    const challenge=found.rows[0];
    if(!challenge || new Date(challenge.expires_at)<=new Date() || challenge.failed_attempts>=challenge.max_attempts) {
      await c.query("ROLLBACK"); return res.status(400).json({error:"The code is invalid or expired."});
    }
    const actual=Buffer.from(security.digestChallenge(b.code,env.AUTH_CHALLENGE_PEPPER),"hex");
    const expected=Buffer.from(challenge.code_digest,"hex");
    if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) {
      await c.query("UPDATE auth_challenges SET failed_attempts=failed_attempts+1 WHERE id=$1",[challenge.challenge_id]);
      await c.query("COMMIT"); return res.status(400).json({error:"The code is invalid or expired."});
    }
    const passwordHash=await security.hashPassword(b.newPassword);
    await c.query("UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1",[challenge.id,passwordHash]);
    await c.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE id=$1",[challenge.challenge_id]);
    await c.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL",[challenge.id]);
    await c.query("COMMIT");
    return res.json({ok:true,message:"Password updated. Please sign in again."});
  } catch {
    await c.query("ROLLBACK").catch(()=>{});
    return res.status(503).json({error:"Password reset is temporarily unavailable."});
  } finally { c.release(); }
});


module.exports=router;
