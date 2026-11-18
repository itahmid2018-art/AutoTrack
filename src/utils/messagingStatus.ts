import { MessageLog } from '../types';

export type MessageStatus = MessageLog['status'];

/**
 * The honest status for a send attempt.
 *
 * `Sent` may only be recorded when a provider API confirmed the dispatch.
 * Everything else — a `wa.me` / `sms:` deep link that merely opened, a network
 * failure, a fallback — is `Pending`, because the app cannot prove delivery.
 *
 * Nothing in this codebase can prove delivery today, so `Delivered` is not
 * part of the status union.
 */
export function sentStatusFor(apiConfirmed: boolean): MessageStatus {
  return apiConfirmed ? 'Sent' : 'Pending';
}

/**
 * True only when the provider response is both a successful HTTP status and an
 * explicit `success: true` body. Guards against a 500 page with a JSON shape.
 */
export function isApiConfirmed(resOk: boolean, payload: unknown): boolean {
  if (!resOk) return false;
  if (!payload || typeof payload !== 'object') return false;
  return (payload as { success?: unknown }).success === true;
}
