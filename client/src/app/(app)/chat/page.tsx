import { logoutAction } from '@/app/actions/auth';
import { requireUser } from '@/lib/session';

/** Placeholder protected page for Step 3; becomes the chat in Step 8. */
export default async function ChatPage() {
  const user = await requireUser();
  return (
    <main className="p-8">
      <p>
        Signed in as {user.displayName} ({user.email}), roles: {user.roles.join(', ')}
      </p>
      <form action={logoutAction} className="mt-4">
        <button className="rounded-lg border px-3 py-1.5">Log out</button>
      </form>
    </main>
  );
}