const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();

function payload(req) {
  const env=req.app.locals.authEnv||process.env;
  const h=req.get("authorization")||"", m=/^Bearer\s+(.+)$/i.exec(h);
  if(!m || !env.ACCESS_TOKEN_SECRET) return null;
  const p=m[1].split(".");
  if(p.length!==3) return null;
  try {
    const expected=crypto.createHmac("sha256",env.ACCESS_TOKEN_SECRET).update(p[0]+"."+p[1]).digest();
    const actual=Buffer.from(p[2],"base64url");
    if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return null;
    const data=JSON.parse(Buffer.from(p[1],"base64url").toString("utf8"));
    return data.sub && Number.isInteger(data.exp) && data.exp>Math.floor(Date.now()/1000) ? data : null;
  } catch { return null; }
}
async function optionalAuth(req,res,next) {
  const p=payload(req); req.socialUserId=null;
  if(!p) return next();
  try {
    const r=await req.app.locals.db.query("SELECT id FROM users WHERE id=$1 AND status='active'",[p.sub]);
    req.socialUserId=r.rows[0]?.id||null; return next();
  } catch { return res.status(503).json({error:"Social service is temporarily unavailable."}); }
}
async function requireAuth(req,res,next) {
  if(!req.socialUserId) return res.status(401).json({error:"Sign in to use this feature."});
  next();
}
const uuid=v=>typeof v==="string" && /^[0-9a-f-]{36}$/i.test(v);
const safeMedia = media => Array.isArray(media) && media.length<=4 && media.every(x=>x && typeof x.publicId==="string" && x.publicId.length<=255 && typeof x.url==="string" && x.url.startsWith("https://res.cloudinary.com/") && x.url.includes("/upload/") && ["image","video"].includes(x.type));
router.use(async(req,res,next)=>{
  if(!req.app.locals.db) return res.status(503).json({error:"Social service is temporarily unavailable."});
  next();
});
router.use(optionalAuth);


router.get("/profile/me",requireAuth,async(req,res)=>{
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,u.ethio_id,p.bio,p.avatar_url,p.city,p.region,p.country,(SELECT COUNT(*)::int FROM social_follows WHERE following_id=u.id) AS followers,(SELECT COUNT(*)::int FROM social_follows WHERE follower_id=u.id) AS following,(SELECT COUNT(*)::int FROM social_posts WHERE user_id=u.id AND status='published') AS posts FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1",[req.socialUserId]);
  return res.json({profile:r.rows[0]||null});
 }catch{return res.status(503).json({error:"Profile unavailable."});}
});
router.get("/users/search",async(req,res)=>{
 const q=String(req.query.q||"").trim().slice(0,50);
 if(q.length<2)return res.json({users:[]});
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,p.avatar_url,(SELECT COUNT(*)::int FROM social_follows f WHERE f.following_id=u.id) AS followers,CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=u.id) END AS following FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.status='active' AND (u.username ILIKE $1 OR u.full_name ILIKE $1) AND ($2::uuid IS NULL OR u.id<>$2) ORDER BY u.full_name LIMIT 20",["%"+q+"%",req.socialUserId]);
  return res.json({users:r.rows});
 }catch{return res.status(503).json({error:"Search unavailable."});}
});
router.get("/users/:id/profile",async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid account."});
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,p.bio,p.avatar_url,p.city,p.region,p.country,(SELECT COUNT(*)::int FROM social_follows WHERE following_id=u.id) AS followers,(SELECT COUNT(*)::int FROM social_follows WHERE follower_id=u.id) AS following,(SELECT COUNT(*)::int FROM social_posts WHERE user_id=u.id AND status='published') AS posts,CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_follows WHERE follower_id=$2 AND following_id=u.id) END AS is_following FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.status='active' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker_id=$2 AND blocked_id=u.id) OR (blocker_id=u.id AND blocked_id=$2)))",[req.params.id,req.socialUserId]);
  if(!r.rowCount)return res.status(404).json({error:"Profile not found."});
  return res.json({profile:r.rows[0]});
 }catch{return res.status(503).json({error:"Profile unavailable."});}
});

