import { env } from '$env/dynamic/public';
import axios from 'axios';

const PUBLIC_API_URL = (env && env.PUBLIC_API_URL) ? env.PUBLIC_API_URL : '';

const axiosInstance = axios.create({
  baseURL: PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  // Sends the httpOnly `Access` cookie cross-origin; without it every
  // client-side call is anonymous, since no script can read an httpOnly cookie
  // to build an Authorization header. JwtStrategy's extractor reads it. Legal
  // because the backend's CORS sets `credentials: true` with an origin allowlist.
  //
  // DEPLOYMENT: the cookie is `sameSite: 'strict'`, so this works while both
  // apps share a site (localhost:5173 -> :3000 does — "site" ignores the port)
  // but the browser will NOT attach it from launchup.vercel.app to
  // launchup.onrender.com. That needs `sameSite: 'none'` + `secure: true`, a
  // CSRF trade-off to make deliberately rather than by accident.
  withCredentials: true
});

// axiosInstance.interceptors.response.use(
//   response => response,
//   async error => {
//     const originalRequest = error.config;
//     const inFifteenMinutes = new Date(new Date().getTime() + 15 * 60 * 1000);
//     if (error.response.status === 401 && !originalRequest._retry) {
//       originalRequest._retry = true;
//       try {
//         const refreshToken = Cookies.get('Refresh');

//         const response = await axios.post(`${PUBLIC_API_URL}/tokens/refresh/`, {
//           refresh: refreshToken,
//         });
//         const { access } = response.data;

//         Cookies.set('Access', access, {
//           expires: inFifteenMinutes,
//         });

//         axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${access}`;
//         return axiosInstance(originalRequest);
//       } catch (refreshError) {

//         console.error('Token refresh failed:', refreshError);
//         Cookies.remove('Access');
//         Cookies.remove('Refresh');
//         window.location.href = '/login';
//         return Promise.reject(refreshError);
//       }
//     }
//     return Promise.reject(error);
//   }
// );

export default axiosInstance;
