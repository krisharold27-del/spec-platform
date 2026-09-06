import { doSignOut } from '../signin/actions';
export default function SignOutPage() {
  return <main className="mx-auto max-w-md px-6 py-16"><form action={doSignOut}><button className="rounded-lg bg-slate-900 px-5 py-2 text-white">Sign out</button></form></main>;
}
