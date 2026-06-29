// The title detail page now lives at /title?id=… (static-export friendly).
// This dynamic route is intentionally empty and generates no static pages.
export const dynamicParams = false;

export function generateStaticParams(): { id: string }[] {
  return [];
}

export default function DeprecatedTitleRoute() {
  return null;
}
