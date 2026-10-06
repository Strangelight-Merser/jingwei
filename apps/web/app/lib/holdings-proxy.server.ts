export async function holdingsRequest(request: Request, path: 'parse' | 'checkup') {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error: 'local_reading_request_required'}, {status: 403});
  let body: unknown;
  try {body = await request.json();}
  catch {return Response.json({error: 'invalid_json'}, {status: 400, headers: {'Cache-Control': 'no-store'}});}
  try {
    const response = await fetch(`${process.env.JINGWEI_API_URL ?? 'http://127.0.0.1:4411'}/holdings/${path}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', 'x-jingwei-reader': 'local'},
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    return Response.json(await response.json(), {status: response.status, headers: {'Cache-Control': 'no-store'}});
  } catch {return Response.json({error: 'holdings_unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});}
}
