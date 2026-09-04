import { env } from '$env/dynamic/public';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';
import { z } from 'zod';
import { dev } from '$app/environment';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { fail, redirect } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/auth';
import type { PageServerLoad } from './$types.js';

const managerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user && locals.user.role === 'Manager') {
    throw redirect(302, '/admin');
  }
  const form = await superValidate(zod(managerLoginSchema));
  return { form };
};

export const actions = {
  default: async ({ fetch, request, cookies }) => {
    const form = await superValidate(request, zod(managerLoginSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    const { email, password } = form.data;

    try {
      const response = await fetch(`${PUBLIC_API_URL}/auth/signin/`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.status !== 201) {
        return setError(form, 'email', 'Invalid Credentials');
      }

      const data = await response.json();

      // Signature-checked, unlike the atob() this replaced: an unsigned claim
      // used to decide who reached the management console.
      const claims = await verifyAccessToken(data.access_token);
      if (!claims) {
        return setError(form, 'email', 'Invalid Credentials');
      }
      if (claims.role !== 'Manager') {
        return setError(form, 'email', 'This is not a manager account');
      }

      cookies.set('Access', data.access_token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 60 * 5 * 60,
        secure: !dev
      });
      return message(form, { text: 'Manager login successful' });
    } catch (error) {
      console.error(error);
      return setError(form, 'email', 'Login failed');
    }
  }
};
