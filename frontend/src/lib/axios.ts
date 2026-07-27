import { env } from '$env/dynamic/public';
import axios from 'axios';

const PUBLIC_API_URL = (env && env.PUBLIC_API_URL) ? env.PUBLIC_API_URL : '';

const axiosInstance = axios.create({
  baseURL: PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  // Send the httpOnly `Access` cookie with cross-origin requests. Without this
  // every client-side call is anonymous — the cookie is httpOnly by design, so
  // no script here can read it to build an Authorization header, and this
  // instance was previously sending no credentials of any kind. The backend
  // reads that cookie in JwtStrategy's extractor.
  //
  // The backend's CORS config already sets `credentials: true` with an
  // explicit origin allowlist, which is what makes this legal.
  //
  // NOTE for deployment: the cookie is set `sameSite: 'strict'`, so this works
  // when both apps share a site (localhost:5173 -> localhost:3000 does, since
  // "site" ignores the port) but the browser will NOT attach it from
  // launchup.vercel.app to launchup.onrender.com. Those are different sites
  // and will need `sameSite: 'none'` + `secure: true` on the cookie, which is
  // a CSRF trade-off worth making deliberately rather than by accident.
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
