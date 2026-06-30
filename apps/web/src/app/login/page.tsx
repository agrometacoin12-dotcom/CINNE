'use client';

import { Suspense } from 'react';
import { AuthExperience } from '@/components/AuthExperience';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthExperience initial="signin" />
    </Suspense>
  );
}
