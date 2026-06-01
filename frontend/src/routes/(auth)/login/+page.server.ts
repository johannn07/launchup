import { env } from '$env/dynamic/public';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';
import { z } from 'zod';
import { dev } from '$app/environment';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(loginSchema));

  return {
    form
  };
};

export const actions = {
  default: async ({ fetch, request, cookies }) => {
    const form = await superValidate(request, zod(loginSchema));

    if (!form.valid) {
      return fail(400, {
        form
      });
    }

    const { email, password } = form.data;

    try {
      const response = await fetch(`${PUBLIC_API_URL}/auth/signin/`, {
        method: 'POST',
        headers: {
          'Content-type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      if (response.status === 201) {
        const data = await response.json();

        cookies.set('Access', data.access_token, {
          path: '/',
          httpOnly: true,
          sameSite: 'strict',
          maxAge: 60 * 5 * 60,
          secure: !dev
        });

        throw redirect(303, '/startups');
      } else {
        return setError(form, 'email', 'Invalid Credentials');
      }
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }
      console.error(error);
      return fail(500, {
        form
      });
    }
  }
};
