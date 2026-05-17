import { afterAll, describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';

const locales = ['en', 'zh-CN', 'vi', 'ja', 'ko'] as const;

const codexAuthKeys = [
  ['codex.auth.terminalOnlyTooltip'],
  ['codex.auth.loading'],
  ['codex.auth.loadError'],
  ['codex.auth.emptyRegistry'],
  ['codex.auth.externalCodexHome', { path: '/tmp/codex-home' }],
  ['codex.auth.activeProfile'],
  ['codex.auth.switchAction'],
  ['codex.auth.col.name'],
  ['codex.auth.col.actions'],
] as const;

const originalLanguage = i18n.language;

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage);
});

describe('codex auth i18n', () => {
  it.each(locales)('resolves codex auth dashboard keys for %s', async (locale) => {
    await i18n.changeLanguage(locale);

    for (const [key, options] of codexAuthKeys) {
      const translated = i18n.t(key, options);

      expect(translated).not.toBe(key);
      expect(translated).not.toContain('codex.auth.');
    }
  });
});
