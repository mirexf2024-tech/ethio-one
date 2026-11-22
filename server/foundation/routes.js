const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const router = express.Router();

function tokenPayload(req, env) {
  const header = req.get("authorization") || "";
  const match = /^Bearer /i.test(header) ? [header, header.slice(7).trim()] : null;
  if (!match || !env.ACCESS_TOKEN_SECRET || String(env.ACCESS_TOKEN_SECRET).length < 32) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(parts[0]+"."+parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now()/1000) ? payload : null;
  } catch { return null; }
}
router.use(async (req,res,next) => {
  const env=req.app.locals.authEnv || process.env;
  const db=req.app.locals.db;
  if(env.AUTH_ENABLED!=="true" || !db) return res.status(503).json({error:"Account services are temporarily unavailable."});
  const payload=tokenPayload(req,env);
  if(!payload) return res.status(401).json({error:"Please sign in again."});
  try {
    const found=await db.query("SELECT id,ethio_id,full_name,username,email,phone,status,identity_verification_status,identity_verification_updated_at FROM users WHERE id=$1 AND status='active'",[payload.sub]);
    if(!found.rows[0]) return res.status(401).json({error:"Please sign in again."});
    req.account=found.rows[0];
    return next();
  } catch { return res.status(503).json({error:"Account services are temporarily unavailable."}); }
});

router.get("/profile", async (req,res) => {
  try {
    const [p,r] = await Promise.all([
      req.app.locals.db.query("SELECT country,region,city,bio,avatar_url,locale,profile_visibility,updated_at FROM user_profiles WHERE user_id=$1",[req.account.id]),
      req.app.locals.db.query("SELECT ur.role_key, r.display_name, COALESCE(array_agg(rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL),'{}') AS permissions FROM user_roles ur JOIN roles r ON r.role_key=ur.role_key LEFT JOIN role_permissions rp ON rp.role_key=ur.role_key WHERE ur.user_id=$1 GROUP BY ur.role_key,r.display_name",[req.account.id])
    ]);
    return res.set("Cache-Control","no-store").json({user:{id:req.account.id,ethioId:req.account.ethio_id,fullName:req.account.full_name,username:req.account.username,email:req.account.email,phone:req.account.phone,identityVerificationStatus:req.account.identity_verification_status||"unverified",identityVerificationUpdatedAt:req.account.identity_verification_updated_at||null,profile:p.rows[0]||{country:"Ethiopia",locale:"om"}},roles:r.rows});
  } catch { return res.status(503).json({error:"Profile is temporarily unavailable."}); }
});

router.patch("/profile", async (req,res) => {
  const b=req.body||{};
  const fields={country: b.country, region:b.region, city:b.city, bio:b.bio, locale:b.locale, profileVisibility:b.profileVisibility};
  for(const [key,value] of Object.entries(fields)) {
    if(value===undefined) continue;
    const max={country:80,region:100,city:100,bio:280,locale:5,profileVisibility:16}[key];
    if(typeof value!=="string" || value.length>max || /[\\r\\n]/.test(value)) return res.status(400).json({error:"Please check your profile details."});
  }
  if(b.locale!==undefined && !["om","am","en"].includes(b.locale)) return res.status(400).json({error:"Unsupported language."});
  if(b.profileVisibility!==undefined && !["public","followers"].includes(b.profileVisibility)) return res.status(400).json({error:"Choose a valid profile privacy setting."});
  if(b.avatarUrl!==undefined && (typeof b.avatarUrl!=="string" || b.avatarUrl.length>1000 || !b.avatarUrl.startsWith("https://res.cloudinary.com/"))) return res.status(400).json({error:"Please use an approved profile image."});
  if (b.avatarUrl !== undefined) {
    try {
      const owned = await req.app.locals.db.query("SELECT id FROM media_assets WHERE user_id=$1 AND secure_url=$2 AND resource_type='image' LIMIT 1", [req.account.id,b.avatarUrl]);
      if (!owned.rowCount) return res.status(403).json({error:"This profile image does not belong to your account."});
    } catch { return res.status(503).json({error:"Profile image could not be verified."}); }
  }
  try {
    await req.app.locals.db.query(
      "INSERT INTO user_profiles (user_id,country,region,city,bio,avatar_url,locale,profile_visibility) VALUES ($1,COALESCE($2,'Ethiopia'),$3,$4,$5,$6,COALESCE($7,'om'),COALESCE($8,'public')) ON CONFLICT (user_id) DO UPDATE SET country=COALESCE($2,user_profiles.country),region=COALESCE($3,user_profiles.region),city=COALESCE($4,user_profiles.city),bio=COALESCE($5,user_profiles.bio),avatar_url=COALESCE($6,user_profiles.avatar_url),locale=COALESCE($7,user_profiles.locale),profile_visibility=COALESCE($8,user_profiles.profile_visibility),updated_at=NOW()",
      [req.account.id,b.country??null,b.region??null,b.city??null,b.bio??null,b.avatarUrl??null,b.locale??null,b.profileVisibility??null]);
    return res.json({ok:true});
  } catch { return res.status(503).json({error:"Profile could not be updated."}); }
});


