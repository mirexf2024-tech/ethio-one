const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
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
const uuid=v=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const actionLimiter=(limit,windowMs,message)=>rateLimit({windowMs,limit,standardHeaders:"draft-7",legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:message})});
const postCreateLimit=actionLimiter(5,60*60*1000,"You have reached the post limit. Please try again later.");
const commentCreateLimit=actionLimiter(15,60*1000,"You are commenting too quickly. Please wait a moment.");
const reportCreateLimit=actionLimiter(5,15*60*1000,"You have reached the report limit. Please try again later.");
const storyCreateLimit=actionLimiter(4,60*60*1000,"You have reached the story limit. Please try again later.");
const messageCreateLimit=actionLimiter(20,60*1000,"You are sending messages too quickly. Please wait a moment.");
const interactionLimit=actionLimiter(60,60*1000,"You are doing that too quickly. Please wait a moment.");
async function notifyMentions(db,body,actorId,postId,commentId=null){
  const handles=[...new Set([...String(body||"").matchAll(/(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g)].map(x=>x[1].toLowerCase()))].slice(0,10);
  if(!handles.length)return;
  try { await db.query(
    `INSERT INTO notifications(user_id,title,body,kind,data)
     SELECT DISTINCT recipient.id,'You were mentioned',actor.full_name||actor.username||'A member',
       'social_mention',
       jsonb_build_object('postId',p.id,'commentId',$5::uuid,'actorId',actor.id)
     FROM users recipient
     JOIN social_posts p ON p.id=$3 AND p.status='published'
     JOIN users actor ON actor.id=$2
     WHERE recipient.status='active' AND recipient.id<>actor.id
       AND lower(recipient.username)=ANY($1::text[])
       AND (p.visibility='public' OR p.user_id=recipient.id OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=recipient.id AND f.following_id=p.user_id))
       AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=recipient.id OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=recipient.id AND pf.following_id=p.user_id))
       AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=recipient.id AND b.blocked_id=actor.id) OR (b.blocker_id=actor.id AND b.blocked_id=recipient.id))
       AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM social_comments c WHERE c.id=$5 AND c.post_id=p.id AND c.status='published'))`,
    [handles,actorId,postId,commentId]
  ); } catch { /* Do not fail a published post/comment if a notification cannot be queued. */ }
}
const safeMedia = media => Array.isArray(media) && media.length<=4 && media.every(x=>x && typeof x.publicId==="string" && x.publicId.length<=255 && typeof x.url==="string" && x.url.startsWith("https://res.cloudinary.com/") && x.url.includes("/upload/") && ["image","video"].includes(x.type));
router.use(async(req,res,next)=>{
  if(!req.app.locals.db) return res.status(503).json({error:"Social service is temporarily unavailable."});
  next();
});
router.use(optionalAuth);


router.get("/profile/me",requireAuth,async(req,res)=>{
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,u.ethio_id,p.bio,p.avatar_url,p.city,p.region,p.country,COALESCE(p.profile_visibility,'public') AS profile_visibility,(SELECT COUNT(*)::int FROM social_follows WHERE following_id=u.id) AS followers,(SELECT COUNT(*)::int FROM social_follows WHERE follower_id=u.id) AS following,(SELECT COUNT(*)::int FROM social_posts WHERE user_id=u.id AND status='published') AS posts FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1",[req.socialUserId]);
  return res.set("Cache-Control","no-store").json({profile:r.rows[0]||null});
 }catch{return res.status(503).json({error:"Profile unavailable."});}
});
router.get("/users/search",async(req,res)=>{
 const q=String(req.query.q||"").trim().slice(0,50);
 if(q.length<2)return res.json({users:[]});
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,p.avatar_url,(SELECT COUNT(*)::int FROM social_follows f WHERE f.following_id=u.id) AS followers,CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=u.id) END AS following FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.status='active' AND (u.username ILIKE $1 OR u.full_name ILIKE $1) AND ($2::uuid IS NULL OR u.id<>$2) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2))) ORDER BY u.full_name LIMIT 20",["%"+q+"%",req.socialUserId]);
  return res.set("Cache-Control","no-store").json({users:r.rows});
 }catch{return res.status(503).json({error:"Search unavailable."});}
});
router.get("/users/:id/profile",async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid account."});
 try{
  const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,p.bio,p.avatar_url,p.city,p.region,p.country,COALESCE(p.profile_visibility,'public') AS profile_visibility,(SELECT COUNT(*)::int FROM social_follows WHERE following_id=u.id) AS followers,(SELECT COUNT(*)::int FROM social_follows WHERE follower_id=u.id) AS following,(SELECT COUNT(*)::int FROM social_posts WHERE user_id=u.id AND status='published') AS posts,CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_follows WHERE follower_id=$2 AND following_id=u.id) END AS is_following FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.status='active' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker_id=$2 AND blocked_id=u.id) OR (blocker_id=u.id AND blocked_id=$2))) AND (COALESCE(p.profile_visibility,'public')='public' OR u.id=$2 OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$2 AND pf.following_id=u.id))",[req.params.id,req.socialUserId]);
  if(!r.rowCount)return res.status(404).json({error:"Profile not found."});
  const posts=await req.app.locals.db.query(
   `SELECT p.id,p.body,p.media,p.visibility,p.created_at,u.id AS author_id,u.username,u.full_name,up.avatar_url,
    (SELECT COUNT(*)::int FROM social_likes l WHERE l.post_id=p.id) AS like_count,
    (SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,
    CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$2) END AS liked,
        CASE WHEN $2::uuid IS NULL THEN NULL ELSE (SELECT l.reaction FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$2) END AS my_reaction,
    CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_bookmarks b WHERE b.post_id=p.id AND b.user_id=$2) END AS bookmarked
    FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_profiles up ON up.user_id=u.id
    WHERE p.user_id=$1 AND p.status='published'
    AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id))
    AND (COALESCE(up.profile_visibility,'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$2 AND pf.following_id=p.user_id))
    AND NOT EXISTS(SELECT 1 FROM social_blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$2))
    ORDER BY p.created_at DESC LIMIT 30`,
   [req.params.id,req.socialUserId]
  );
  return res.set("Cache-Control","no-store").json({profile:r.rows[0],posts:posts.rows});
 }catch{return res.status(503).json({error:"Profile unavailable."});}
});

