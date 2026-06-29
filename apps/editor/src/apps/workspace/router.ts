/**
 * Central route configuration.
 *
 * No auth guard — all routes are public.
 * Login is opt-in via the nav-bar Sign in button.
 */

import { Router, type Route } from '@vaadin/router';

export const routes: Route[] = [
  // --- OAuth pages (no layout) ---
  {
    path: '/login',
    component: 'page-login',
    action: async () => { await import('../../pages/login.js'); },
  },
  {
    path: '/callback',
    component: 'page-callback',
    action: async () => { await import('../../pages/callback.js'); },
  },

  // --- App (with nav-bar layout) ---
  {
    path: '/',
    component: 'layout-main',
    action: async () => { await import('../../layouts/layout-main.js'); },
    children: [
      {
        path: '',
        action: (_ctx, commands) => commands.redirect('/editor'),
      },
      {
        path: 'browser',
        component: 'page-browser',
        action: async () => { await import('../../pages/browser.js'); },
      },
      {
        path: 'editor/:scriptId?',
        component: 'page-editor',
        action: async () => { await import('../../pages/editor.js'); },
      },
    ],
  },

  // --- 404 catch-all ---
  {
    path: '(.*)',
    action: (_ctx, commands) => commands.redirect('/editor'),
  },
];

export function initRouter(outlet: HTMLElement): Router {
  const router = new Router(outlet);
  router.setRoutes(routes);
  return router;
}
