import { env } from '$env/dynamic/public';
import { error, type RequestHandler } from '@sveltejs/kit';

/**
 * Same-origin proxy to the NestJS API.
 *
 * The `Access` cookie is httpOnly and scoped to this origin, so the browser
 * cannot send it to the API's own host — different registrable domains cannot
 * share a cookie, whatever SameSite says. Client code calls `/api/...` here
 * instead, and this handler swaps the cookie for the Bearer header the API
 * already accepts.
 *
 * Server-side load functions and form actions keep calling the API directly;
 * they hold the token themselves and gain nothing from the extra hop.
 */
const API_URL = env.PUBLIC_API_URL || '';

// Recomputed by fetch, or meaningful only on the original connection.
const DROP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'accept-encoding',
  'cookie'
]);

const DROP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection'
]);

const proxy: RequestHandler = async ({ request, params, url, cookies }) => {
  if (!API_URL) {
    throw error(500, 'PUBLIC_API_URL is not set; the API proxy cannot forward.');
  }

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }

  const token = cookies.get('Access');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual'
  };

  // Buffered rather than streamed: undici needs `duplex: 'half'` for a stream
  // body, and the largest payload here is a 10MB upload.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/${params.path}${url.search}`, init);
  } catch (cause) {
    // The API being unreachable is a gateway failure, not a 500 from this app.
    throw error(502, `API unreachable: ${cause instanceof Error ? cause.message : cause}`);
  }

  const responseHeaders = new Headers();
  for (const [key, value] of response.headers) {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
