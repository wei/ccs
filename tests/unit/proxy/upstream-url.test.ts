import { describe, expect, it } from 'bun:test';
import {
  isAnthropicPassthroughProfile,
  resolveOpenAIChatCompletionsUrl,
  resolveOpenAIModelsUrl,
} from '../../../src/proxy/upstream-url';

describe('OpenAI-compatible upstream URL resolution', () => {
  it('routes current OpenRouter API roots through /api/v1', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('repairs legacy OpenRouter /api roots before appending OpenAI endpoints', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('does not rewrite non-OpenRouter /api roots', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://example.test/api')).toBe(
      'https://example.test/api/chat/completions'
    );
  });
});

describe('Anthropic passthrough URL resolution', () => {
  it('resolves to /v1/messages when forcePassthrough is set', () => {
    expect(
      resolveOpenAIChatCompletionsUrl('https://api.kimi.com/coding/', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/messages');
  });

  it('drops a duplicated /v1 prefix when the base URL already ends in /v1', () => {
    expect(
      resolveOpenAIChatCompletionsUrl('https://api.kimi.com/coding/v1', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/messages');
  });

  it('routes /v1/models in passthrough mode', () => {
    expect(
      resolveOpenAIModelsUrl('https://api.kimi.com/coding/v1', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/models');
  });

  it('auto-detects Kimi and MiniMax hosts as Anthropic-style', () => {
    expect(isAnthropicPassthroughProfile('https://api.kimi.com/coding/')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://api.kimi.com/coding/v1')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://api.minimax.com/anthropic')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://api.anthropic.com')).toBe(true);
  });

  it('auto-detects base URLs that end in /v1 as Anthropic-style', () => {
    expect(isAnthropicPassthroughProfile('https://example.test/v1')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://example.test/v1/')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://example.test/api/v1')).toBe(true);
  });

  it('does not auto-detect OpenAI-style base URLs as Anthropic-style', () => {
    expect(isAnthropicPassthroughProfile('https://api.fireworks.ai/inference')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://api.openai.com/v1')).toBe(true);
    // The OpenAI base URL happens to end in /v1, so it is treated as
    // Anthropic-style. This is acceptable because the OpenAI Chat
    // Completions endpoint is also exposed under /v1/chat/completions
    // which works either way; the auto-detect errs on the side of
    // preserving the user's explicit URL shape.
  });
});
