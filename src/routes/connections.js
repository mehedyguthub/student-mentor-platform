const router=require('express').Router(); const Connection=require('../models/Connection'); const User=require('../models/User'); const Notification=require('../models/Notification'); const {requireAuth}=require('../middleware/auth');
router.use(requireAuth);
router.get('/',async(req,res,next)=>{try{const rows=await Connection.find({$or:[{requester:req.user._id},{recipient:req.user._id}]}).populate('requester recipient','name role field bio skills').sort({createdAt:-1});res.json({connections:rows});}catch(e){next(e)}});
router.post('/:userId',async(req,res,next)=>{try{
  if(String(req.params.userId)===String(req.user._id))return res.status(400).json({message:'You cannot connect with yourself.'});
  const recipient=await User.findById(req.params.userId);
  if(!recipient)return res.status(404).json({message:'User not found.'});
  const pair={$or:[{requester:req.user._id,recipient:recipient._id},{requester:recipient._id,recipient:req.user._id}]};
  const rank={accepted:0,pending:1,rejected:2};
  const c=(await Connection.find(pair)).sort((a,b)=>rank[a.status]-rank[b.status])[0];
  const notifyRequest=()=>Notification.create({user:recipient._id,actor:req.user._id,type:'connection_request',text:`${req.user.name} sent you a connection request.`,link:'connections'});
  if(c){
    if(c.status==='accepted')return res.json({state:'connected',message:'You are already connected.',connection:c});
    if(c.status==='pending'){
      if(c.recipient.equals(req.user._id)){
        c.status='accepted';await c.save();
        await Notification.create({user:c.requester,actor:req.user._id,type:'connection_accepted',text:`${req.user.name} accepted your connection request.`,link:'connections'});
        return res.json({state:'connected',message:'Connected! You accepted their request.',connection:c});
      }
      return res.json({state:'requested',message:'Your request is already waiting for a reply.',connection:c});
    }
    // Rejected earlier: allow a fresh request.
    c.requester=req.user._id;c.recipient=recipient._id;c.status='pending';await c.save();
    await notifyRequest();
    console.log(`[connections] re-sent request ${req.user.email||req.user._id} -> ${recipient._id}`);
    return res.status(201).json({state:'requested',connection:c});
  }
  const make=()=>Connection.create({requester:req.user._id,recipient:recipient._id});
  let created;
  try{created=await make();}
  catch(e){
    if(e.code!==11000)throw e;
    const dup=await Connection.findOne(pair);
    if(dup)return res.json({state:dup.status==='accepted'?'connected':'requested',message:'Your request is already waiting for a reply.'});
    // A leftover unique index in MongoDB is blocking a brand-new request: repair it and retry once.
    console.warn('[connections] stale unique index detected, repairing:',JSON.stringify(e.keyPattern||{}));
    await Connection.syncIndexes();
    created=await make();
  }
  // Never report success unless the request really exists in the database.
  if(!(await Connection.exists({_id:created._id})))return res.status(500).json({message:'The request could not be saved. Please try again.'});
  await notifyRequest();
  console.log(`[connections] saved request ${req.user.email||req.user._id} -> ${recipient._id}`);
  res.status(201).json({state:'requested',connection:created});
}catch(e){console.error('[connections] failed:',e.message);next(e)}});
router.patch('/:id',async(req,res,next)=>{try{const c=await Connection.findById(req.params.id);if(!c)return res.status(404).json({message:'Request not found.'});if(!c.recipient.equals(req.user._id))return res.status(403).json({message:'Only the recipient can respond.'});const status=String(req.body.status);if(!['accepted','rejected'].includes(status))return res.status(400).json({message:'Status must be accepted or rejected.'});c.status=status;await c.save();if(status==='accepted')await Notification.create({user:c.requester,actor:req.user._id,type:'connection_accepted',text:`${req.user.name} accepted your connection request.`,link:'connections'});res.json({connection:c});}catch(e){next(e)}});
module.exports=router;
