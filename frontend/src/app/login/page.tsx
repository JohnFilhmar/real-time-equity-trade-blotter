import { LoginForm } from '@/components/auth/LoginForm';
import { RequireAnonymous } from '@/components/auth/RequireSession';

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <RequireAnonymous>
        <LoginForm />
      </RequireAnonymous>
    </div>
  );
}
