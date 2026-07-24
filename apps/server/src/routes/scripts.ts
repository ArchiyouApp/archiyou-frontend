/**
 * routes/scripts.ts — a user's own scripts, under `/scripts/{user}/…`.
 *
 * All routes require auth AND self-scoping: `{user}` must equal the token handle
 * (`request.user.sub`), else 403. Bodies are the core `ScriptData` shape
 * (validated inside ScriptStore). Individual files are addressed by `fileId`.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import type { ScriptData, ScriptShared } from '@archiyou/core/src/execution/types';

import { config } from '../config';
import { scriptStore } from '../services/ScriptStore';

/** Public URL where a published configurator is served (frontend origin). */
function configuratorUrl(author: string, name: string, version: string): string {
  return `${config.frontendUrl}/configurators/${author}/${name}:${version}`;
}

export async function registerScriptRoutes(fastify: FastifyInstance): Promise<void> {
  // Reject unless authenticated AND the {user} segment is the caller's own handle.
  async function assertSelf(request: FastifyRequest<{ Params: { user: string } }>, reply: FastifyReply) {
    if ((request.params.user ?? '').toLowerCase() !== request.user.sub) {
      reply.code(403).send({ success: false, error: 'Forbidden' });
    }
  }
  const auth = { preHandler: [fastify.authenticate, assertSelf] };

  // The user's scripts (latest version each).
  fastify.get<{ Params: { user: string } }>('/scripts/:user', auth, async (request) => {
    return scriptStore.listForUser(request.user.sub);
  });

  // Create a new file (+ first version).
  fastify.post<{ Params: { user: string } }>('/scripts/:user', auth, async (request, reply) => {
    const stored = scriptStore.create(request.user.sub, request.body);
    reply.code(201);
    return stored;
  });

  // The caller's published configurators — every published version, newest first.
  // Lives under the static `/scripts/configurators` segment (a static child of the
  // static `scripts` node, like `/scripts/published`) so it isn't shadowed by the
  // `/scripts/:user/:fileId` param route; the author comes from the JWT, not the path.
  const authedOnly = { preHandler: [fastify.authenticate] };
  fastify.get('/scripts/configurators', authedOnly, async (request) => {
    return scriptStore.listPublishedVersionsForAuthor(request.user.sub);
  });

  // Edit a published configurator in place: update just this version's `published`
  // metadata (version + code snapshot unchanged). Body is the ScriptData whose
  // `published` is applied. Re-stamps the configurator URL (name/version stable).
  fastify.put<{ Params: { versionId: string } }>(
    '/scripts/configurators/:versionId',
    authedOnly,
    async (request, reply) => {
      const body = request.body as ScriptData;
      const published = body?.published;
      if (!published) {
        reply.code(422);
        return { success: false, error: 'Published metadata is required' };
      }
      if (body.name && body.version) {
        published.url = configuratorUrl(request.user.sub, body.name, body.version);
      }
      return scriptStore.updatePublishedVersion(request.user.sub, request.params.versionId, published);
    },
  );

  // Un-publish a single version (clears its `published` metadata; keeps the row).
  fastify.delete<{ Params: { versionId: string } }>(
    '/scripts/configurators/:versionId',
    authedOnly,
    async (request, reply) => {
      scriptStore.unpublishVersion(request.user.sub, request.params.versionId);
      reply.code(204);
    },
  );

  // Latest version of one file.
  fastify.get<{ Params: { user: string; fileId: string } }>('/scripts/:user/:fileId', auth, async (request) => {
    return scriptStore.getFile(request.user.sub, request.params.fileId);
  });

  // Append a new version to an existing file.
  fastify.put<{ Params: { user: string; fileId: string } }>('/scripts/:user/:fileId', auth, async (request) => {
    return scriptStore.saveVersion(request.user.sub, request.params.fileId, request.body);
  });

  // Delete a file and all its versions.
  fastify.delete<{ Params: { user: string; fileId: string } }>('/scripts/:user/:fileId', auth, async (request, reply) => {
    scriptStore.deleteFile(request.user.sub, request.params.fileId);
    reply.code(204);
  });

  // Version history metadata.
  fastify.get<{ Params: { user: string; fileId: string } }>('/scripts/:user/:fileId/versions', auth, async (request) => {
    return scriptStore.listVersions(request.user.sub, request.params.fileId);
  });

  // A specific historical version.
  fastify.get<{ Params: { user: string; fileId: string; versionId: string } }>(
    '/scripts/:user/:fileId/versions/:versionId',
    auth,
    async (request) => {
      return scriptStore.getVersion(request.user.sub, request.params.fileId, request.params.versionId);
    },
  );

  // Share a file: append a new version carrying a concrete semver + shared
  // metadata. Body is the full ScriptData (with `version` + `shared` set).
  fastify.post<{ Params: { user: string; fileId: string } }>(
    '/scripts/:user/:fileId/share',
    auth,
    async (request, reply) => {
      const stored = scriptStore.share(request.user.sub, request.params.fileId, request.body);
      reply.code(201);
      return stored;
    },
  );

  // Publish a file as configurator: append a new version carrying a concrete
  // semver + published metadata. Body is the full ScriptData (with `version` +
  // `published` set).
  fastify.post<{ Params: { user: string; fileId: string } }>(
    '/scripts/:user/:fileId/publish',
    auth,
    async (request, reply) => {
      const body = request.body as ScriptData;
      // Stamp the public configurator URL (built from FRONTEND_URL) so the client
      // can show where the configurator is served — works in dev + prod.
      if (body?.published && body.version && body.name) {
        body.published.url = configuratorUrl(request.user.sub, body.name, body.version);
      }
      const stored = scriptStore.publish(request.user.sub, request.params.fileId, body);
      reply.code(201);
      return stored;
    },
  );

  // Set/clear sharing metadata for a file. Body is the ScriptShared object, or
  // { shared: null } / null to un-share.
  fastify.put<{ Params: { user: string; fileId: string }; Body: { shared?: ScriptShared | null } | ScriptShared | null }>(
    '/scripts/:user/:fileId/shared',
    auth,
    async (request) => {
      const body = request.body as { shared?: ScriptShared | null } | ScriptShared | null;
      // Accept either the bare ScriptShared object or a { shared } envelope.
      const shared: ScriptShared | null =
        body && typeof body === 'object' && 'shared' in body
          ? (body.shared ?? null)
          : ((body as ScriptShared | null) ?? null);
      scriptStore.setShared(request.user.sub, request.params.fileId, shared);
      return { fileId: request.params.fileId, shared };
    },
  );
}
