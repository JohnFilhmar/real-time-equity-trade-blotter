import { LoginForm } from '@/components/auth/LoginForm';
import { LoginFormSkeleton } from '@/components/auth/LoginFormSkeleton';
import { LoginStage } from '@/components/auth/LoginStage';
import { RequireAnonymous } from '@/components/auth/RequireSession';

export default function LoginPage() {
  return (
    <LoginStage>
      <RequireAnonymous fallback={<LoginFormSkeleton state="restoring" />} leaving={<LoginFormSkeleton state="opening" />}>
        <LoginForm />
      </RequireAnonymous>
    </LoginStage>
  );
}
