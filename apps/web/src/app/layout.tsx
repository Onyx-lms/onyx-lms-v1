import type { Metadata } from 'next';
import './globals.css';
import { apiSafe, type CategoryNode, type SiteSettings } from '@/lib/api';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

/** C-05: site-wide defaults, overridden per page by generateMetadata. */
export async function generateMetadata(): Promise<Metadata> {
  const s = await apiSafe<SiteSettings>('/api/settings');
  return {
    title: { default: s?.meta_title ?? s?.system_title ?? 'Onyx LMS', template: `%s | ${s?.system_title ?? 'Onyx LMS'}` },
    description: s?.meta_description ?? '',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Settings and nav are shared by every page, so they are fetched once here.
  const [settings, categories] = await Promise.all([
    apiSafe<SiteSettings>('/api/settings'),
    apiSafe<CategoryNode[]>('/api/categories'),
  ]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader settings={settings} categories={categories ?? []} />
        <main className="flex-1">{children}</main>
        <SiteFooter settings={settings} />
      </body>
    </html>
  );
}
