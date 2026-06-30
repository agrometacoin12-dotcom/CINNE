'use client';

import { Suspense } from 'react';
import { AuthExperience } from '@/components/AuthExperience';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthExperience initial="signup" />
    </Suspense>
  );
}
