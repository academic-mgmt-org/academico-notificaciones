import { createContextKey } from '@connectrpc/connect';

export const authenticatedUserContextKey = createContextKey(null, {
  description: 'authenticated-user',
});

export function getAuthenticatedUser(context) {
  return context?.values?.get(authenticatedUserContextKey) || null;
}
