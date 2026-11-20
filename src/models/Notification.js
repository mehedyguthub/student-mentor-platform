const mongoose = require('mongoose');
const schema = new mongoose.Schema({ user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true}, actor:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, type:{type:String,required:true}, text:{type:String,required:true,maxlength:300}, link:{type:String,default:''}, readAt:{type:Date,default:null} },{timestamps:true});
schema.post('save',n=>{ if(global.io) global.io.to('user:'+String(n.user)).emit('notification',{id:n._id,text:n.text,link:n.link,type:n.type,createdAt:n.createdAt}); });
module.exports = mongoose.model('Notification',schema);
