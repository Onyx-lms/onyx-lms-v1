import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Onyx', template: '%s · Onyx' },
  description: 'The institutional learning platform.',
};

/** Onyx is a separate product sharing this deployment (ADR-006). */
export default function OnyxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
