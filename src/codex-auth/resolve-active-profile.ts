/**
 * Synchronous hot-path resolver for the active codex auth profile. <5ms typical.
 * Precedence: CCS_CODEX_PROFILE env → registry.default → null (legacy ~/.codex).
 * Legacy fallback is allowed only when no explicit CCS_CODEX_PROFILE was requested.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getCodexAuthRegistryPath, resolveCodexProfileDir } from './codex-profile-paths';

export interface ResolvedProfile {
  name: string;
  dir: string;
  source: 'env' | 'default';
}

export class CodexAuthProfileResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexAuthProfileResolutionError';
  }
}

interface RegistryShape {
  version?: string;
  default?: string | null;
  profiles?: Record<string, unknown>;
}

/** @param env - Process env map; defaults to process.env. Injectable for tests. */
export function resolveActiveProfile(env: NodeJS.ProcessEnv = process.env): ResolvedProfile | null {
  const registryPath = getCodexAuthRegistryPath();
  const envName = (env.CCS_CODEX_PROFILE ?? '').trim();

  // F4: silent fallback — no registry means no profiles, legacy mode
  if (!fs.existsSync(registryPath)) {
    if (envName) {
      throw new CodexAuthProfileResolutionError(
        `CCS_CODEX_PROFILE='${envName}' is set but ${registryPath} does not exist. Refusing to fall back to ~/.codex.`
      );
    }
    return null;
  }

  let registry: RegistryShape;
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const msg = `registry at ${registryPath} is not a valid YAML object`;
      if (envName) {
        throw new CodexAuthProfileResolutionError(
          `CCS_CODEX_PROFILE='${envName}' is set but ${msg}. Refusing to fall back to ~/.codex.`
        );
      }
      process.stderr.write(`[!] codex-auth: ${msg}, falling back to ~/.codex\n`);
      return null;
    }
    registry = parsed as RegistryShape;
  } catch (err) {
    if (err instanceof CodexAuthProfileResolutionError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (envName) {
      throw new CodexAuthProfileResolutionError(
        `CCS_CODEX_PROFILE='${envName}' is set but registry YAML is corrupt at ${registryPath} (${msg}). Refusing to fall back to ~/.codex.`
      );
    }
    process.stderr.write(
      `[!] codex-auth: registry YAML corrupt at ${registryPath} (${msg}), falling back to ~/.codex\n`
    );
    return null;
  }

  const profiles = registry.profiles ?? {};

  // F2: explicit env override
  if (envName) {
    if (!Object.prototype.hasOwnProperty.call(profiles, envName)) {
      throw new CodexAuthProfileResolutionError(
        `CCS_CODEX_PROFILE='${envName}' not found in registry. Refusing to fall back to ~/.codex.`
      );
    }
    return {
      name: envName,
      dir: path.resolve(resolveCodexProfileDir(envName)),
      source: 'env',
    };
  }

  // F3: registry default
  const defaultName = registry.default ?? null;
  if (defaultName && Object.prototype.hasOwnProperty.call(profiles, defaultName)) {
    return {
      name: defaultName,
      dir: path.resolve(resolveCodexProfileDir(defaultName)),
      source: 'default',
    };
  }

  // F4: no profile configured
  return null;
}
