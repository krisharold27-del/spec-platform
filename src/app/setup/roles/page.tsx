import { redirect } from 'next/navigation';

/**
 * Roles, the chart and the people used to be three screens. They are one thought — "this is my
 * business, and this is who runs each part of it" — so they are now one page.
 */
export default function RolesRedirect() {
  redirect('/setup/business');
}