router.post("/identity-verification/request", async (req,res) => {
  const db=req.app.locals.db;
  const client=await db.connect();
  try {
    await client.query("BEGIN");
    const current=await client.query(
      "SELECT identity_verification_status FROM users WHERE id=$1 AND status='active' FOR UPDATE",
      [req.account.id]
    );
    if(!current.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(401).json({error:"Please sign in again."});
    }
    const status=current.rows[0].identity_verification_status || "unverified";
    if(!["unverified","needs_more_info"].includes(status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({error:"An identity verification request cannot be submitted in the current status."});
    }
    const updated=await client.query(
      "UPDATE users SET identity_verification_status='pending_review',identity_verification_updated_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING identity_verification_status,identity_verification_updated_at",
      [req.account.id]
    );
    const {digestIp}=require("../admin/audit");
    const env=req.app.locals.authEnv||process.env;
    const ipDigest=digestIp(req.ip,env.AUDIT_LOG_PEPPER);
    await client.query(
      "INSERT INTO security_events (event_type,severity,user_id,ip_digest,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
      ["identity_verification_requested","info",req.account.id,ipDigest,JSON.stringify({route:req.path,method:req.method,reason:"user_requested_identity_review"})]
    );
    await client.query("COMMIT");
    return res.status(202).set("Cache-Control","no-store").json({ok:true,verification:updated.rows[0]});
  } catch {
    await client.query("ROLLBACK").catch(()=>{});
    return res.status(503).json({error:"Identity verification request could not be submitted."});
  } finally {
    client.release();
  }
});

router.get("/roles", async (req,res) => {
  try {
    const r=await req.app.locals.db.query("SELECT ur.role_key,r.display_name FROM user_roles ur JOIN roles r ON r.role_key=ur.role_key WHERE ur.user_id=$1 ORDER BY ur.role_key",[req.account.id]);
    return res.json({roles:r.rows});
  } catch { return res.status(503).json({error:"Roles are temporarily unavailable."}); }
});

router.get("/notification-preferences",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT likes,comments,followers,messages FROM social_notification_preferences WHERE user_id=$1",[req.account.id]);
    return res.set("Cache-Control","no-store").json({preferences:r.rows[0]||{likes:true,comments:true,followers:true,messages:true}});
  }catch{return res.status(503).json({error:"Notification preferences are temporarily unavailable."});}
});
router.patch("/notification-preferences",async(req,res)=>{
  const b=req.body||{};
  const keys=["likes","comments","followers","messages"];
  if(!keys.some(k=>typeof b[k]==="boolean") || keys.some(k=>b[k]!==undefined && typeof b[k]!=="boolean"))
    return res.status(400).json({error:"Choose valid notification preferences."});
  try{
    const r=await req.app.locals.db.query(
      "INSERT INTO social_notification_preferences(user_id,likes,comments,followers,messages) VALUES($1,COALESCE($2,TRUE),COALESCE($3,TRUE),COALESCE($4,TRUE),COALESCE($5,TRUE)) ON CONFLICT(user_id) DO UPDATE SET likes=COALESCE($2,social_notification_preferences.likes),comments=COALESCE($3,social_notification_preferences.comments),followers=COALESCE($4,social_notification_preferences.followers),messages=COALESCE($5,social_notification_preferences.messages),updated_at=NOW() RETURNING likes,comments,followers,messages",
      [req.account.id,b.likes??null,b.comments??null,b.followers??null,b.messages??null]);
    return res.set("Cache-Control","no-store").json({preferences:r.rows[0]});
  }catch{return res.status(503).json({error:"Notification preferences could not be saved."});}
});

