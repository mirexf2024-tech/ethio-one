const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const router = express.Router();

function readToken(req, env) {
  const header=req.get("authorization")||"";
  if(!/^Bearer /i.test(header)||!env.ACCESS_TOKEN_SECRET||String(env.ACCESS_TOKEN_SECRET).length<32)return null;
  const parts=header.slice(7).trim().split(".");
  if(parts.length!==3)return null;
  try {
    const expected=crypto.createHmac("sha256",env.ACCESS_TOKEN_SECRET).update(parts[0]+"."+parts[1]).digest();
    const actual=Buffer.from(parts[2],"base64url");
    if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
    const payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
    return payload.sub&&Number.isInteger(payload.exp)&&payload.exp>Math.floor(Date.now()/1000)?payload:null;
  } catch { return null; }
}
router.use(async(req,res,next)=>{
  const env=req.app.locals.authEnv||process.env, db=req.app.locals.db, payload=readToken(req,env);
  if(env.AUTH_ENABLED!=="true"||!db)return res.status(503).json({error:"Ethio Earn is temporarily unavailable."});
  if(!payload)return res.status(401).json({error:"Please sign in again."});
  try{
    const r=await db.query("SELECT id,status FROM users WHERE id=$1 AND status='active'",[payload.sub]);
    if(!r.rows[0])return res.status(401).json({error:"Please sign in again."});
    req.earnUser=r.rows[0];
    next();
  }catch{return res.status(503).json({error:"Ethio Earn is temporarily unavailable."});}
});
async function isReviewer(db,userId){
  const r=await db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role_key IN ('super_admin','admin','finance_manager','moderator') LIMIT 1",[userId]);
  return !!r.rowCount;
}
router.use("/admin",async(req,res,next)=>{
  try{
    if(!await isReviewer(req.app.locals.db,req.earnUser.id))return res.status(403).json({error:"You do not have permission to manage Ethio Earn."});
    return next();
  }catch{return res.status(503).json({error:"Admin permissions are temporarily unavailable."});}
});
function validId(v){return typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);}
function amount(v){return Number.isSafeInteger(v)&&v>0&&v<=100000000;}
async function hasRole(db,userId,roles){
  const r=await db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role_key=ANY($2::text[]) LIMIT 1",[userId,roles]);
  return !!r.rowCount;
}
async function requireRoles(req,res,roles){
  try{if(await hasRole(req.app.locals.db,req.earnUser.id,roles))return true;res.status(403).json({error:"You do not have permission for this Ethio Earn action."});return false;}
  catch{res.status(503).json({error:"Role permissions are temporarily unavailable."});return false;}
}
const TASK_TYPES=new Set(["data_labeling","transcription","translation","survey","research","data_entry","content_review","qa_testing","design","video_audio","local_data","other"]);
function safeHttpsUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"&&u.hostname.includes(".")&&!["localhost","127.0.0.1"].includes(u.hostname)&&!u.hostname.endsWith(".local")?u.toString():null;}catch{return null;}
}
function blockedTaskText(value){
  return /(pay\s+to\s+(unlock|join|start)|deposit\s+(money|crypto)|leave\s+(a\s+)?positive\s+review|rate\s+(five|5)\s+stars|buy\s+then\s+review|fake\s+engagement|follow\s+and\s+like\s+for\s+pay|product\s+boosting)/i.test(value);
}
async function publishReadyRequest(client,row){
  if(!row||row.status!=="moderator_approved"||row.funding_status!=="verified"||row.campaign_id)return null;
  const inserted=await client.query(
    "INSERT INTO earn_campaigns(title,description,instructions,category,task_type,delivery_mode,provider_name,provider_url,reward_minor,budget_minor,max_completions,evidence_required,evidence_hint,estimated_minutes,skill_level,language_codes,quality_criteria,funding_status,funding_reference,funding_verified_by,funding_verified_at,moderation_status,moderator_id,moderated_at,status,created_by) VALUES($1,$2,$3,$4,$5,'partner_link',$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15,'verified',$16,$17,$18,'approved',$19,$20,'published',$21) RETURNING id,title,status",
    [row.task_title,row.task_description,row.task_instructions,row.task_type,row.provider_name,row.provider_url,row.reward_minor,row.budget_minor,row.max_completions,row.evidence_hint,row.estimated_minutes,row.skill_level,row.language_codes,row.quality_criteria,row.funding_reference,row.funding_verified_by,row.funding_verified_at,row.moderator_id,row.moderated_at,row.requester_id]
  );
  const campaign=inserted.rows[0];
  await client.query("UPDATE earn_task_requests SET status='published',campaign_id=$2,updated_at=NOW() WHERE id=$1",[row.id,campaign.id]);
  return campaign;
}

