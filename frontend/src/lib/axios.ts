import axios from 'axios';

const axiosInstance = axios.create({
  // Same-origin, via routes/api/[...path]/+server.ts. Not the API's own host:
  // the `Access` cookie belongs to this origin and cannot be sent to a
  // different registrable domain, so a direct call is always anonymous. The
  // proxy reads the cookie and forwards it as a Bearer header.
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  // Same-origin sends cookies anyway; kept so the instance still authenticates
  // if a caller ever overrides baseURL.
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
