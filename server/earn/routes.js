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
    "INSERT INTO earn_campaigns(title,description,instructions,category,task_type,delivery_mode,provider_name,provider_url,reward_minor,budget_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,max_completions,evidence_required,evidence_hint,estimated_minutes,skill_level,language_codes,quality_criteria,funding_status,funding_reference,funding_verified_by,funding_verified_at,moderation_status,moderator_id,moderated_at,status,created_by) VALUES($1,$2,$3,$4,$4,'partner_link',$5,$6,$7,$8,$9,$10,1000,$11,TRUE,$12,$13,$14,$15,$16,'verified',$17,$18,$19,'approved',$20,$21,'published',$22) RETURNING id,title,status",
    [row.task_title,row.task_description,row.task_instructions,row.task_type,row.provider_name,row.provider_url,row.reward_minor,row.budget_minor,row.reward_pool_minor,row.platform_fee_minor,row.max_completions,row.evidence_hint,row.estimated_minutes,row.skill_level,row.language_codes,row.quality_criteria,row.funding_reference,row.funding_verified_by,row.funding_verified_at,row.moderator_id,row.moderated_at,row.requester_id]
  );
  const campaign=inserted.rows[0];
  await client.query("INSERT INTO earn_platform_revenue(campaign_id,gross_funding_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,funding_reference,verified_by,funded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[campaign.id,row.budget_minor,row.reward_pool_minor,row.platform_fee_minor,row.platform_fee_bps,row.funding_reference,row.funding_verified_by,row.funding_verified_at]);
  await client.query("UPDATE earn_task_requests SET status='published',campaign_id=$2,updated_at=NOW() WHERE id=$1",[row.id,campaign.id]);
  return campaign;
}

