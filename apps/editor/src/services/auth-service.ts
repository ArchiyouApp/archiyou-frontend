/**
 * Auth service — thin singleton wrapper around oidc-client-ts UserManager.
 *
 * Configure OIDC settings via environment variables injected by Vite:
 *   VITE_OIDC_AUTHORITY   e.g. https://auth.example.com
 *   VITE_OIDC_CLIENT_ID   e.g. archiyou-web
 *   VITE_OIDC_REDIRECT_URI  (optional, defaults to origin/callback)
 */

import { UserManager, type User } from 'oidc-client-ts';

const authority    = import.meta.env.VITE_OIDC_AUTHORITY  as string;
const clientId     = import.meta.env.VITE_OIDC_CLIENT_ID  as string;
const redirectUri  = (import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined)
  ?? `${window.location.origin}/callback`;

const userManager = new UserManager({
  authority,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
});

export const authService = {
  /** Redirect to the OIDC provider login page. */
  login(): Promise<void> {
    return userManager.signinRedirect();
  },

  /** Process the OAuth callback after redirect. */
  callback(): Promise<User> {
    return userManager.signinRedirectCallback();
  },

  /** Sign out and redirect. */
  logout(): Promise<void> {
    return userManager.signoutRedirect();
  },

  /** Return the current authenticated user, or null. */
  getUser(): Promise<User | null> {
    return userManager.getUser();
  },

  /** Return the raw access token string, or null. */
  async getToken(): Promise<string | null> {
    const user = await userManager.getUser();
    return user?.access_token ?? null;
  },
};
