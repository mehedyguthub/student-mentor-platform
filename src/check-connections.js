// Run: npm run check-connections
// Prints the Connection indexes and every saved connection, so you can see exactly what is in the database.
require('dotenv').config();
const mongoose=require('mongoose');const Connection=require('./models/Connection');require('./models/User');
(async()=>{
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Indexes:',(await Connection.collection.indexes()).map(i=>i.name+' '+JSON.stringify(i.key)+(i.unique?' UNIQUE':'')).join(' | '));
  const rows=await Connection.find().populate('requester recipient','name email role').sort({createdAt:-1});
  console.log('Total connections:',rows.length);
  rows.forEach(c=>console.log(`${c.status.padEnd(9)} ${c.requester?.name} (${c.requester?.role}) -> ${c.recipient?.name} (${c.recipient?.role})  ${c.createdAt.toISOString()}`));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
