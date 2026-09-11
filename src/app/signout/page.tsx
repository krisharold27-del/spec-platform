import { doSignOut } from '../signin/actions';
export default function SignOutPage() {
  return <main className="mx-auto max-w-md px-6 py-16"><form action={doSignOut}><button className="rounded-full bg-rust px-5 py-2 text-cream">Sign out</button></form></main>;
}
