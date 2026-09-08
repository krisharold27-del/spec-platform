import { redirect } from 'next/navigation';

/** Merged into the single business page — see src/app/setup/business/page.tsx. */
export default function PeopleRedirect() {
  redirect('/setup/business');
}
