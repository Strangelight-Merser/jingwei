import type {ActionFunctionArgs} from 'react-router';
export async function action({request}:ActionFunctionArgs){
 const origin=request.headers.get('origin');
 if(origin!==new URL(request.url).origin)return Response.json({ok:false,message:'操作未保存，请在应用内重试。'},{status:403});
 const form=await request.formData();
 if(form.get('intent')==='refresh'){
  try{const response=await fetch(`${process.env.JINGWEI_API_URL??'http://127.0.0.1:4411'}/reading/research/check`,{method:'POST',headers:{'content-type':'application/json','x-jingwei-reader':'local'},body:'{}',signal:AbortSignal.timeout(5000)});return Response.json({ok:response.ok,message:response.ok?'已开始核查，可继续阅读。':'这次核查未能开始，请稍后再试。'},{status:response.ok?200:response.status});}catch{return Response.json({ok:false,message:'这次核查未能开始，请稍后再试。'},{status:503});}
 }
 const topic_key=form.get('topic_key');const followed=form.get('followed');
 if(typeof topic_key!=='string'||!topic_key||!['true','false'].includes(String(followed)))return Response.json({ok:false,message:'关注未保存，请重试。'},{status:400});
 try{
  const response=await fetch(`${process.env.JINGWEI_API_URL??'http://127.0.0.1:4411'}/reading/followed`,{method:'POST',headers:{'content-type':'application/json','x-jingwei-reader':'local'},body:JSON.stringify({topic_key,followed:followed==='true'}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return Response.json({ok:false,message:'关注未保存，请重试。'},{status:response.status});
  return {ok:true,topic_key,followed:followed==='true'};
 }catch{return Response.json({ok:false,message:'关注未保存，稍后再试。'},{status:503});}
}
