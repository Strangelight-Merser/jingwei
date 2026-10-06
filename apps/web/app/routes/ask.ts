import type {ActionFunctionArgs, LoaderFunctionArgs} from 'react-router';

async function askRequest(path:string,init?:RequestInit) {
 try {
  const response=await fetch(`${process.env.JINGWEI_API_URL??'http://127.0.0.1:4411'}/ask${path}`,{...init,signal:AbortSignal.timeout(init?120_000:10_000)});
  return Response.json(await response.json(),{status:response.status,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'ask_unavailable'},{status:503});}
}
export async function loader({request}:LoaderFunctionArgs) {
 const question=new URL(request.url).searchParams.get('question')??'';
 return askRequest('?'+new URLSearchParams({question}));
}
export async function action({request}:ActionFunctionArgs) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'local_reading_request_required'},{status:403});
 const form=await request.formData();
 return askRequest('',{method:'POST',headers:{'Content-Type':'application/json','x-jingwei-reader':'local'},body:JSON.stringify({question:form.get('question'),quote:form.get('quote')})});
}
