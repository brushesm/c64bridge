import { readFileSync } from "node:fs";

interface PackageJsonMetadata {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly license?: string;
  readonly repository?: string | { readonly type?: string; readonly url?: string };
}

interface ManifestMetadata {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly type?: string;
  readonly license?: string;
  readonly repository?: string | { readonly type?: string; readonly url?: string };
}

function readJsonFile<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

const packageJson = readJsonFile<PackageJsonMetadata>(new URL("../../package.json", import.meta.url));
const manifestJson = readJsonFile<ManifestMetadata>(new URL("../../mcp.json", import.meta.url));

function normalizeRepositoryUrl(
  repository: PackageJsonMetadata["repository"] | ManifestMetadata["repository"],
): string | undefined {
  if (!repository) {
    return undefined;
  }
  if (typeof repository === "string") {
    return repository.trim().length > 0 ? repository.trim() : undefined;
  }
  if (
    typeof repository === "object"
    && repository !== null
    && typeof repository.url === "string"
    && repository.url.trim().length > 0
  ) {
    return repository.url.trim();
  }
  return undefined;
}

const implementationInfo = Object.freeze({
  name: manifestJson.name ?? packageJson.name ?? "c64bridge",
  version: packageJson.version ?? manifestJson.version ?? "0.0.0",
});

const projectMetadata = Object.freeze({
  name: implementationInfo.name,
  version: implementationInfo.version,
  description: manifestJson.description ?? packageJson.description ?? "",
  license: manifestJson.license ?? packageJson.license ?? "",
  repository: normalizeRepositoryUrl(manifestJson.repository ?? packageJson.repository),
  transports: manifestJson.type === "stdio" ? ["stdio"] : ["stdio"],
});

export function getMcpServerImplementationInfo(): typeof implementationInfo {
  return implementationInfo;
}

export function getMcpProjectMetadata(): typeof projectMetadata {
  return projectMetadata;
}