router.get("/notifications", async (req,res) => {
  const limit=Math.min(50,Math.max(1,Number.parseInt(req.query.limit,10)||20));
  try {
    const [r,u]=await Promise.all([req.app.locals.db.query("SELECT id,title,body,kind,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",[req.account.id,limit]),req.app.locals.db.query("SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id=$1 AND read_at IS NULL",[req.account.id])]);
    return res.set("Cache-Control","no-store").json({notifications:r.rows,unreadCount:u.rows[0]?.unread_count||0});
  } catch { return res.status(503).json({error:"Notifications are temporarily unavailable."}); }
});
router.post("/notifications/:id/read", async (req,res) => {
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({error:"Invalid notification."});
  try {
    const r=await req.app.locals.db.query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.account.id]);
    return r.rowCount ? res.json({ok:true}) : res.status(404).json({error:"Notification not found."});
  } catch { return res.status(503).json({error:"Notification could not be updated."}); }
});

router.get("/media", async (req,res) => {
  try {
    const r=await req.app.locals.db.query("SELECT id,secure_url,resource_type,bytes,created_at FROM media_assets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.account.id]);
    return res.json({media:r.rows});
  } catch { return res.status(503).json({error:"Media library is temporarily unavailable."}); }
});

router.post("/media/sign", rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:"draft-7",legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:"Too many upload attempts. Please try again later."})}), async (req,res) => {
  const env=req.app.locals.authEnv||process.env;
  if(!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return res.status(503).json({error:"Media upload is not configured yet."});
  const resourceType=req.body?.resourceType==="video"?"video":"image";
  const timestamp=Math.floor(Date.now()/1000);
  const folder="ethio-one/"+req.account.id;
  const params={folder,timestamp};
  const canonical=Object.keys(params).sort().map(k=>k+"="+params[k]).join("&");
  const signature=crypto.createHmac("sha1",env.CLOUDINARY_API_SECRET).update(canonical).digest("hex");
  return res.json({cloudName:env.CLOUDINARY_CLOUD_NAME,apiKey:env.CLOUDINARY_API_KEY,timestamp,folder,signature,resourceType});
});

router.post("/media", rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:"draft-7",legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:"Too many media registrations. Please try again later."})}), async (req,res) => {
  const b=req.body||{};
  const ownFolder="ethio-one/"+req.account.id+"/";
  let mediaUrl=null;
  try { mediaUrl=new URL(b.secureUrl); } catch {}
  if(typeof b.publicId!=="string" || b.publicId.length>255 || !b.publicId.startsWith(ownFolder) || b.publicId.includes("..") ||
     typeof b.secureUrl!=="string" || b.secureUrl.length>1000 || !mediaUrl || mediaUrl.protocol!=="https:" ||
     mediaUrl.hostname!=="res.cloudinary.com" || !mediaUrl.pathname.includes("/"+b.resourceType+"/upload/") ||
     !mediaUrl.pathname.includes("/"+ownFolder) ||
     !["image","video"].includes(b.resourceType) || !Number.isSafeInteger(b.bytes) || b.bytes<1 || b.bytes>100*1024*1024) {
    return res.status(400).json({error:"Invalid media details or media ownership."});
  }
  try {
    const r=await req.app.locals.db.query("INSERT INTO media_assets (user_id,public_id,secure_url,resource_type,bytes) VALUES ($1,$2,$3,$4,$5) RETURNING id,secure_url,resource_type,bytes,created_at",[req.account.id,b.publicId,b.secureUrl,b.resourceType,b.bytes]);
    return res.status(201).json({media:r.rows[0]});
  } catch { return res.status(409).json({error:"Media asset could not be saved."}); }
});

module.exports=router;
