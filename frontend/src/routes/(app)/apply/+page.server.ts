import {
  applicationSchema,
  parseApplicationFormData
} from '$lib/validators/application.validator';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { env } from '$env/dynamic/public';
const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

export const load: PageServerLoad = async ({ cookies }) => {
  const form = await superValidate(zod(applicationSchema));
  const access = cookies.get('Access');

  return {
    form,
    access
  };
};

export const actions: Actions = {
  default: async ({ fetch, request, cookies }) => {
    const form = await superValidate(request, zod(applicationSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    // Direct to the API, not $lib/axios: its baseURL is the relative '/api',
    // which Node cannot resolve.
    let response: Response;
    try {
      response = await fetch(`${PUBLIC_API_URL}/startups/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cookies.get('Access')}`
        },
        body: JSON.stringify(form.data)
      });
    } catch (error: any) {
      console.error('API Error:', error.message);
      return message(
        form,
        { success: false, text: 'Could not reach the server. Try again.' },
        { status: 502 }
      );
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      console.error('API Error:', response.status, data);
      // Nest's ValidationPipe returns an array of messages.
      const text = Array.isArray(data?.message)
        ? data.message.join('; ')
        : data?.message || 'Failed to submit application';
      return message(form, { success: false, text }, { status: 400 });
    }

    return message(form, {
      success: true,
      text: 'Your application has been submitted'
    });
  }
};
