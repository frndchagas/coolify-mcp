import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";
import {
  confirmDestructive,
  list,
  ok,
  parseBody,
  requireWrite,
  unwrap,
} from "./common.js";
import { redactSecrets } from "./helpers.js";

export function registerInfraTools(server: McpServer) {
  server.registerTool(
    "updateServer",
    {
      title: "Update server",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Update a server by UUID. Common fields are exposed; any other Coolify server field can go in `extra`.",
      inputSchema: {
        uuid: zod.string(),
        name: zod.string().optional(),
        description: zod.string().optional(),
        ip: zod.string().optional(),
        port: zod.number().int().optional(),
        user: zod.string().optional(),
        private_key_uuid: zod.string().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional Coolify server fields (proxy_type, ...)"),
      },
    },
    async ({ uuid, extra, ...fields }) => {
      requireWrite();
      const body = parseBody(
        z.zUpdateServerByUuidData.shape.body,
        { ...fields, ...(extra ?? {}) },
        "updateServer"
      );
      const data = await unwrap(
        sdk.updateServerByUuid({ path: { uuid }, body }),
        "updateServer"
      );
      return ok(`Server ${uuid} updated.`, redactSecrets(data));
    }
  );

  server.registerTool(
    "deleteServer",
    {
      title: "Delete server",
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      description: "Delete a server by UUID.",
      inputSchema: { uuid: zod.string() },
    },
    async ({ uuid }) => {
      requireWrite();
      await confirmDestructive(
        server,
        `Delete server ${uuid}`,
        "Removes the server from Coolify. Resources on it stop being managed. Not recoverable."
      );
      const data = await unwrap(
        sdk.deleteServerByUuid({ path: { uuid } }),
        "deleteServer"
      );
      return ok(`Server ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "getServerResources",
    {
      title: "Get server resources",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "List all resources (applications, databases, services) running on a server.",
      inputSchema: { uuid: zod.string() },
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.getResourcesByServerUuid({ path: { uuid } }),
        "getServerResources"
      );
      return list(`Resources on server ${uuid} fetched.`, data);
    }
  );

  server.registerTool(
    "getServerDomains",
    {
      title: "Get server domains",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "List all domains configured on a server.",
      inputSchema: { uuid: zod.string() },
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.getDomainsByServerUuid({ path: { uuid } }),
        "getServerDomains"
      );
      return list(`Domains on server ${uuid} fetched.`, data);
    }
  );

  server.registerTool(
    "getPrivateKey",
    {
      title: "Get private key",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Get an SSH private key's metadata by UUID. The key material is masked unless showSecrets is true.",
      inputSchema: {
        uuid: zod.string(),
        showSecrets: zod.boolean().optional(),
      },
    },
    async ({ uuid, showSecrets }) => {
      const data = await unwrap(
        sdk.getPrivateKeyByUuid({ path: { uuid } }),
        "getPrivateKey"
      );
      if (showSecrets) {
        return ok(`Private key ${uuid} fetched.`, data);
      }
      return ok(
        `Private key ${uuid} fetched. Key material masked by default.`,
        redactSecrets(data)
      );
    }
  );

  server.registerTool(
    "updatePrivateKey",
    {
      title: "Update private key",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Update an SSH private key. The Coolify API identifies the key by its private_key content (required); name and description are optional.",
      inputSchema: z.zUpdatePrivateKeyData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(sdk.updatePrivateKey({ body }), "updatePrivateKey");
      return ok("Private key updated.", redactSecrets(data));
    }
  );

  server.registerTool(
    "deletePrivateKey",
    {
      title: "Delete private key",
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      description:
        "Delete an SSH private key by UUID. Not recoverable from Coolify once gone.",
      inputSchema: { uuid: zod.string() },
    },
    async ({ uuid }) => {
      requireWrite();
      await confirmDestructive(
        server,
        `Delete private key ${uuid}`,
        "The SSH key is not recoverable from Coolify once gone; servers using it lose access."
      );
      const data = await unwrap(
        sdk.deletePrivateKeyByUuid({ path: { uuid } }),
        "deletePrivateKey"
      );
      return ok(`Private key ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "getGithubAppRepositories",
    {
      title: "List GitHub App repositories",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "List repositories accessible to a GitHub App.",
      inputSchema: { github_app_id: zod.number().int() },
    },
    async ({ github_app_id }) => {
      const data = await unwrap(
        sdk.loadRepositories({ path: { github_app_id } }),
        "getGithubAppRepositories"
      );
      return list(`Repositories for GitHub App ${github_app_id} fetched.`, data);
    }
  );

  server.registerTool(
    "getGithubAppBranches",
    {
      title: "List repository branches",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "List branches of a repository accessible to a GitHub App.",
      inputSchema: {
        github_app_id: zod.number().int(),
        owner: zod.string(),
        repo: zod.string(),
      },
    },
    async ({ github_app_id, owner, repo }) => {
      const data = await unwrap(
        sdk.loadBranches({ path: { github_app_id, owner, repo } }),
        "getGithubAppBranches"
      );
      return list(`Branches for ${owner}/${repo} fetched.`, data);
    }
  );
}