const postSearchLimit=actionLimiter(20,60*1000,"You are searching too quickly. Please wait a moment.");
router.get("/posts/search",postSearchLimit,async(req,res)=>{
  const term=String(req.query.q||"").trim().slice(0,80);
  if(term.length<2)return res.json({posts:[]});
  try{
    const q=await req.app.locals.db.query(
      `SELECT p.id,p.body,p.media,p.visibility,p.created_at,u.id AS author_id,u.username,u.full_name,up.avatar_url,
       (SELECT COUNT(*)::int FROM social_likes l WHERE l.post_id=p.id) AS like_count,
       (SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,
       CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$1) END AS liked,
       CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_bookmarks b WHERE b.post_id=p.id AND b.user_id=$1) END AS bookmarked
       FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_profiles up ON up.user_id=u.id
       WHERE p.status='published' AND p.body ILIKE $2
       AND (p.user_id=$1 OR p.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id))
       AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$1 AND pv.following_id=p.user_id))
       AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)))
       ORDER BY p.created_at DESC LIMIT 30`,
      [req.socialUserId,"%"+term+"%"]
    );
    return res.set("Cache-Control","no-store").json({posts:q.rows});
  }catch{return res.status(503).json({error:"Post search is temporarily unavailable."});}
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
       WHERE p.status='published' AND (p.user_id=$1 OR p.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id))
       AND ($3::text <> 'following' OR EXISTS(SELECT 1 FROM social_follows ff WHERE ff.follower_id=$1 AND ff.following_id=p.user_id))
       AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$1 AND pv.following_id=p.user_id)) AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)))
       ${cursorSql} ORDER BY p.created_at DESC LIMIT $2`,values);
    return res.set("Cache-Control","no-store").json({posts:q.rows});
  }catch{return res.status(503).json({error:"The feed is temporarily unavailable."});}
});

router.get("/posts/:id",async(req,res)=>{
  if(!uuid(req.params.id))return res.status(400).json({error:"Invalid post."});
  try{
    const q=await req.app.locals.db.query(
      `SELECT p.id,p.body,p.media,p.visibility,p.created_at,u.id AS author_id,u.username,u.full_name,up.avatar_url,
       (SELECT COUNT(*)::int FROM social_likes l WHERE l.post_id=p.id) AS like_count,
       (SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,
       CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$2) END AS liked,
        CASE WHEN $2::uuid IS NULL THEN NULL ELSE (SELECT l.reaction FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$2) END AS my_reaction,
       CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_bookmarks b WHERE b.post_id=p.id AND b.user_id=$2) END AS bookmarked
       FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_profiles up ON up.user_id=u.id
       WHERE p.id=$1 AND p.status='published'
       AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id))
       AND (COALESCE(up.profile_visibility,'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$2 AND pf.following_id=p.user_id))
       AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)))`,
      [req.params.id,req.socialUserId]
    );
    if(!q.rowCount)return res.status(404).json({error:"Post not found or not available to you."});
    return res.set("Cache-Control","no-store").json({post:q.rows[0]});
  }catch{return res.status(503).json({error:"Post is temporarily unavailable."});}
});
router.post("/posts",postCreateLimit,requireAuth,async(req,res)=>{
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
    await notifyMentions(req.app.locals.db,body,req.socialUserId,r.rows[0].id);
    return res.status(201).json({post:r.rows[0]});
  }catch{return res.status(503).json({error:"Your post could not be published."});}
});
router.patch("/posts/:id",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  const body=typeof req.body?.body==="string"?req.body.body.trim():null;
  const visibility=req.body?.visibility;
  if(body===null || body.length>2000 || (visibility!==undefined && !["public","followers"].includes(visibility)))
    return res.status(400).json({error:"Check your post text and visibility."});
  try{
    const updated=await req.app.locals.db.query(
      "UPDATE social_posts SET body=$3,visibility=COALESCE($4,visibility),updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='published' RETURNING id,body,visibility,updated_at",
      [req.params.id,req.socialUserId,body,visibility??null]
    );
    return updated.rowCount?res.json({post:updated.rows[0]}):res.status(404).json({error:"Post not found."});
  }catch{return res.status(503).json({error:"Post could not be updated."});}
});
router.delete("/posts/:id",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const r=await req.app.locals.db.query("UPDATE social_posts SET status='removed',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='published' RETURNING id",[req.params.id,req.socialUserId]);
    return r.rowCount?res.json({ok:true}):res.status(404).json({error:"Post not found."});
  }catch{return res.status(503).json({error:"Post could not be removed."});}
});
router.post("/posts/:id/reaction",interactionLimit,requireAuth,async(req,res)=>{
 const reaction=req.body?.reaction;
 if(!uuid(req.params.id)||!["like","love","care","haha","wow","sad","angry"].includes(reaction))return res.status(400).json({error:"Choose a valid reaction."});
 try{
  const allowed=await req.app.locals.db.query("SELECT p.id,p.user_id FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
  if(!allowed.rowCount)return res.status(404).json({error:"Post not found."});
  const saved=await req.app.locals.db.query("INSERT INTO social_likes(post_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction RETURNING reaction",[req.params.id,req.socialUserId,reaction]);
  if(allowed.rows[0].user_id!==req.socialUserId)req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT $1,'New reaction','Someone reacted to your post.','social_like',jsonb_build_object('postId',$2,'actorId',$3) WHERE COALESCE((SELECT likes FROM social_notification_preferences WHERE user_id=$1),TRUE)",[allowed.rows[0].user_id,req.params.id,req.socialUserId]).catch(()=>{});
  return res.json({reaction:saved.rows[0].reaction,liked:true});
 }catch(err){console.error("social_post_reaction_failed",{code:err.code||null});return res.status(503).json({error:"Reaction could not be saved."});}
});
router.post("/posts/:id/like",interactionLimit,requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const c=await req.app.locals.db.connect(); await c.query("BEGIN");
    const exists=await c.query("SELECT p.id FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$2 AND pv.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
    if(!exists.rowCount){await c.query("ROLLBACK");return res.status(404).json({error:"Post not found."});}
    const prior=await c.query("DELETE FROM social_likes WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const liked=!prior.rowCount;
    if(liked) await c.query("INSERT INTO social_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,req.socialUserId]);
    if(liked) await c.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT p.user_id,'New like',u.full_name||' liked your post.','social_like',jsonb_build_object('postId',p.id,'actorId',u.id) FROM social_posts p JOIN users u ON u.id=$2 WHERE p.id=$1 AND p.user_id<>$2 AND COALESCE((SELECT likes FROM social_notification_preferences WHERE user_id=p.user_id),TRUE)",[req.params.id,req.socialUserId]);
    await c.query("COMMIT"); return res.json({liked});
  }catch{return res.status(503).json({error:"Like could not be updated."});}
});
router.get("/posts/:id/comments",async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const r=await req.app.locals.db.query("SELECT c.id,c.user_id AS author_id,c.body,c.created_at,u.username,u.full_name,up.avatar_url FROM social_comments c JOIN social_posts p ON p.id=c.post_id JOIN users u ON u.id=c.user_id LEFT JOIN user_profiles up ON up.user_id=u.id WHERE c.post_id=$1 AND c.status='published' AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$2 AND pv.following_id=p.user_id)) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.user_id) OR (b.blocker_id=c.user_id AND b.blocked_id=$2))) ORDER BY c.created_at ASC LIMIT 100",[req.params.id,req.socialUserId]);
    return res.set("Cache-Control","no-store").json({comments:r.rows});
  }catch{return res.status(503).json({error:"Comments are temporarily unavailable."});}
});
router.post("/posts/:id/comments",commentCreateLimit,requireAuth,async(req,res)=>{
  const body=typeof req.body?.body==="string"?req.body.body.trim():"";
  if(!uuid(req.params.id)||!body||body.length>1000) return res.status(400).json({error:"Write a comment of up to 1,000 characters."});
  try{
    const r=await req.app.locals.db.query("INSERT INTO social_comments(post_id,user_id,body) SELECT p.id,$2,$3 FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$2 AND pv.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)) RETURNING id,body,created_at",[req.params.id,req.socialUserId,body]);
    if(!r.rowCount)return res.status(404).json({error:"Post not found."});
    await req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT p.user_id,'New comment',u.full_name||' commented on your post.','social_comment',jsonb_build_object('postId',p.id,'commentId',$3,'actorId',u.id) FROM social_posts p JOIN users u ON u.id=$2 WHERE p.id=$1 AND p.user_id<>$2 AND COALESCE((SELECT comments FROM social_notification_preferences WHERE user_id=p.user_id),TRUE)",[req.params.id,req.socialUserId,r.rows[0].id]);
    await notifyMentions(req.app.locals.db,body,req.socialUserId,req.params.id,r.rows[0].id);
    return res.status(201).json({comment:r.rows[0]});
  }catch{return res.status(503).json({error:"Comment could not be added."});}
});
router.delete("/posts/:postId/comments/:commentId",requireAuth,async(req,res)=>{
  if(!uuid(req.params.postId)||!uuid(req.params.commentId)) return res.status(400).json({error:"Invalid comment."});
  try{
    const removed=await req.app.locals.db.query(
      "DELETE FROM social_comments c USING social_posts p WHERE c.id=$1 AND c.post_id=$2 AND c.user_id=$3 AND p.id=c.post_id RETURNING c.id",
      [req.params.commentId,req.params.postId,req.socialUserId]
    );
    return removed.rowCount?res.json({ok:true}):res.status(404).json({error:"Your comment was not found."});
  }catch{return res.status(503).json({error:"Comment could not be removed."});}
});
router.get("/bookmarks",requireAuth,async(req,res)=>{
 try{
  const r=await req.app.locals.db.query(
   `SELECT p.id,p.body,p.media,p.visibility,p.created_at,u.id AS author_id,u.username,u.full_name,up.avatar_url,
    (SELECT COUNT(*)::int FROM social_likes l WHERE l.post_id=p.id) AS like_count,
    (SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id=p.id AND c.status='published') AS comment_count,
    EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
    true AS bookmarked
    FROM social_bookmarks b JOIN social_posts p ON p.id=b.post_id JOIN users u ON u.id=p.user_id LEFT JOIN user_profiles up ON up.user_id=u.id
    WHERE b.user_id=$1 AND p.status='published'
    AND (p.visibility='public' OR p.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id))
    AND (COALESCE(up.profile_visibility,'public')='public' OR p.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$1 AND pf.following_id=p.user_id))
    AND NOT EXISTS(SELECT 1 FROM social_blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=p.user_id) OR (bl.blocker_id=p.user_id AND bl.blocked_id=$1))
    ORDER BY b.created_at DESC LIMIT 100`,[req.socialUserId]);
  return res.set("Cache-Control","no-store").json({posts:r.rows});
 }catch{return res.status(503).json({error:"Saved posts are temporarily unavailable."});}
});
router.post("/posts/:id/bookmark",interactionLimit,requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  const client=await req.app.locals.db.connect();
  try{
    await client.query("BEGIN");
    const visible=await client.query("SELECT p.id FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=p.user_id),'public')='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows pv WHERE pv.follower_id=$2 AND pv.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)) FOR UPDATE",[req.params.id,req.socialUserId]);
    if(!visible.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Post not found."});}
    const prior=await client.query("DELETE FROM social_bookmarks WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const saved=!prior.rowCount;
    if(saved) await client.query("INSERT INTO social_bookmarks(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    await client.query("COMMIT");
    return res.json({bookmarked:saved});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"Bookmark could not be updated."});}
  finally{client.release();}
});
router.post("/users/:id/follow",interactionLimit,requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId) return res.status(400).json({error:"Invalid account."});
  try{
    const target=await req.app.locals.db.query("SELECT id FROM users WHERE id=$1 AND status='active'",[req.params.id]);
    if(!target.rowCount)return res.status(404).json({error:"Account not found."});
    const blocked=await req.app.locals.db.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[req.socialUserId,req.params.id]);
    if(blocked.rowCount)return res.status(403).json({error:"Following is unavailable for this account."});
    const prior=await req.app.locals.db.query("DELETE FROM social_follows WHERE follower_id=$1 AND following_id=$2 RETURNING following_id",[req.socialUserId,req.params.id]);
    const following=!prior.rowCount;
    if(following) await req.app.locals.db.query("INSERT INTO social_follows(follower_id,following_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='active') ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    if(following) await req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT $2,'New follower',u.full_name||' started following you.','social_follow',jsonb_build_object('actorId',u.id) FROM users u WHERE u.id=$1 AND EXISTS(SELECT 1 FROM social_follows WHERE follower_id=$1 AND following_id=$2) AND COALESCE((SELECT followers FROM social_notification_preferences WHERE user_id=$2),TRUE)",[req.socialUserId,req.params.id]);
    return res.json({following});
  }catch{return res.status(503).json({error:"Follow could not be updated."});}
});
router.post("/users/:id/block",interactionLimit,requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId) return res.status(400).json({error:"Invalid account."});
  try{
    await req.app.locals.db.query("INSERT INTO social_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    await req.app.locals.db.query("DELETE FROM social_follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)",[req.socialUserId,req.params.id]);
    return res.json({blocked:true});
  }catch{return res.status(503).json({error:"Account could not be blocked."});}
});
router.get("/blocks",requireAuth,async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT u.id,u.username,u.full_name,p.avatar_url,b.created_at FROM social_blocks b JOIN users u ON u.id=b.blocked_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE b.blocker_id=$1 AND u.status='active' ORDER BY b.created_at DESC LIMIT 200",[req.socialUserId]);
    return res.set("Cache-Control","no-store").json({blockedUsers:r.rows});
  }catch{return res.status(503).json({error:"Blocked accounts are temporarily unavailable."});}
});
router.delete("/blocks/:id",interactionLimit,requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId)return res.status(400).json({error:"Invalid account."});
  try{
    const r=await req.app.locals.db.query("DELETE FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2 RETURNING blocked_id",[req.socialUserId,req.params.id]);
    return r.rowCount?res.json({blocked:false}):res.status(404).json({error:"Blocked account not found."});
  }catch{return res.status(503).json({error:"Account could not be unblocked."});}
});
router.post("/reports",reportCreateLimit,requireAuth,async(req,res)=>{
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
router.patch("/moderation/reports/:id",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id))return res.status(400).json({error:"Invalid report."});
  const status=req.body?.status, action=req.body?.action;
  if(!["reviewing","actioned","dismissed"].includes(status) || (action!==undefined && action!=="remove_target") || (action==="remove_target" && status!=="actioned"))
    return res.status(400).json({error:"Choose a valid moderation action."});
  try{
    const role=await req.app.locals.db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role_key IN ('moderator','admin','super_admin') LIMIT 1",[req.socialUserId]);
    if(!role.rowCount)return res.status(403).json({error:"Moderator access required."});
    const client=await req.app.locals.db.connect();
    try{
      await client.query("BEGIN");
      const report=await client.query("SELECT target_type,target_id FROM social_reports WHERE id=$1 AND status IN ('open','reviewing') FOR UPDATE",[req.params.id]);
      if(!report.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Open report not found."});}
      if(action==="remove_target"){
        const target=report.rows[0];
        if(target.target_type==="user"){await client.query("ROLLBACK");return res.status(400).json({error:"User reports require a separate account review."});}
        const removed=target.target_type==="post"
          ? await client.query("UPDATE social_posts SET status='removed',updated_at=NOW() WHERE id=$1 AND status='published' RETURNING id",[target.target_id])
          : await client.query("UPDATE social_comments SET status='removed' WHERE id=$1 AND status='published' RETURNING id",[target.target_id]);
        if(!removed.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Reported content was already removed or not found."});}
      }
      const updated=await client.query("UPDATE social_reports SET status=$2,reviewed_at=NOW(),reviewed_by=$3 WHERE id=$1 RETURNING id,status,reviewed_at",[req.params.id,status,req.socialUserId]);
      await client.query("COMMIT");
      return res.json({report:updated.rows[0],targetRemoved:action==="remove_target"});
    }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
    finally{client.release();}
  }catch{return res.status(503).json({error:"Report status could not be updated."});}
});

/* 24-hour stories */
router.get("/stories",async(req,res)=>{
 try{
  const r=await req.app.locals.db.query(
   `SELECT s.id,s.user_id,s.media_url,s.media_type,s.caption,s.visibility,s.created_at,s.expires_at,
    u.username,u.full_name,p.avatar_url,
    (SELECT COUNT(*)::int FROM social_story_views v WHERE v.story_id=s.id) AS views,
    CASE WHEN $1::uuid IS NULL THEN false ELSE EXISTS(SELECT 1 FROM social_story_views v WHERE v.story_id=s.id AND v.viewer_id=$1) END AS viewed
    FROM social_stories s JOIN users u ON u.id=s.user_id LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE s.expires_at>NOW() AND (COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=s.user_id),'public')='public' OR s.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$1 AND pf.following_id=s.user_id)) AND (s.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=s.user_id))
    AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=$1)))
    ORDER BY s.created_at DESC LIMIT 100`,[req.socialUserId]);
  return res.set("Cache-Control","no-store").json({stories:r.rows});
 }catch{return res.status(503).json({error:"Stories are temporarily unavailable."});}
});
router.post("/stories",storyCreateLimit,requireAuth,async(req,res)=>{
 const b=req.body||{},caption=typeof b.caption==="string"?b.caption.trim():"";
 if(typeof b.publicId!=="string"||b.publicId.length>255||typeof b.url!=="string"||!b.url.startsWith("https://res.cloudinary.com/")||!b.url.includes("/upload/")||!["image","video"].includes(b.type)||caption.length>240||!["public","followers"].includes(b.visibility||"public"))
  return res.status(400).json({error:"Check your story media and caption."});
 try{
  const owned=await req.app.locals.db.query("SELECT id FROM media_assets WHERE user_id=$1 AND public_id=$2 AND secure_url=$3 AND resource_type=$4 LIMIT 1",[req.socialUserId,b.publicId,b.url,b.type]);
  if(!owned.rowCount)return res.status(403).json({error:"This media does not belong to your account."});
  const r=await req.app.locals.db.query("INSERT INTO social_stories(user_id,media_public_id,media_url,media_type,caption,visibility) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,media_url,media_type,caption,visibility,created_at,expires_at",[req.socialUserId,b.publicId,b.url,b.type,caption,b.visibility||"public"]);
  return res.status(201).json({story:r.rows[0]});
 }catch{return res.status(503).json({error:"Story could not be published."});}
});
router.post("/stories/:id/view",interactionLimit,requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid story."});
 try{
  const allowed=await req.app.locals.db.query("SELECT s.id FROM social_stories s WHERE s.id=$1 AND s.expires_at>NOW() AND (s.user_id=$2 OR ((COALESCE((SELECT profile_visibility FROM user_profiles WHERE user_id=s.user_id),'public')='public' OR EXISTS(SELECT 1 FROM social_follows pf WHERE pf.follower_id=$2 AND pf.following_id=s.user_id)) AND (s.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=s.user_id)))) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
  if(!allowed.rowCount)return res.status(404).json({error:"Story not found."});
  await req.app.locals.db.query("INSERT INTO social_story_views(story_id,viewer_id) VALUES($1,$2) ON CONFLICT(story_id,viewer_id) DO UPDATE SET viewed_at=NOW()",[req.params.id,req.socialUserId]);
  return res.json({ok:true});
 }catch{return res.status(503).json({error:"Story view could not be saved."});}
});
router.delete("/stories/:id",requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid story."});
 try{
  const r=await req.app.locals.db.query("DELETE FROM social_stories WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.socialUserId]);
  return r.rowCount?res.json({ok:true}):res.status(404).json({error:"Story not found."});
 }catch{return res.status(503).json({error:"Story could not be removed."});}
});


/* Private one-to-one direct messages */
router.get("/conversations",requireAuth,async(req,res)=>{
 try{
  const r=await req.app.locals.db.query(
   `SELECT c.id,c.last_message_at,u.id AS other_user_id,u.username,u.full_name,p.avatar_url,
    lm.body AS last_message,lm.created_at AS last_message_created_at,
    (SELECT COUNT(*)::int FROM social_messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL) AS unread_count
    FROM social_conversations c
    JOIN users u ON u.id=CASE WHEN c.participant_one_id=$1 THEN c.participant_two_id ELSE c.participant_one_id END
    LEFT JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN LATERAL (SELECT body,created_at FROM social_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
    WHERE (c.participant_one_id=$1 OR c.participant_two_id=$1) AND u.status='active'
    AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
    ORDER BY c.last_message_at DESC LIMIT 50`,[req.socialUserId]);
  return res.set("Cache-Control","no-store").json({conversations:r.rows});
 }catch{return res.status(503).json({error:"Messages are temporarily unavailable."});}
});
router.post("/conversations",requireAuth,async(req,res)=>{
 const other=typeof req.body?.userId==="string"?req.body.userId:"";
 if(!uuid(other)||other===req.socialUserId)return res.status(400).json({error:"Choose a valid member."});
 try{
  const member=await req.app.locals.db.query("SELECT id FROM users WHERE id=$1 AND status='active'",[other]);
  if(!member.rowCount)return res.status(404).json({error:"Member not found."});
  const blocked=await req.app.locals.db.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[req.socialUserId,other]);
  if(blocked.rowCount)return res.status(403).json({error:"Messaging is unavailable for this account."});
  const r=await req.app.locals.db.query(
   "INSERT INTO social_conversations(participant_one_id,participant_two_id) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid)) ON CONFLICT(participant_one_id,participant_two_id) DO UPDATE SET last_message_at=social_conversations.last_message_at RETURNING id",
   [req.socialUserId,other]);
  return res.status(201).json({conversationId:r.rows[0].id});
 }catch{return res.status(503).json({error:"Conversation could not be opened."});}
});
router.get("/conversations/:id/messages",requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid conversation."});
 const limit=Math.min(50,Math.max(1,Number.parseInt(req.query.limit,10)||40));
 const before=typeof req.query.before==="string"&&uuid(req.query.before)?req.query.before:null;
 try{
  const member=await req.app.locals.db.query("SELECT c.id FROM social_conversations c WHERE c.id=$1 AND (c.participant_one_id=$2 OR c.participant_two_id=$2) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=CASE WHEN c.participant_one_id=$2 THEN c.participant_two_id ELSE c.participant_one_id END) OR (b.blocker_id=CASE WHEN c.participant_one_id=$2 THEN c.participant_two_id ELSE c.participant_one_id END AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
  if(!member.rowCount)return res.status(404).json({error:"Conversation not found."});
  const values=[req.params.id,limit];let cursorSql="";
  if(before){values.push(before);cursorSql=" AND m.created_at < (SELECT created_at FROM social_messages WHERE id=$3 AND conversation_id=$1)";}
  const r=await req.app.locals.db.query(
   `SELECT m.id,m.sender_id,m.body,m.media,m.read_at,m.created_at FROM social_messages m
    WHERE m.conversation_id=$1 ${cursorSql} ORDER BY m.created_at DESC LIMIT $2`,values);
  return res.set("Cache-Control","no-store").json({messages:r.rows.reverse()});
 }catch{return res.status(503).json({error:"Messages could not be loaded."});}
});
router.post("/conversations/:id/messages",messageCreateLimit,requireAuth,async(req,res)=>{
  const body=typeof req.body?.body==="string"?req.body.body.trim():"";
  const media=Array.isArray(req.body?.media)?req.body.media:[];
  if(!uuid(req.params.id)||body.length>2000||(!body&&!media.length)||media.length>4)return res.status(400).json({error:"Write a message or attach up to 4 files."});
  for(const item of media){if(!item||typeof item.publicId!=="string"||typeof item.url!=="string"||typeof item.name!=="string"||!["image","video","raw"].includes(item.type)||item.publicId.length>255||item.url.length>1000||item.name.length>160)return res.status(400).json({error:"One of the attachments is invalid."});}
  const client=await req.app.locals.db.connect();
  try{
   await client.query("BEGIN");
   const conv=await client.query("SELECT participant_one_id,participant_two_id FROM social_conversations WHERE id=$1 AND (participant_one_id=$2 OR participant_two_id=$2) FOR UPDATE",[req.params.id,req.socialUserId]);
   if(!conv.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Conversation not found."});}
   const recipient=conv.rows[0].participant_one_id===req.socialUserId?conv.rows[0].participant_two_id:conv.rows[0].participant_one_id;
   const blocked=await client.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[req.socialUserId,recipient]);
   if(blocked.rowCount){await client.query("ROLLBACK");return res.status(403).json({error:"Messaging is unavailable for this account."});}
   for(const item of media){const owned=await client.query("SELECT id FROM media_assets WHERE user_id=$1 AND public_id=$2 AND secure_url=$3 AND resource_type=$4 LIMIT 1",[req.socialUserId,item.publicId,item.url,item.type]);if(!owned.rowCount){await client.query("ROLLBACK");return res.status(403).json({error:"An attachment does not belong to this account."});}}
   const saved=await client.query("INSERT INTO social_messages(conversation_id,sender_id,body,media) VALUES($1,$2,$3,$4::jsonb) RETURNING id,sender_id,body,media,read_at,created_at",[req.params.id,req.socialUserId,body,JSON.stringify(media)]);
   await client.query("UPDATE social_conversations SET last_message_at=NOW() WHERE id=$1",[req.params.id]);
   await client.query("COMMIT");
   req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT $1,'New message','You received a new Ethio Social message.','social_message',jsonb_build_object('conversationId',$2,'messageId',$3) WHERE COALESCE((SELECT messages FROM social_notification_preferences WHERE user_id=$1),TRUE)",[recipient,req.params.id,saved.rows[0].id]).catch(err=>console.error("social_message_notification_failed",{code:err.code||null}));
   return res.status(201).json({message:saved.rows[0]});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});console.error("social_message_send_failed",{code:err.code||null,constraint:err.constraint||null});return res.status(503).json({error:"Message could not be sent. Please try again."});}
  finally{client.release();}
 });
router.post("/conversations/:id/read",requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid conversation."});
 try{
  const r=await req.app.locals.db.query(
   "UPDATE social_messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL AND EXISTS(SELECT 1 FROM social_conversations c WHERE c.id=$1 AND (c.participant_one_id=$2 OR c.participant_two_id=$2) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=CASE WHEN c.participant_one_id=$2 THEN c.participant_two_id ELSE c.participant_one_id END) OR (b.blocker_id=CASE WHEN c.participant_one_id=$2 THEN c.participant_two_id ELSE c.participant_one_id END AND b.blocked_id=$2))) RETURNING id",
   [req.params.id,req.socialUserId]);
  await req.app.locals.db.query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1 AND kind='social_message' AND data->>'conversationId'=$2 AND read_at IS NULL",[req.socialUserId,req.params.id]);
  return res.json({ok:true,markedRead:r.rowCount});
 }catch{return res.status(503).json({error:"Messages could not be marked as read."});}
});


/* WebRTC one-to-one audio/video call signaling. Media stays peer-to-peer. */
router.get("/calls/ice-servers",requireAuth,async(req,res)=>{
 const env=req.app.locals.authEnv||process.env;
 const iceServers=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];
 const urls=String(env.SOCIAL_TURN_URLS||"").split(",").map(x=>x.trim()).filter(Boolean);
 if(urls.length&&env.SOCIAL_TURN_USERNAME&&env.SOCIAL_TURN_CREDENTIAL)iceServers.push({urls,username:env.SOCIAL_TURN_USERNAME,credential:env.SOCIAL_TURN_CREDENTIAL});
 return res.set("Cache-Control","no-store").json({iceServers,relayConfigured:iceServers.length>2});
});
router.get("/calls/incoming",requireAuth,async(req,res)=>{
 try{
  await req.app.locals.db.query("UPDATE social_calls SET status='missed',ended_at=NOW() WHERE callee_id=$1 AND status='ringing' AND created_at<NOW()-INTERVAL '90 seconds'",[req.socialUserId]);
  const r=await req.app.locals.db.query(
   `SELECT c.id,c.conversation_id,c.call_type,c.status,c.created_at,u.id AS caller_id,u.username,u.full_name,p.avatar_url
    FROM social_calls c JOIN users u ON u.id=c.caller_id LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE c.callee_id=$1 AND c.status='ringing' AND c.created_at>NOW()-INTERVAL '90 seconds'
    AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
    ORDER BY c.created_at DESC LIMIT 5`,[req.socialUserId]);
  return res.set("Cache-Control","no-store").json({calls:r.rows});
 }catch{return res.status(503).json({error:"Incoming calls are temporarily unavailable."});}
});
router.post("/conversations/:id/calls",interactionLimit,requireAuth,async(req,res)=>{
 const type=req.body?.type;
 const offer=req.body?.offer;
 if(!uuid(req.params.id)||!["audio","video"].includes(type)||!offer||typeof offer!=="object"||Array.isArray(offer)||JSON.stringify(offer).length>30000)
  return res.status(400).json({error:"Invalid call request."});
 const db=req.app.locals.db;
 let client,committed=false;
 try{
  client=await db.connect();
  await client.query("BEGIN");
  const c=await client.query(
   `SELECT participant_one_id,participant_two_id FROM social_conversations
    WHERE id=$1 AND (participant_one_id=$2 OR participant_two_id=$2)`,[req.params.id,req.socialUserId]);
  if(!c.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Conversation not found."});}
  const recipient=c.rows[0].participant_one_id===req.socialUserId?c.rows[0].participant_two_id:c.rows[0].participant_one_id;
  const block=await client.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",[req.socialUserId,recipient]);
  if(block.rowCount){await client.query("ROLLBACK");return res.status(403).json({error:"Calling is unavailable for this account."});}
  const call=await client.query(
   "INSERT INTO social_calls(conversation_id,caller_id,callee_id,call_type) VALUES($1,$2,$3,$4) RETURNING id,conversation_id,call_type,status,created_at",
   [req.params.id,req.socialUserId,recipient,type]);
  await client.query("INSERT INTO social_call_signals(call_id,sender_id,signal_type,payload) VALUES($1,$2,'offer',$3::jsonb)",[call.rows[0].id,req.socialUserId,JSON.stringify(offer)]);
  await client.query("COMMIT");
  committed=true;
  await client.query(
   "INSERT INTO notifications(user_id,title,body,kind,data) VALUES($1,$2,$3,'social_call',$4::jsonb)",
   [recipient,type==="video"?"Incoming video call":"Incoming audio call","Someone is calling you on Ethio Social.",JSON.stringify({callId:call.rows[0].id,conversationId:req.params.id,callType:type})]
  ).catch(()=>{});
  return res.status(201).json({call:call.rows[0],recipientId:recipient,iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});
 }catch(e){
  if(client&&!committed)await client.query("ROLLBACK").catch(()=>{});
  if(e&&e.code==="23505")return res.status(409).json({error:"A call is already active in this conversation."});
  return res.status(503).json({error:"Call could not be started."});
 }finally{client?.release();}
});
router.get("/calls/:id",requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid call."});
 const after=Math.max(0,Number.parseInt(req.query.after,10)||0);
 try{
  const call=await req.app.locals.db.query(
   `SELECT c.id,c.conversation_id,c.caller_id,c.callee_id,c.call_type,c.status,c.created_at,c.answered_at,c.ended_at,
    u.full_name AS caller_name,u.username AS caller_username
    FROM social_calls c JOIN users u ON u.id=c.caller_id
    WHERE c.id=$1 AND (c.caller_id=$2 OR c.callee_id=$2)
    AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=CASE WHEN c.caller_id=$2 THEN c.callee_id ELSE c.caller_id END) OR (b.blocker_id=CASE WHEN c.caller_id=$2 THEN c.callee_id ELSE c.caller_id END AND b.blocked_id=$2))`,
   [req.params.id,req.socialUserId]);
  if(!call.rowCount)return res.status(404).json({error:"Call not found."});
  const signals=await req.app.locals.db.query(
   "SELECT id,signal_type,payload,sender_id,created_at FROM social_call_signals WHERE call_id=$1 AND id>$2 AND sender_id<>$3 ORDER BY id ASC LIMIT 100",
   [req.params.id,after,req.socialUserId]);
  return res.set("Cache-Control","no-store").json({call:call.rows[0],signals:signals.rows});
 }catch{return res.status(503).json({error:"Call status is unavailable."});}
});
router.post("/calls/:id/signals",interactionLimit,requireAuth,async(req,res)=>{
 const type=req.body?.type,payload=req.body?.payload;
 if(!uuid(req.params.id)||!["answer","ice"].includes(type)||!payload||typeof payload!=="object"||JSON.stringify(payload).length>30000)
  return res.status(400).json({error:"Invalid call signal."});
 try{
  const call=await req.app.locals.db.query("SELECT id,callee_id FROM social_calls WHERE id=$1 AND (caller_id=$2 OR callee_id=$2) AND status IN ('ringing','accepted') AND created_at>NOW()-INTERVAL '30 minutes'",[req.params.id,req.socialUserId]);
  if(!call.rowCount)return res.status(404).json({error:"Active call not found."});
  if(type==="answer"&&call.rows[0].callee_id!==req.socialUserId)return res.status(403).json({error:"Only the receiving member can answer this call."});
  const r=await req.app.locals.db.query("INSERT INTO social_call_signals(call_id,sender_id,signal_type,payload) VALUES($1,$2,$3,$4::jsonb) RETURNING id",[req.params.id,req.socialUserId,type,JSON.stringify(payload)]);
  return res.status(201).json({ok:true,signalId:r.rows[0].id});
 }catch{return res.status(503).json({error:"Call signal could not be sent."});}
});
router.patch("/calls/:id",requireAuth,async(req,res)=>{
 const status=req.body?.status;
 if(!uuid(req.params.id)||!["accepted","rejected","ended","missed"].includes(status))return res.status(400).json({error:"Invalid call status."});
 const db=req.app.locals.db;let client,committed=false;
 try{
  client=await db.connect();await client.query("BEGIN");
  const call=await client.query("SELECT caller_id,callee_id,status FROM social_calls WHERE id=$1 AND (caller_id=$2 OR callee_id=$2) FOR UPDATE",[req.params.id,req.socialUserId]);
  if(!call.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Call not found."});}
  const row=call.rows[0];
  if(status==="accepted"&&row.callee_id!==req.socialUserId){await client.query("ROLLBACK");return res.status(403).json({error:"Only the receiving member can accept this call."});}
  if(status==="rejected"&&row.callee_id!==req.socialUserId){await client.query("ROLLBACK");return res.status(403).json({error:"Only the receiving member can reject this call."});}
  if(status==="missed"&&row.callee_id!==req.socialUserId){await client.query("ROLLBACK");return res.status(403).json({error:"Invalid call action."});}
  const updated=await client.query(
   "UPDATE social_calls SET status=$2,answered_at=CASE WHEN $2='accepted' THEN NOW() ELSE answered_at END,ended_at=CASE WHEN $2 IN ('rejected','ended','missed') THEN NOW() ELSE ended_at END WHERE id=$1 AND status IN ('ringing','accepted') RETURNING id,status,answered_at,ended_at",
   [req.params.id,status]);
  if(!updated.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"This call has already finished."});}
  await client.query("COMMIT");committed=true;
  return res.json({call:updated.rows[0]});
 }catch{
  if(client&&!committed)await client.query("ROLLBACK").catch(()=>{});
  return res.status(503).json({error:"Call status could not be updated."});
 }finally{client?.release();}
});

module.exports=router;