router.get("/feed",async(req,res)=>{
  const limit=Math.min(30,Math.max(1,Number.parseInt(req.query.limit,10)||15));
  const cursor=typeof req.query.before==="string" && uuid(req.query.before)?req.query.before:null;
  try{
    const feed=req.query.feed==="following"?"following":"all";
    const values=[req.socialUserId,limit,feed]; let cursorSql="";
    if(cursor){values.push(cursor);cursorSql=" AND p.created_at < (SELECT created_at FROM social_posts WHERE id=$4)";}
    const q=await req.app.locals.db.query(
      `SELECT p.id,p.body,p.media,p.visibility,p.created_at,u.id AS author_id,u.username,u.full_name,up.avatar_url,
       (SELECT COUNT(*)::int FROM social_likes l WHERE l.post_id=p.id) AS like_count,
       (SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,
       CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$1) END AS liked,
       CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_bookmarks b WHERE b.post_id=p.id AND b.user_id=$1) END AS bookmarked
       FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_profiles up ON up.user_id=u.id
       WHERE p.status='published' AND (p.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id))
       AND ($3::text <> 'following' OR EXISTS(SELECT 1 FROM social_follows ff WHERE ff.follower_id=$1 AND ff.following_id=p.user_id))
       AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)))
       ${cursorSql} ORDER BY p.created_at DESC LIMIT $2`,values);
    return res.set("Cache-Control","no-store").json({posts:q.rows});
  }catch{return res.status(503).json({error:"The feed is temporarily unavailable."});}
});

