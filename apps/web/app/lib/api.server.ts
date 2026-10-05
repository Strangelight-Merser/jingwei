export async function publication<T>(path:string):Promise<T>{
 try {
  const res=await fetch(`${process.env.JINGWEI_API_URL??'http://127.0.0.1:4411'}/publication/${path}`,{signal:AbortSignal.timeout(10_000)});
  if(!res.ok)throw new Response(res.status===404?'内容不存在':'暂时无法载入内容',{status:res.status});
  return await res.json() as T;
 } catch(error) {
  if(error instanceof Response)throw error;
  throw new Response('暂时无法载入内容',{status:503});
 }
}
