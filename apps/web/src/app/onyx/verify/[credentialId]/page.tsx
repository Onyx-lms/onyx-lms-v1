import type { Metadata } from 'next';
import type { Verification } from '@/lib/onyx-career';

export const metadata: Metadata = {
  title: 'Verify a credential',
  // Not something to index: each page is about one named person.
  robots: { index: false, follow: false },
};

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

/**
 * CAR-03 -- the public verification page.
 *
 * No session, by design: the person checking a credential is an employer who
 * has no account here and never will. That is the whole point of a verifiable
 * certificate.
 *
 * It calls the API directly rather than through the authenticated helper,
 * because there is no token to send and adding one would quietly make the page
 * useless to the people it exists for.
 */
export default async function OnyxVerifyPage({ params }: {
  params: Promise<{ credentialId: string }>;
}) {
  const { credentialId } = await params;
  let result: Verification = { valid: false, reason: 'not_found' };
  try {
    const res = await fetch(API + '/api/onyx/verify/' + encodeURIComponent(credentialId),
      { cache: 'no-store' });
    const body = await res.json();
    if (body.ok) result = body.data as Verification;
  } catch {
    // A verifier gets an answer either way; "we could not check" is not one of
    // the answers a certificate holder should have to explain.
    result = { valid: false, reason: 'not_found' };
  }

  const headline = result.valid
    ? 'This credential is valid'
    : result.reason === 'revoked' ? 'This credential has been revoked'
      : result.reason === 'expired' ? 'This credential has expired'
        : 'No such credential';

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-lg">
        <div className={'rounded-xl border p-8 '
          + (result.valid ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200')}>
          <div className="text-xs uppercase tracking-wide text-slate-500">Credential check</div>
          <h1 className={'mt-1 text-2xl font-semibold '
            + (result.valid ? 'text-emerald-900' : 'text-slate-900')}>
            {headline}
          </h1>

          {result.reason === 'not_found' ? (
            <p className="mt-3 text-sm text-slate-600">
              Nothing is registered under that credential id. Check it was copied in full.
            </p>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Awarded to</dt>
                {/* The holder's name is the only thing about them on this page. */}
                <dd className="font-medium">{result.holder ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">For</dt>
                <dd>{result.title}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Issued by</dt>
                <dd>{result.issuer ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Issued</dt>
                <dd>{result.issued_at ? new Date(result.issued_at).toLocaleDateString() : '—'}</dd>
              </div>
              {result.revoked_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Revoked</dt>
                  <dd className="text-rose-700">
                    {new Date(result.revoked_at).toLocaleDateString()}
                  </dd>
                </div>
              ) : null}
              {result.expires_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Expires</dt>
                  <dd>{new Date(result.expires_at).toLocaleDateString()}</dd>
                </div>
              ) : null}
              {result.detail && Object.keys(result.detail).length ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Result</dt>
                  <dd>
                    {Object.entries(result.detail)
                      .map(([k, v]) => k.replace(/_/g, ' ') + ': ' + String(v))
                      .join(' · ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}

          <p className="mt-6 font-mono text-xs text-slate-500">{credentialId}</p>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          This page shows only what the issuing institution chose to publish.
        </p>
      </div>
    </div>
  );
}