router.post("/posts",requireAuth,async(req,res)=>{
  const b=req.body||{}, body=typeof b.body==="string"?b.body.trim():"", media=b.media===undefined?[]:b.media;
  if(body.length>2000 || (!body && !media.length) || !safeMedia(media) || !["public","followers"].includes(b.visibility||"public"))
    return res.status(400).json({error:"Check your post text and attachments."});
  try{
    // Only attach Cloudinary assets that this signed-in account previously registered.
    for (const item of media) {
      const owned = await req.app.locals.db.query(
        "SELECT id FROM media_assets WHERE user_id=$1 AND public_id=$2 AND secure_url=$3 AND resource_type=$4 LIMIT 1",
        [req.socialUserId,item.publicId,item.url,item.type]
      );
      if (!owned.rowCount) return res.status(403).json({error:"One or more attachments do not belong to this account."});
    }
    const r=await req.app.locals.db.query("INSERT INTO social_posts(user_id,body,media,visibility) VALUES($1,$2,$3::jsonb,$4) RETURNING id,body,media,visibility,created_at",
      [req.socialUserId,body,JSON.stringify(media),b.visibility||"public"]);
    return res.status(201).json({post:r.rows[0]});
  }catch{return res.status(503).json({error:"Your post could not be published."});}
});
router.delete("/posts/:id",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const r=await req.app.locals.db.query("UPDATE social_posts SET status='removed',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='published' RETURNING id",[req.params.id,req.socialUserId]);
    return r.rowCount?res.json({ok:true}):res.status(404).json({error:"Post not found."});
  }catch{return res.status(503).json({error:"Post could not be removed."});}
});
router.post("/posts/:id/like",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const c=await req.app.locals.db.connect(); await c.query("BEGIN");
    const exists=await c.query("SELECT id FROM social_posts WHERE id=$1 AND status='published'",[req.params.id]);
    if(!exists.rowCount){await c.query("ROLLBACK");return res.status(404).json({error:"Post not found."});}
    const prior=await c.query("DELETE FROM social_likes WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const liked=!prior.rowCount;
    if(liked) await c.query("INSERT INTO social_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,req.socialUserId]);
    await c.query("COMMIT"); return res.json({liked});
  }catch{return res.status(503).json({error:"Like could not be updated."});}
});
router.get("/posts/:id/comments",async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const r=await req.app.locals.db.query("SELECT c.id,c.body,c.created_at,u.username,u.full_name,up.avatar_url FROM social_comments c JOIN users u ON u.id=c.user_id LEFT JOIN user_profiles up ON up.user_id=u.id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 100",[req.params.id]);
    return res.json({comments:r.rows});
  }catch{return res.status(503).json({error:"Comments are temporarily unavailable."});}
});
router.post("/posts/:id/comments",requireAuth,async(req,res)=>{
  const body=typeof req.body?.body==="string"?req.body.body.trim():"";
  if(!uuid(req.params.id)||!body||body.length>1000) return res.status(400).json({error:"Write a comment of up to 1,000 characters."});
  try{
    const r=await req.app.locals.db.query("INSERT INTO social_comments(post_id,user_id,body) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=$1 AND status='published') RETURNING id,body,created_at",[req.params.id,req.socialUserId,body]);
    return r.rowCount?res.status(201).json({comment:r.rows[0]}):res.status(404).json({error:"Post not found."});
  }catch{return res.status(503).json({error:"Comment could not be added."});}
});
router.post("/posts/:id/bookmark",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const prior=await req.app.locals.db.query("DELETE FROM social_bookmarks WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const saved=!prior.rowCount;
    if(saved) await req.app.locals.db.query("INSERT INTO social_bookmarks(user_id,post_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=$2 AND status='published') ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    return res.json({bookmarked:saved});
  }catch{return res.status(503).json({error:"Bookmark could not be updated."});}
});
router.post("/users/:id/follow",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId) return res.status(400).json({error:"Invalid account."});
  try{
    const prior=await req.app.locals.db.query("DELETE FROM social_follows WHERE follower_id=$1 AND following_id=$2 RETURNING following_id",[req.socialUserId,req.params.id]);
    const following=!prior.rowCount;
    if(following) await req.app.locals.db.query("INSERT INTO social_follows(follower_id,following_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='active') ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    return res.json({following});
  }catch{return res.status(503).json({error:"Follow could not be updated."});}
});
router.post("/users/:id/block",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId) return res.status(400).json({error:"Invalid account."});
  try{
    await req.app.locals.db.query("INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    await req.app.locals.db.query("DELETE FROM social_follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)",[req.socialUserId,req.params.id]);
    return res.json({blocked:true});
  }catch{return res.status(503).json({error:"Account could not be blocked."});}
});
router.post("/reports",requireAuth,async(req,res)=>{
  const b=req.body||{};
  if(!["post","comment","user"].includes(b.targetType)||!uuid(b.targetId)||!["spam","harassment","hate","violence","nudity","misinformation","impersonation","other"].includes(b.reason)|| (b.details!==undefined && (typeof b.details!=="string"||b.details.length>500)))
    return res.status(400).json({error:"Check the report details."});
  try{
    const r=await req.app.locals.db.query("INSERT INTO social_reports(reporter_id,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at",[req.socialUserId,b.targetType,b.targetId,b.reason,b.details||null]);
    return res.status(201).json({report:r.rows[0]});
  }catch{return res.status(503).json({error:"Report could not be submitted."});}
});
router.get("/moderation/reports",requireAuth,async(req,res)=>{
  try{
    const role=await req.app.locals.db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role_key IN ('moderator','admin','super_admin') LIMIT 1",[req.socialUserId]);
    if(!role.rowCount) return res.status(403).json({error:"Moderator access required."});
    const r=await req.app.locals.db.query("SELECT id,target_type,target_id,reason,details,status,created_at FROM social_reports WHERE status IN ('open','reviewing') ORDER BY created_at ASC LIMIT 100");
    return res.json({reports:r.rows});
  }catch{return res.status(503).json({error:"Moderation queue is unavailable."});}
});
module.exports=router;
