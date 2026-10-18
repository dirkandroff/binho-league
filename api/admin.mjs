const GOOGLE_API_URL = 'https://script.google.com/macros/s/AKfycbxm8Coaag74XYTrn1wM1WkS2bIlMOJjiBJsQWHwR53sd6jWoefskvekoeieNjcVVzo/exec';
const COOKIE = '__Host-binho_admin';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Cookie');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const cookies = String(request.headers.cookie || '').split(';').map(v => v.trim());
  const token = cookies.find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ success: false, error: 'Method not allowed.' });
  }
  let body = request.method === 'GET' ? { action: 'session' } : request.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 8192) throw new Error('Invalid request.');
    if (request.method === 'POST') {
      const origin = request.headers.origin;
      const allowed = ['https://binholeague.com', 'https://www.binholeague.com'];
      if (process.env.VERCEL_URL) allowed.push(`https://${process.env.VERCEL_URL}`);
      if (process.env.NODE_ENV !== 'production') allowed.push('http://localhost:4173');
      if (!allowed.includes(origin) || !String(request.headers['content-type'] || '').startsWith('application/json')) {
        return response.status(403).json({ success: false, error: 'Please submit from the league website.' });
      }
    }
    const allowedActions = ['login', 'logout', 'session', 'match', 'prestige', 'voidMatch', 'addPlayer', 'updatePlayer'];
    if (!allowedActions.includes(body.action)) throw new Error('Unknown action.');
    if (!['login', 'session'].includes(body.action) && !token) return response.status(401).json({ success: false, error: 'Please sign in.' });
    const upstream = await fetch(GOOGLE_API_URL, {
      method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, token })
    });
    if (!upstream.ok) throw new Error('The score sheet is temporarily unavailable.');
    const data = await upstream.json();
    if (data.token && body.action === 'login' && data.success) {
      response.setHeader('Set-Cookie', `${COOKIE}=${data.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`);
    }
    if (body.action === 'logout' || data.status === 401) {
      response.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    }
    delete data.token;
    return response.status(data.success ? 200 : [400, 401, 403, 409, 429, 503].includes(data.status) ? data.status : 400).json(data);
  } catch (error) {
    return response.status(503).json({ success: false, error: error.name === 'TimeoutError' ? 'The sheet is taking longer than expected. Retry the same report safely.' : 'Unable to reach the score sheet. Please try again.' });
  }
}
