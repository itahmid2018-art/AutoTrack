import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerFeedbackUrl,
  buildCustomerPortalUrl,
  ensurePublicAccessToken,
} from '../src/utils/customerPortalUrl';

describe('customerPortalUrl helpers', () => {
  it('preserves existing publicAccessToken verbatim across calls', () => {
    const job = {
      id: 'BOSCH-2026-0041',
      createdAt: '2026-06-01T10:00:00.000Z',
      publicAccessToken: 'tok-existing-stable-1234',
    };
    assert.equal(ensurePublicAccessToken(job), 'tok-existing-stable-1234');
  });

  it('generates high-entropy CSPRNG tokens matching Firestore token format when missing', () => {
    const job = {
      id: 'BOSCH-2026-0099',
      createdAt: '2026-06-01T10:00:00.000Z',
    };
    const tokenA = ensurePublicAccessToken(job);
    const tokenB = ensurePublicAccessToken(job);

    assert.match(tokenA, /^[a-zA-Z0-9_-]{1,128}$/);
    assert.match(tokenB, /^[a-zA-Z0-9_-]{1,128}$/);
    assert.ok(tokenA.startsWith('tok-bosch-2026-0099-'));
    assert.notEqual(tokenA, tokenB);
  });

  it('builds canonical customer portal and feedback survey URLs', () => {
    const job = {
      id: 'BOSCH-2026-0041',
      createdAt: '2026-06-01T10:00:00.000Z',
      publicAccessToken: 'tok-portal-abc123',
    };

    const portalUrl = buildCustomerPortalUrl(job, 'https://workshop.example.com/');
    const feedbackUrl = buildCustomerFeedbackUrl(job, 'https://workshop.example.com/');

    assert.equal(portalUrl, 'https://workshop.example.com/?view=customer&token=tok-portal-abc123');
    assert.equal(
      feedbackUrl,
      'https://workshop.example.com/?view=customer&token=tok-portal-abc123&feedback=1'
    );
  });
});
