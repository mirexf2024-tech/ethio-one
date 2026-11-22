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
    const exists=await c.query("SELECT p.id FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
    if(!exists.rowCount){await c.query("ROLLBACK");return res.status(404).json({error:"Post not found."});}
    const prior=await c.query("DELETE FROM social_likes WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const liked=!prior.rowCount;
    if(liked) await c.query("INSERT INTO social_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,req.socialUserId]);
    if(liked) await c.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT p.user_id,'New like',u.full_name||' liked your post.','social_like',jsonb_build_object('postId',p.id,'actorId',u.id) FROM social_posts p JOIN users u ON u.id=$2 WHERE p.id=$1 AND p.user_id<>$2",[req.params.id,req.socialUserId]);
    await c.query("COMMIT"); return res.json({liked});
  }catch{return res.status(503).json({error:"Like could not be updated."});}
});
router.get("/posts/:id/comments",async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const r=await req.app.locals.db.query("SELECT c.id,c.body,c.created_at,u.username,u.full_name,up.avatar_url FROM social_comments c JOIN social_posts p ON p.id=c.post_id JOIN users u ON u.id=c.user_id LEFT JOIN user_profiles up ON up.user_id=u.id WHERE c.post_id=$1 AND c.status='published' AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.user_id) OR (b.blocker_id=c.user_id AND b.blocked_id=$2))) ORDER BY c.created_at ASC LIMIT 100",[req.params.id,req.socialUserId]);
    return res.json({comments:r.rows});
  }catch{return res.status(503).json({error:"Comments are temporarily unavailable."});}
});
router.post("/posts/:id/comments",commentCreateLimit,requireAuth,async(req,res)=>{
  const body=typeof req.body?.body==="string"?req.body.body.trim():"";
  if(!uuid(req.params.id)||!body||body.length>1000) return res.status(400).json({error:"Write a comment of up to 1,000 characters."});
  try{
    const r=await req.app.locals.db.query("INSERT INTO social_comments(post_id,user_id,body) SELECT p.id,$2,$3 FROM social_posts p WHERE p.id=$1 AND p.status='published' AND (p.visibility='public' OR p.user_id=$2 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2)) RETURNING id,body,created_at",[req.params.id,req.socialUserId,body]);
    if(!r.rowCount)return res.status(404).json({error:"Post not found."});
    await req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT p.user_id,'New comment',u.full_name||' commented on your post.','social_comment',jsonb_build_object('postId',p.id,'commentId',$3,'actorId',u.id) FROM social_posts p JOIN users u ON u.id=$2 WHERE p.id=$1 AND p.user_id<>$2",[req.params.id,req.socialUserId,r.rows[0].id]);
    return res.status(201).json({comment:r.rows[0]});
  }catch{return res.status(503).json({error:"Comment could not be added."});}
});
router.post("/posts/:id/bookmark",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)) return res.status(400).json({error:"Invalid post."});
  try{
    const prior=await req.app.locals.db.query("DELETE FROM social_bookmarks WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[req.params.id,req.socialUserId]);
    const saved=!prior.rowCount;
    if(saved) await req.app.locals.db.query("INSERT INTO social_bookmarks(user_id,post_id) SELECT $1,p.id FROM social_posts p WHERE p.id=$2 AND p.status='published' AND (p.visibility='public' OR p.user_id=$1 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$1)) ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    return res.json({bookmarked:saved});
  }catch{return res.status(503).json({error:"Bookmark could not be updated."});}
});
router.post("/users/:id/follow",requireAuth,async(req,res)=>{
  if(!uuid(req.params.id)||req.params.id===req.socialUserId) return res.status(400).json({error:"Invalid account."});
  try{
    const target=await req.app.locals.db.query("SELECT id FROM users WHERE id=$1 AND status='active'",[req.params.id]);
    if(!target.rowCount)return res.status(404).json({error:"Account not found."});
    const blocked=await req.app.locals.db.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[req.socialUserId,req.params.id]);
    if(blocked.rowCount)return res.status(403).json({error:"Following is unavailable for this account."});
    const prior=await req.app.locals.db.query("DELETE FROM social_follows WHERE follower_id=$1 AND following_id=$2 RETURNING following_id",[req.socialUserId,req.params.id]);
    const following=!prior.rowCount;
    if(following) await req.app.locals.db.query("INSERT INTO social_follows(follower_id,following_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='active') ON CONFLICT DO NOTHING",[req.socialUserId,req.params.id]);
    if(following) await req.app.locals.db.query("INSERT INTO notifications(user_id,title,body,kind,data) SELECT $2,'New follower',u.full_name||' started following you.','social_follow',jsonb_build_object('actorId',u.id) FROM users u WHERE u.id=$1 AND EXISTS(SELECT 1 FROM social_follows WHERE follower_id=$1 AND following_id=$2)",[req.socialUserId,req.params.id]);
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
    WHERE s.expires_at>NOW() AND (s.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.following_id=s.user_id))
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
router.post("/stories/:id/view",requireAuth,async(req,res)=>{
 if(!uuid(req.params.id))return res.status(400).json({error:"Invalid story."});
 try{
  const allowed=await req.app.locals.db.query("SELECT s.id FROM social_stories s WHERE s.id=$1 AND s.expires_at>NOW() AND (s.user_id=$2 OR s.visibility='public' OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$2 AND f.following_id=s.user_id)) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=$2))",[req.params.id,req.socialUserId]);
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
   `SELECT m.id,m.sender_id,m.body,m.read_at,m.created_at FROM social_messages m
    WHERE m.conversation_id=$1 ${cursorSql} ORDER BY m.created_at DESC LIMIT $2`,values);
  return res.set("Cache-Control","no-store").json({messages:r.rows.reverse()});
 }catch{return res.status(503).json({error:"Messages could not be loaded."});}
});
router.post("/conversations/:id/messages",messageCreateLimit,requireAuth,async(req,res)=>{
 const body=typeof req.body?.body==="string"?req.body.body.trim():"";
 if(!uuid(req.params.id)||!body||body.length>2000)return res.status(400).json({error:"Write a message of up to 2,000 characters."});
 const client=await req.app.locals.db.connect();
 try{
  await client.query("BEGIN");
  const conv=await client.query("SELECT participant_one_id,participant_two_id FROM social_conversations WHERE id=$1 AND (participant_one_id=$2 OR participant_two_id=$2) FOR UPDATE",[req.params.id,req.socialUserId]);
  if(!conv.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Conversation not found."});}
  const recipient=conv.rows[0].participant_one_id===req.socialUserId?conv.rows[0].participant_two_id:conv.rows[0].participant_one_id;
  const blocked=await client.query("SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[req.socialUserId,recipient]);
  if(blocked.rowCount){await client.query("ROLLBACK");return res.status(403).json({error:"Messaging is unavailable for this account."});}
  const saved=await client.query("INSERT INTO social_messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,body,read_at,created_at",[req.params.id,req.socialUserId,body]);
  await client.query("UPDATE social_conversations SET last_message_at=NOW() WHERE id=$1",[req.params.id]);
  await client.query("INSERT INTO notifications(user_id,title,body,kind,data) VALUES($1,'New message','You received a new Ethio Social message.','social_message',jsonb_build_object('conversationId',$2,'messageId',$3))",[recipient,req.params.id,saved.rows[0].id]);
  await client.query("COMMIT");
  return res.status(201).json({message:saved.rows[0]});
 }catch{
  await client.query("ROLLBACK").catch(()=>{});
  return res.status(503).json({error:"Message could not be sent."});
 }finally{client.release();}
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

module.exports=router;
