/**
 * routes/scripts.ts — per-user script CRUD over the single script_versions table.
 * All routes require auth and scope by `request.user.sub` (the author handle).
 * Bodies are the core `ScriptData` shape (validated inside ScriptStore).
 */

import type { FastifyInstance } from 'fastify';

import { scriptStore } from '../services/ScriptStore';

export async function registerScriptRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: fastify.authenticate };

  // The current user's scripts (latest version each).
  fastify.get('/scripts', auth, async (request) => {
    return scriptStore.listForUser(request.user.sub);
  });

  // Shared scripts (across authors). Static path — declared before /:fileId.
  fastify.get('/scripts/shared', auth, async () => {
    return scriptStore.listShared();
  });

  // Latest version of one file.
  fastify.get<{ Params: { fileId: string } }>('/scripts/:fileId', auth, async (request) => {
    return scriptStore.getFile(request.user.sub, request.params.fileId);
  });

  // Version history metadata.
  fastify.get<{ Params: { fileId: string } }>('/scripts/:fileId/versions', auth, async (request) => {
    return scriptStore.listVersions(request.user.sub, request.params.fileId);
  });

  // A specific historical version.
  fastify.get<{ Params: { fileId: string; versionId: string } }>(
    '/scripts/:fileId/versions/:versionId',
    auth,
    async (request) => {
      return scriptStore.getVersion(request.user.sub, request.params.fileId, request.params.versionId);
    },
  );

  // Create a new file (+ first version).
  fastify.post('/scripts', auth, async (request, reply) => {
    const stored = scriptStore.create(request.user.sub, request.body);
    reply.code(201);
    return stored;
  });

  // Append a new version to an existing file.
  fastify.put<{ Params: { fileId: string } }>('/scripts/:fileId', auth, async (request) => {
    return scriptStore.saveVersion(request.user.sub, request.params.fileId, request.body);
  });

  // Toggle sharing for a file.
  fastify.put<{ Params: { fileId: string }; Body: { shared?: boolean } }>(
    '/scripts/:fileId/shared',
    auth,
    async (request) => {
      const shared = request.body?.shared === true;
      scriptStore.setShared(request.user.sub, request.params.fileId, shared);
      return { fileId: request.params.fileId, shared };
    },
  );

  // Delete a file and all its versions.
  fastify.delete<{ Params: { fileId: string } }>('/scripts/:fileId', auth, async (request, reply) => {
    scriptStore.deleteFile(request.user.sub, request.params.fileId);
    reply.code(204);
  });
}
