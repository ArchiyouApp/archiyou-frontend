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
  {
    path: '/forgot-password',
    component: 'page-forgot-password',
    action: async () => { await import('../../pages/forgot-password.js'); },
  },
  {
    path: '/reset-password',
    component: 'page-reset-password',
    action: async () => { await import('../../pages/reset-password.js'); },
  },

  // --- Published configurator (standalone, no nav-bar — embeddable) ---
  {
    path: '/configurators/:user/:scriptAndVersion',
    component: 'page-published-configurator',
    action: async () => { await import('../../pages/published-configurator.js'); },
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
      {
        path: 'plugin',
        component: 'page-plugin',
        action: async () => { await import('../../pages/plugin.js'); },
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