router.get("/campaigns",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query(
      "SELECT id,title,description,instructions,category,task_type,delivery_mode,provider_name,provider_url,estimated_minutes,skill_level,language_codes,quality_criteria,reward_minor,reward_pool_minor-reserved_minor AS remaining_budget_minor,max_completions-reserved_completions AS remaining_slots,evidence_required,evidence_hint,ends_at FROM earn_campaigns WHERE status='published' AND funding_status='verified' AND moderation_status='approved' AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>NOW()) AND reserved_completions<max_completions AND reserved_minor<budget_minor ORDER BY created_at DESC LIMIT 100");
    return res.set("Cache-Control","no-store").json({campaigns:r.rows,currency:"ETB"});
  }catch{return res.status(503).json({error:"Tasks are temporarily unavailable."});}
});
router.get("/me/summary",async(req,res)=>{
  try{
    const [pending,credits,history]=await Promise.all([
      req.app.locals.db.query("SELECT COALESCE(SUM(c.reward_minor),0)::bigint AS pending_minor,COUNT(*)::int AS pending_count FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.user_id=$1 AND s.status='pending'",[req.earnUser.id]),
      req.app.locals.db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS earned_minor,COUNT(*)::int AS approved_count FROM earn_ledger WHERE user_id=$1",[req.earnUser.id]),
      req.app.locals.db.query("SELECT s.id,s.status,s.created_at,s.reviewed_at,s.review_note,c.title,c.reward_minor,a.status AS appeal_status FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id LEFT JOIN earn_submission_appeals a ON a.submission_id=s.id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 30",[req.earnUser.id])
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
    const c=await client.query("SELECT * FROM earn_campaigns WHERE id=$1 AND status='published' AND funding_status='verified' AND moderation_status='approved' FOR UPDATE",[req.params.id]);
    const campaign=c.rows[0];
    if(!campaign||(campaign.starts_at&&new Date(campaign.starts_at)>new Date())||(campaign.ends_at&&new Date(campaign.ends_at)<=new Date())){await client.query("ROLLBACK");return res.status(404).json({error:"This task is no longer available."});}
    if(campaign.evidence_required&&!evidenceText&&!evidenceUrl){await client.query("ROLLBACK");return res.status(400).json({error:"Please provide the required task proof."});}
    if(Number(campaign.reserved_completions)>=campaign.max_completions||Number(campaign.reserved_minor)+Number(campaign.reward_minor)>Number(campaign.reward_pool_minor)){await client.query("ROLLBACK");return res.status(409).json({error:"This task has reached its limit."});}
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
router.post("/submissions/:id/appeal",rateLimit({windowMs:24*60*60*1000,limit:3,standardHeaders:"draft-7",legacyHeaders:false}),async(req,res)=>{
  const reason=typeof req.body?.reason==="string"?req.body.reason.trim():"";
  if(!validId(req.params.id)||reason.length<20||reason.length>1000)return res.status(400).json({error:"Explain the appeal in at least 20 characters."});
  try{
    const found=await req.app.locals.db.query("SELECT id,status,reviewed_at FROM earn_submissions WHERE id=$1 AND user_id=$2",[req.params.id,req.earnUser.id]);
    const s=found.rows[0];
    if(!s||s.status!=="rejected"||!s.reviewed_at||new Date(s.reviewed_at)<new Date(Date.now()-7*24*60*60*1000))return res.status(409).json({error:"Appeals are available only for rejected tasks within seven days."});
    const r=await req.app.locals.db.query("INSERT INTO earn_submission_appeals(submission_id,user_id,reason) VALUES($1,$2,$3) RETURNING id,status,created_at",[s.id,req.earnUser.id,reason]);
    const {recordSecurityEvent}=require("../admin/audit");
    await recordSecurityEvent(req,{type:"earn_appeal_submitted",severity:"info",userId:req.earnUser.id,metadata:{submission_id:s.id,status:"pending"}});
    return res.status(201).json({appeal:r.rows[0]});
  }catch(e){if(e.code==="23505")return res.status(409).json({error:"An appeal has already been submitted for this task."});return res.status(503).json({error:"Your appeal could not be saved."});}
});
router.post("/submissions/:id/resubmit",async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:"Invalid submission."});
  const evidenceText=typeof req.body?.evidenceText==="string"?req.body.evidenceText.trim():"";
  const evidenceUrl=typeof req.body?.evidenceUrl==="string"?req.body.evidenceUrl.trim():"";
  if(evidenceText.length>2000||evidenceUrl.length>1000||(evidenceUrl&&!/^https:\/\//i.test(evidenceUrl))||(!evidenceText&&!evidenceUrl))return res.status(400).json({error:"Provide updated task proof."});
  const client=await req.app.locals.db.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT s.*,c.reward_minor,c.id AS cid,c.status AS campaign_status,c.funding_status,c.moderation_status,c.reserved_completions,c.max_completions,c.reserved_minor,c.budget_minor,c.ends_at,a.id AS appeal_id,a.status AS appeal_status FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id JOIN earn_submission_appeals a ON a.submission_id=s.id WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s,c,a",[req.params.id,req.earnUser.id]);
    const s=found.rows[0];
    if(!s||s.status!=="rejected"||s.appeal_status!=="accepted"||s.campaign_status!=="published"||s.funding_status!=="verified"||s.moderation_status!=="approved"||(s.ends_at&&new Date(s.ends_at)<=new Date())){await client.query("ROLLBACK");return res.status(409).json({error:"This task is not eligible for resubmission."});}
    if(Number(s.reserved_completions)>=s.max_completions||Number(s.reserved_minor)+Number(s.reward_minor)>Number(s.budget_minor)){await client.query("ROLLBACK");return res.status(409).json({error:"This task no longer has funded capacity."});}
    await client.query("UPDATE earn_campaigns SET reserved_completions=reserved_completions+1,reserved_minor=reserved_minor+reward_minor,updated_at=NOW() WHERE id=$1",[s.cid]);
    await client.query("UPDATE earn_submissions SET evidence_text=$2,evidence_url=$3,status='pending',reviewer_id=NULL,review_note='',reviewed_at=NULL,updated_at=NOW() WHERE id=$1",[s.id,evidenceText,evidenceUrl||null]);
    await client.query("UPDATE earn_submission_appeals SET status='reopened' WHERE id=$1",[s.appeal_id]);
    await client.query("COMMIT");
    return res.status(200).json({ok:true,message:"Updated proof resubmitted for review."});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"Your revised proof could not be submitted."});}
  finally{client.release();}
});
router.get("/admin/appeals",async(req,res)=>{
  if(!await requireRoles(req,res,["moderator","admin","super_admin"]))return;
  const status=["pending","accepted","rejected","reopened"].includes(req.query.status)?req.query.status:"pending";
  try{
    const r=await req.app.locals.db.query("SELECT a.id,a.submission_id,a.user_id,a.reason,a.status,a.created_at,u.username,u.full_name,c.title,s.review_note AS rejection_reason FROM earn_submission_appeals a JOIN users u ON u.id=a.user_id JOIN earn_submissions s ON s.id=a.submission_id JOIN earn_campaigns c ON c.id=s.campaign_id WHERE a.status=$1 ORDER BY a.created_at ASC LIMIT 100",[status]);
    return res.set("Cache-Control","no-store").json({appeals:r.rows});
  }catch{return res.status(503).json({error:"Appeal queue is unavailable."});}
});
router.patch("/admin/appeals/:id/review",async(req,res)=>{
  if(!await requireRoles(req,res,["moderator","admin","super_admin"]))return;
  const decision=req.body?.decision,note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,500):"";
  if(!validId(req.params.id)||!["accepted","rejected"].includes(decision)||note.length<3)return res.status(400).json({error:"Choose a decision and add a review note."});
  try{
    const original=await req.app.locals.db.query("SELECT s.reviewer_id FROM earn_submission_appeals a JOIN earn_submissions s ON s.id=a.submission_id WHERE a.id=$1 AND a.status='pending'",[req.params.id]);
    if(!original.rowCount)return res.status(409).json({error:"This appeal has already been reviewed."});
    if(original.rows[0].reviewer_id===req.earnUser.id)return res.status(403).json({error:"A different moderator must review an appeal."});
    const r=await req.app.locals.db.query("UPDATE earn_submission_appeals SET status=$2,reviewer_id=$3,review_note=$4,reviewed_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status,submission_id",[req.params.id,decision,req.earnUser.id,note]);
    if(!r.rowCount)return res.status(409).json({error:"This appeal has already been reviewed."});
    const {recordSecurityEvent}=require("../admin/audit");
    const logged=await recordSecurityEvent(req,{type:"earn_appeal_reviewed",severity:decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{submission_id:r.rows[0].submission_id,status:decision}});
    if(!logged)return res.status(503).json({error:"Appeal decision saved but audit confirmation failed."});
    return res.set("Cache-Control","no-store").json({appeal:r.rows[0]});
  }catch{return res.status(503).json({error:"Appeal review could not be saved."});}
});
router.get("/my-requests",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT id,organization_name,task_title,task_description,task_instructions,task_type,provider_name,provider_url,quality_criteria,status,funding_status,review_note,campaign_id,created_at,updated_at FROM earn_task_requests WHERE requester_id=$1 ORDER BY created_at DESC LIMIT 30",[req.earnUser.id]);
    return res.set("Cache-Control","no-store").json({requests:r.rows});
  }catch{return res.status(503).json({error:"Your task requests are temporarily unavailable."});}
});
router.patch("/requests/:id",async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:"Invalid request."});
  const b=req.body||{};
  const title=typeof b.title==="string"?b.title.trim():"";
  const description=typeof b.description==="string"?b.description.trim():"";
  const instructions=typeof b.instructions==="string"?b.instructions.trim():"";
  const quality=typeof b.qualityCriteria==="string"?b.qualityCriteria.trim():"";
  if(title.length<5||title.length>140||description.length<10||description.length>1200||instructions.length<10||instructions.length>10000||quality.length<5||quality.length>1500||blockedTaskText([title,description,instructions].join(" ")))return res.status(400).json({error:"Please correct the task details and quality criteria."});
  try{
    const r=await req.app.locals.db.query("UPDATE earn_task_requests SET task_title=$3,task_description=$4,task_instructions=$5,quality_criteria=$6,status='submitted',funding_status='unverified',funding_reference=NULL,funding_verified_by=NULL,funding_verified_at=NULL,moderator_id=NULL,moderated_at=NULL,review_note='',updated_at=NOW() WHERE id=$1 AND requester_id=$2 AND status='needs_changes' RETURNING id,status,funding_status,updated_at",[req.params.id,req.earnUser.id,title,description,instructions,quality]);
    if(!r.rowCount)return res.status(409).json({error:"Only requests marked for changes can be revised."});
    return res.json({request:r.rows[0],message:"Updated request sent back for moderation and funding review."});
  }catch{return res.status(503).json({error:"Your revised request could not be saved."});}
});
router.post("/requests",rateLimit({windowMs:24*60*60*1000,limit:3,standardHeaders:"draft-7",legacyHeaders:false}),async(req,res)=>{
  const b=req.body||{};
  const organizationName=typeof b.organizationName==="string"?b.organizationName.trim():"";
  const organizationWebsite=safeHttpsUrl(typeof b.organizationWebsite==="string"?b.organizationWebsite.trim():"");
  const title=typeof b.title==="string"?b.title.trim():"";
  const description=typeof b.description==="string"?b.description.trim():"";
  const instructions=typeof b.instructions==="string"?b.instructions.trim():"";
  const taskType=String(b.taskType||"");
  const providerName=typeof b.providerName==="string"?b.providerName.trim():"";
  const providerUrl=safeHttpsUrl(typeof b.providerUrl==="string"?b.providerUrl.trim():"");
  const rewardMinor=b.rewardMinor,budgetMinor=b.budgetMinor,slots=b.maxCompletions,minutes=b.estimatedMinutes;
  const rewardPoolMinor=Number.isSafeInteger(rewardMinor)&&Number.isInteger(slots)?rewardMinor*slots:0;
  const platformFeeBps=1000,platformFeeMinor=Math.ceil(rewardPoolMinor*platformFeeBps/10000);
  const skill=["beginner","intermediate","advanced"].includes(b.skillLevel)?b.skillLevel:"beginner";
  const languages=Array.isArray(b.languages)?b.languages.filter(x=>["om","am","en"].includes(x)).slice(0,3):["om","am","en"];
  const evidenceHint=typeof b.evidenceHint==="string"?b.evidenceHint.trim().slice(0,300):"";
  const quality=typeof b.qualityCriteria==="string"?b.qualityCriteria.trim().slice(0,1500):"";
  if(organizationName.length<2||organizationName.length>160||!organizationWebsite||title.length<5||title.length>140||description.length<10||description.length>1200||instructions.length<10||instructions.length>10000||!TASK_TYPES.has(taskType)||providerName.length<2||providerName.length>160||!providerUrl||!amount(rewardMinor)||!amount(budgetMinor)||!Number.isInteger(slots)||slots<1||slots>100000||budgetMinor!==rewardPoolMinor+platformFeeMinor||!Number.isInteger(minutes)||minutes<1||minutes>1440||!quality||blockedTaskText([title,description,instructions].join(" "))){
    return res.status(400).json({error:"Check task details. Paid reviews, fake engagement, deposits and pay-to-unlock tasks are not allowed."});
  }
  try{
    const user=await req.app.locals.db.query("SELECT email,email_verified_at FROM users WHERE id=$1",[req.earnUser.id]);
    if(!user.rows[0]?.email||!user.rows[0]?.email_verified_at)return res.status(403).json({error:"Verify your email before submitting a partner task."});
    const r=await req.app.locals.db.query(
      "INSERT INTO earn_task_requests(requester_id,organization_name,organization_website,contact_email,task_title,task_description,task_instructions,task_type,provider_name,provider_url,reward_minor,budget_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,max_completions,estimated_minutes,skill_level,language_codes,evidence_hint,quality_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id,status,funding_status,created_at",
      [req.earnUser.id,organizationName,organizationWebsite,user.rows[0].email,title,description,instructions,taskType,providerName,providerUrl,rewardMinor,budgetMinor,rewardPoolMinor,platformFeeMinor,platformFeeBps,slots,minutes,skill,languages.length?languages:["om","am","en"],evidenceHint,quality]
    );
    const {recordSecurityEvent}=require("../admin/audit");
    await recordSecurityEvent(req,{type:"earn_task_request_submitted",severity:"info",userId:req.earnUser.id,metadata:{request_id:r.rows[0].id,task_type:taskType,status:"submitted"}});
    return res.status(201).json({request:r.rows[0],message:"Request submitted. It will appear only after content review and verified funding."});
  }catch{return res.status(503).json({error:"Your partner task request could not be saved."});}
});
router.get("/admin/access",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT role_key FROM user_roles WHERE user_id=$1 ORDER BY role_key",[req.earnUser.id]);
    const roles=r.rows.map(x=>x.role_key);
    return res.set("Cache-Control","no-store").json({canOpenCentralAdmin:roles.includes("super_admin"),roles});
  }catch{return res.status(503).json({error:"Permission details are temporarily unavailable."});}
});
router.get("/admin/campaigns",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query("SELECT id,title,description,category,task_type,delivery_mode,provider_name,provider_url,estimated_minutes,skill_level,reward_minor,budget_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,max_completions,reserved_completions,status,funding_status,funding_reference,moderation_status,created_at FROM earn_campaigns ORDER BY created_at DESC LIMIT 100");
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
router.get("/admin/requests",async(req,res)=>{
  try{
    const r=await req.app.locals.db.query(
      "SELECT r.id,r.requester_id,u.full_name,u.username,r.organization_name,r.organization_website,r.contact_email,r.task_title,r.task_description,r.task_instructions,r.task_type,r.provider_name,r.provider_url,r.reward_minor,r.budget_minor,r.reward_pool_minor,r.platform_fee_minor,r.platform_fee_bps,r.max_completions,r.estimated_minutes,r.skill_level,r.language_codes,r.evidence_hint,r.quality_criteria,r.status,r.funding_status,r.funding_reference,r.review_note,r.campaign_id,r.created_at FROM earn_task_requests r JOIN users u ON u.id=r.requester_id WHERE r.status<>'published' ORDER BY r.created_at ASC LIMIT 100");
    return res.set("Cache-Control","no-store").json({requests:r.rows});
  }catch{return res.status(503).json({error:"Partner task review queue is unavailable."});}
});
router.patch("/admin/requests/:id/moderation",async(req,res)=>{
  if(!await requireRoles(req,res,["moderator","admin","super_admin"]))return;
  const decision=req.body?.decision,note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,500):"";
  if(!validId(req.params.id)||!["approved","needs_changes","rejected"].includes(decision)||note.length<3)return res.status(400).json({error:"Choose a valid decision and add a review note."});
  const client=await req.app.locals.db.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM earn_task_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    const row=found.rows[0];
    if(!row||row.status==="published"||row.status==="rejected"){await client.query("ROLLBACK");return res.status(409).json({error:"This request can no longer be reviewed."});}
    const status=decision==="approved"?"moderator_approved":decision;
    const updated=await client.query("UPDATE earn_task_requests SET status=$2,moderator_id=$3,moderated_at=NOW(),review_note=$4,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,status,req.earnUser.id,note]);
    const campaign=await publishReadyRequest(client,updated.rows[0]);
    await client.query("COMMIT");
    const {recordSecurityEvent}=require("../admin/audit");
    const logged=await recordSecurityEvent(req,{type:"earn_task_request_reviewed",severity:decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{request_id:row.id,status:decision,task_type:row.task_type}});
    if(!logged)return res.status(503).json({error:"Decision saved but audit confirmation failed."});
    return res.set("Cache-Control","no-store").json({ok:true,status:campaign?"published":status,campaign});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"The partner request could not be reviewed."});}
  finally{client.release();}
});
router.patch("/admin/requests/:id/funding",async(req,res)=>{
  if(!await requireRoles(req,res,["finance_manager","admin","super_admin"]))return;
  const decision=req.body?.decision,reference=typeof req.body?.reference==="string"?req.body.reference.trim():"";
  if(!validId(req.params.id)||!["verified","rejected"].includes(decision)||reference.length<4||reference.length>160||/[\\r\\n]/.test(reference))return res.status(400).json({error:"A verified funding reference is required."});
  const client=await req.app.locals.db.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM earn_task_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    const row=found.rows[0];
    if(!row||row.status==="published"||row.status==="rejected"){await client.query("ROLLBACK");return res.status(409).json({error:"This request cannot accept a funding update."});}
    const status=decision==="rejected"?"rejected":row.status;
    const updated=await client.query("UPDATE earn_task_requests SET funding_status=$2,funding_reference=$3,funding_verified_by=$4,funding_verified_at=CASE WHEN $2='verified' THEN NOW() ELSE NULL END,status=$5,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,decision,reference,req.earnUser.id,status]);
    const campaign=await publishReadyRequest(client,updated.rows[0]);
    await client.query("COMMIT");
    const {recordSecurityEvent}=require("../admin/audit");
    const logged=await recordSecurityEvent(req,{type:"earn_task_funding_verified",severity:decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{request_id:row.id,status:decision,funding_reference:reference}});
    if(!logged)return res.status(503).json({error:"Funding decision saved but audit confirmation failed."});
    return res.set("Cache-Control","no-store").json({ok:true,status:campaign?"published":status,campaign});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"Funding status could not be updated."});}
  finally{client.release();}
});
router.post("/admin/campaigns",async(req,res)=>{
  const db=req.app.locals.db;
  const b=req.body||{};
  const title=typeof b.title==="string"?b.title.trim():"",description=typeof b.description==="string"?b.description.trim():"",instructions=typeof b.instructions==="string"?b.instructions.trim():"";
  if(!await requireRoles(req,res,["super_admin","admin","finance_manager"]))return;
  const category=typeof b.category==="string"?b.category.trim().toLowerCase():"general";
  const taskType=TASK_TYPES.has(b.taskType)?b.taskType:"other";
  const providerName=typeof b.providerName==="string"?b.providerName.trim().slice(0,160):"Ethio One";
  const providerUrl=b.providerUrl?safeHttpsUrl(String(b.providerUrl).trim()):null;
  const estimatedMinutes=Number.isInteger(b.estimatedMinutes)?b.estimatedMinutes:10;
  const skillLevel=["beginner","intermediate","advanced"].includes(b.skillLevel)?b.skillLevel:"beginner";
  const languages=Array.isArray(b.languages)?b.languages.filter(x=>["om","am","en"].includes(x)).slice(0,3):["om","am","en"];
  const quality=typeof b.qualityCriteria==="string"?b.qualityCriteria.trim().slice(0,1500):"";
  const rewardPoolMinor=amount(b.rewardMinor)&&Number.isInteger(b.maxCompletions)?b.rewardMinor*b.maxCompletions:0;
  const platformFeeBps=1000,platformFeeMinor=Math.ceil(rewardPoolMinor*platformFeeBps/10000);
  if(title.length<5||title.length>140||description.length<10||description.length>1200||instructions.length<10||instructions.length>10000||!amount(b.rewardMinor)||!amount(b.budgetMinor)||b.budgetMinor<b.rewardMinor||!Number.isInteger(b.maxCompletions)||b.maxCompletions<1||b.maxCompletions>100000||b.budgetMinor!==rewardPoolMinor+platformFeeMinor||!/^[a-z0-9_-]{2,40}$/.test(category)||estimatedMinutes<1||estimatedMinutes>1440||(b.providerUrl&&!providerUrl)||!quality||blockedTaskText([title,description,instructions].join(" ")))return res.status(400).json({error:"Check task details, quality criteria and budget. Paid reviews, fake engagement and deposit tasks are prohibited."});
  try{
    const r=await db.query("INSERT INTO earn_campaigns(title,description,instructions,category,task_type,delivery_mode,provider_name,provider_url,reward_minor,budget_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,max_completions,evidence_required,evidence_hint,estimated_minutes,skill_level,language_codes,quality_criteria,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id,title,status,reward_minor,budget_minor,max_completions,created_at,funding_status,moderation_status",[title,description,instructions,category,taskType,providerUrl?"partner_link":"ethio_one",providerName,providerUrl,b.rewardMinor,b.budgetMinor,rewardPoolMinor,platformFeeMinor,platformFeeBps,b.maxCompletions,b.evidenceRequired!==false,typeof b.evidenceHint==="string"?b.evidenceHint.slice(0,300):"",estimatedMinutes,skillLevel,languages.length?languages:["om","am","en"],quality,req.earnUser.id]);
    const { recordSecurityEvent } = require("../admin/audit");
    const auditRecorded = await recordSecurityEvent(req,{type:"earn_campaign_created",severity:"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:r.rows[0].status}});
    return res.status(201).json({campaign:r.rows[0],auditRecorded});
  }catch{return res.status(503).json({error:"The task could not be created."});}
});
router.patch("/admin/campaigns/:id/moderation",async(req,res)=>{
  if(!await requireRoles(req,res,["moderator","admin","super_admin"]))return;
  const decision=req.body?.decision,note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,500):"";
  if(!validId(req.params.id)||!["approved","needs_changes","rejected"].includes(decision)||note.length<3)return res.status(400).json({error:"Choose a valid moderation decision and note."});
  try{
    const status=decision==="approved"?"approved":decision;
    const r=await req.app.locals.db.query(
      "UPDATE earn_campaigns SET moderation_status=$2,moderator_id=$3,moderated_at=NOW(),status=CASE WHEN $2='approved' AND funding_status='verified' THEN 'published' ELSE CASE WHEN $2='rejected' THEN 'archived' ELSE status END END,updated_at=NOW() WHERE id=$1 AND status IN ('draft','paused') RETURNING id,title,status,moderation_status,funding_status",
      [req.params.id,status,req.earnUser.id]
    );
    if(!r.rowCount)return res.status(404).json({error:"Task not found or already published."});
    const {recordSecurityEvent}=require("../admin/audit");
    const logged=await recordSecurityEvent(req,{type:"earn_campaign_moderated",severity:decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:decision}});
    if(!logged)return res.status(503).json({error:"Moderation decision saved but audit confirmation failed."});
    return res.set("Cache-Control","no-store").json({campaign:r.rows[0]});
  }catch{return res.status(503).json({error:"Campaign moderation could not be saved."});}
});
router.patch("/admin/campaigns/:id/funding",async(req,res)=>{
  if(!await requireRoles(req,res,["finance_manager","admin","super_admin"]))return;
  const decision=req.body?.decision,reference=typeof req.body?.reference==="string"?req.body.reference.trim():"";
  if(!validId(req.params.id)||!["verified","rejected"].includes(decision)||reference.length<4||reference.length>160||/[\\r\\n]/.test(reference))return res.status(400).json({error:"Enter a verified funding reference."});
  const client=await req.app.locals.db.connect();
  try{
    await client.query("BEGIN");
    const r=await client.query(
      "UPDATE earn_campaigns SET funding_status=$2,funding_reference=$3,funding_verified_by=$4,funding_verified_at=CASE WHEN $2='verified' THEN NOW() ELSE NULL END,status=CASE WHEN $2='verified' AND moderation_status='approved' THEN 'published' ELSE CASE WHEN $2='rejected' THEN 'archived' ELSE status END END,updated_at=NOW() WHERE id=$1 AND status IN ('draft','paused') AND funding_status='unverified' RETURNING id,title,status,funding_status,moderation_status,budget_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps",
      [req.params.id,decision,reference,req.earnUser.id]
    );
    if(!r.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Task not found or funding was already verified."});}
    if(decision==="verified"){
      const campaign=r.rows[0];
      await client.query("INSERT INTO earn_platform_revenue(campaign_id,gross_funding_minor,reward_pool_minor,platform_fee_minor,platform_fee_bps,funding_reference,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[campaign.id,campaign.budget_minor,campaign.reward_pool_minor,campaign.platform_fee_minor,campaign.platform_fee_bps,reference,req.earnUser.id]);
    }
    await client.query("COMMIT");
    const {recordSecurityEvent}=require("../admin/audit");
    const logged=await recordSecurityEvent(req,{type:"earn_campaign_funding_verified",severity:decision==="rejected"?"warning":"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:decision,funding_reference:reference}});
    if(!logged)return res.status(503).json({error:"Funding decision saved but audit confirmation failed."});
    return res.set("Cache-Control","no-store").json({campaign:r.rows[0]});
  }catch{await client.query("ROLLBACK").catch(()=>{});return res.status(503).json({error:"Campaign funding could not be verified."});}
  finally{client.release();}
});
router.patch("/admin/campaigns/:id/status",async(req,res)=>{
  if(!validId(req.params.id)||!["published","paused","archived"].includes(req.body?.status))return res.status(400).json({error:"Invalid task status."});
  try{
    const r=await req.app.locals.db.query("UPDATE earn_campaigns SET status=$2,updated_at=NOW() WHERE id=$1 AND status IN ('draft','published','paused') AND ($2<>'published' OR (funding_status='verified' AND moderation_status='approved')) RETURNING id,status",[req.params.id,req.body.status]);
    if(!r.rowCount)return res.status(404).json({error:"Task not found or cannot be changed."});
    const { recordSecurityEvent } = require("../admin/audit");
    const auditRecorded = await recordSecurityEvent(req,{type:"earn_campaign_status_updated",severity:req.body.status==="archived"||req.body.status==="paused"?"warning":"info",userId:req.earnUser.id,metadata:{campaign_id:r.rows[0].id,status:r.rows[0].status}});
    return res.set("Cache-Control","no-store").json({campaign:r.rows[0],auditRecorded});
  }catch{return res.status(503).json({error:"Task status could not be updated."});}
});
router.post("/admin/submissions/:id/review",async(req,res)=>{
  const db=req.app.locals.db;
  if(!await requireRoles(req,res,["moderator","admin","super_admin","finance_manager"]))return;
  if(!validId(req.params.id)||!["approved","rejected"].includes(req.body?.decision))return res.status(400).json({error:"Invalid review decision."});
  const note=typeof req.body.note==="string"?req.body.note.trim().slice(0,500):"";
  if(req.body.decision==="rejected"&&note.length<3)return res.status(400).json({error:"A clear rejection reason is required."});
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