router.get("/campaigns",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query(
      "SELECT id,title,description,instructions,category,task_type,delivery_mode,provider_name,provider_url,estimated_minutes,skill_level,language_codes,quality_criteria,reward_minor,budget_minor-reserved_minor AS remaining_budget_minor,max_completions-reserved_completions AS remaining_slots,evidence_required,evidence_hint,ends_at FROM earn_campaigns WHERE status='published' AND funding_status='verified' AND moderation_status='approved' AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>NOW()) AND reserved_completions<max_completions AND reserved_minor<budget_minor ORDER BY created_at DESC LIMIT 100");
    return res.set("Cache-Control","no-store").json({campaigns:r.rows,currency:"ETB"});
  }catch{return res.status(503).json({error:"Tasks are temporarily unavailable."});}
});
router.get("/me/summary",async(req,res)=>{
  try{
    const [pending,credits,history]=await Promise.all([
      req.app.locals.db.query("SELECT COALESCE(SUM(c.reward_minor),0)::bigint AS pending_minor,COUNT(*)::int AS pending_count FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.user_id=$1 AND s.status='pending'",[req.earnUser.id]),
      req.app.locals.db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS earned_minor,COUNT(*)::int AS approved_count FROM earn_ledger WHERE user_id=$1",[req.earnUser.id]),
      req.app.locals.db.query("SELECT s.id,s.status,s.created_at,s.reviewed_at,s.review_note,c.title,c.reward_minor FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 30",[req.earnUser.id])
    ]);
    return res.set("Cache-Control","no-store").json({summary:{pendingMinor:Number(pending.rows[0].pending_minor),pendingCount:pending.rows[0].pending_count,earnedMinor:Number(credits.rows[0].earned_minor),approvedCount:credits.rows[0].approved_count,payoutsEnabled:false},history:history.rows});
  }catch{return res.status(503).json({error:"Your earnings summary is temporarily unavailable."});}
});
router.post("/campaigns/:id/submit",rateLimit({windowMs:60*60*1000,limit:12,standardHeaders:"draft-7",legacyHeaders:false}),async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:"Invalid task."});
  const b=req.body||{};
  const evidenceText=typeof b.evidenceText==="string"?b.evidenceText.trim():"";
  const evidenceUrl=typeof b.evidenceUrl==="string"?b.evidenceUrl.trim():"";
  if(evidenceText.length>2000||evidenceUrl.length>1000|| (evidenceUrl&&!/^https:\/\//i.test(evidenceUrl)))return res.status(400).json({error:"Please check your proof details."});
  const db=req.app.locals.db,client=await db.connect();
  try{
    await client.query("BEGIN");
    const c=await client.query("SELECT * FROM earn_campaigns WHERE id=$1 AND status='published' FOR UPDATE",[req.params.id]);
    const campaign=c.rows[0];
    if(!campaign||(campaign.starts_at&&new Date(campaign.starts_at)>new Date())||(campaign.ends_at&&new Date(campaign.ends_at)<=new Date())){await client.query("ROLLBACK");return res.status(404).json({error:"This task is no longer available."});}
    if(campaign.evidence_required&&!evidenceText&&!evidenceUrl){await client.query("ROLLBACK");return res.status(400).json({error:"Please provide the required task proof."});}
    if(Number(campaign.reserved_completions)>=campaign.max_completions||Number(campaign.reserved_minor)+Number(campaign.reward_minor)>Number(campaign.budget_minor)){await client.query("ROLLBACK");return res.status(409).json({error:"This task has reached its limit."});}
    const s=await client.query("INSERT INTO earn_submissions(campaign_id,user_id,evidence_text,evidence_url) VALUES($1,$2,$3,$4) RETURNING id,status,created_at",[campaign.id,req.earnUser.id,evidenceText,evidenceUrl||null]);
    await client.query("UPDATE earn_campaigns SET reserved_completions=reserved_completions+1,reserved_minor=reserved_minor+reward_minor,updated_at=NOW() WHERE id=$1",[campaign.id]);
    await client.query("COMMIT");
    return res.status(201).json({ok:true,submission:s.rows[0],message:"Your task proof was submitted for review."});
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    if(e.code==="23505")return res.status(409).json({error:"You have already submitted this task."});
    return res.status(503).json({error:"Your submission could not be saved."});
  }finally{client.release();}
});
router.get("/admin/access",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role_key='super_admin' LIMIT 1",[req.earnUser.id]);
    return res.set("Cache-Control","no-store").json({canOpenCentralAdmin:!!r.rowCount});
  }catch{return res.status(503).json({error:"Permission details are temporarily unavailable."});}
});
router.get("/admin/campaigns",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT id,title,description,category,reward_minor,budget_minor,max_completions,reserved_completions,status,created_at FROM earn_campaigns ORDER BY created_at DESC LIMIT 100");
    return res.set("Cache-Control","no-store").json({campaigns:r.rows});
  }catch{return res.status(503).json({error:"Task management is temporarily unavailable."});}
});
router.get("/admin/submissions",async(req,res)=>{
  try{
    const status=["pending","approved","rejected"].includes(req.query.status)?req.query.status:"pending";
    const r=await req.app.locals.db.query("SELECT s.id,s.user_id,u.username,u.full_name,s.campaign_id,c.title,c.reward_minor,s.evidence_text,s.evidence_url,s.status,s.created_at FROM earn_submissions s JOIN users u ON u.id=s.user_id JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.status=$1 ORDER BY s.created_at ASC LIMIT 100",[status]);
    return res.json({submissions:r.rows});
  }catch{return res.status(503).json({error:"Review queue is temporarily unavailable."});}
});
router.post("/admin/campaigns",async(req,res)=>{
  const db=req.app.locals.db;
  const b=req.body||{};
  const title=typeof b.title==="string"?b.title.trim():"",description=typeof b.description==="string"?b.description.trim():"",instructions=typeof b.instructions==="string"?b.instructions.trim():"";
  const category=typeof b.category==="string"?b.category.trim().toLowerCase():"general";
  if(title.length<5||title.length>140||description.length<10||description.length>1200||instructions.length<10||instructions.length>10000||!amount(b.rewardMinor)||!amount(b.budgetMinor)||b.budgetMinor<b.rewardMinor||!Number.isInteger(b.maxCompletions)||b.maxCompletions<1||b.maxCompletions>100000||b.budgetMinor<b.rewardMinor*b.maxCompletions||!/^[a-z0-9_-]{2,40}$/.test(category))return res.status(400).json({error:"Please check the task details and budget."});
  try{
    const r=await db.query("INSERT INTO earn_campaigns(title,description,instructions,category,reward_minor,budget_minor,max_completions,evidence_required,evidence_hint,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,title,status,reward_minor,budget_minor,max_completions,created_at",[title,description,instructions,category,b.rewardMinor,b.budgetMinor,b.maxCompletions,b.evidenceRequired!==false,typeof b.evidenceHint==="string"?b.evidenceHint.slice(0,300):"",req.earnUser.id]);
    const { recordSecurityEvent } = require("../admin/audit");
    const auditRecorded = await recordSecurityEvent(req,{type:"earn_campaign_created",severity:"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:r.rows[0].status}});
    return res.status(201).json({campaign:r.rows[0],auditRecorded});
  }catch{return res.status(503).json({error:"The task could not be created."});}
});
router.patch("/admin/campaigns/:id/status",async(req,res)=>{
  if(!validId(req.params.id)||!["published","paused","archived"].includes(req.body?.status))return res.status(400).json({error:"Invalid task status."});
  try{
    const r=await req.app.locals.db.query("UPDATE earn_campaigns SET status=$2,updated_at=NOW() WHERE id=$1 AND status IN ('draft','published','paused') RETURNING id,status",[req.params.id,req.body.status]);
    if(!r.rowCount)return res.status(404).json({error:"Task not found or cannot be changed."});
    const { recordSecurityEvent } = require("../admin/audit");
    const auditRecorded = await recordSecurityEvent(req,{type:"earn_campaign_status_updated",severity:req.body.status==="archived"||req.body.status==="paused"?"warning":"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:r.rows[0].status}});
    return res.set("Cache-Control","no-store").json({campaign:r.rows[0],auditRecorded});
  }catch{return res.status(503).json({error:"Task status could not be updated."});}
});
router.post("/admin/submissions/:id/review",async(req,res)=>{
  const db=req.app.locals.db;
  if(!validId(req.params.id)||!["approved","rejected"].includes(req.body?.decision))return res.status(400).json({error:"Invalid review decision."});
  const note=typeof req.body.note==="string"?req.body.note.trim().slice(0,500):"";
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const r=await client.query("SELECT s.*,c.reward_minor,c.id AS cid FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.id=$1 FOR UPDATE OF s", [req.params.id]);
    const s=r.rows[0];
    if(!s||s.status!=="pending"){await client.query("ROLLBACK");return res.status(409).json({error:"This submission has already been reviewed."});}
    if(req.body.decision==="approved"){
      await client.query("UPDATE earn_submissions SET status='approved',reviewer_id=$2,review_note=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1",[s.id,req.earnUser.id,note]);
      await client.query("INSERT INTO earn_ledger(user_id,submission_id,amount_minor) VALUES($1,$2,$3)",[s.user_id,s.id,s.reward_minor]);
    }else{
      await client.query("UPDATE earn_submissions SET status='rejected',reviewer_id=$2,review_note=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1",[s.id,req.earnUser.id,note]);
      await client.query("UPDATE earn_campaigns SET reserved_completions=GREATEST(0,reserved_completions-1),reserved_minor=GREATEST(0,reserved_minor-$2),updated_at=NOW() WHERE id=$1",[s.cid,s.reward_minor]);
    }
    await client.query("COMMIT");
    const { recordSecurityEvent } = require("../admin/audit");
    const auditRecorded = await recordSecurityEvent(req,{type:"earn_submission_reviewed",severity:req.body.decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{submission_id:s.id,status:req.body.decision}});
    return res.set("Cache-Control","no-store").json({ok:true,status:req.body.decision,auditRecorded});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"The review could not be saved."});}
  finally{client.release();}
});
module.exports=router;
