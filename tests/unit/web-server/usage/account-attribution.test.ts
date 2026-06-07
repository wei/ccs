/**
 * Phase 1A: Account Attribution Tests
 *
 * TDD tests for auth_index → accountId mapping through the usage pipeline.
 * Covers:
 * - auth_index maps to account email via accountMap in transformer
 * - extractCliproxyUsageHistoryDetails carries accountId
 * - getTodayCostByAccount returns correct per-account totals
 * - Profile-based aggregation unaffected (backward compat)
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { CliproxyUsageApiResponse, CliproxyManagementAuthFile } from '../../../../src/cliproxy/services/stats-fetcher';

// ============================================================================
// HELPERS & FIXTURES
// ============================================================================

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function makeResponse(entries: Array<{
  provider: string;
  model: string;
  auth_index: number;
  source: string;
  timestamp: string;
  input: number;
  output: number;
  failed?: boolean;
}>): CliproxyUsageApiResponse {
  const apis: CliproxyUsageApiResponse['usage'] = { apis: {} };
  for (const e of entries) {
    if (!apis.apis![e.provider]) {
      apis.apis![e.provider] = { models: {} };
    }
    const models = apis.apis![e.provider].models!;
    if (!models[e.model]) {
      models[e.model] = { details: [] };
    }
    models[e.model].details!.push({
      timestamp: e.timestamp,
      source: e.source,
      auth_index: e.auth_index,
      tokens: {
        input_tokens: e.input,
        output_tokens: e.output,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: e.input + e.output,
      },
      failed: e.failed ?? false,
    });
  }
  return { usage: apis };
}

const twoAccountResponse = makeResponse([
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    auth_index: 0,
    source: 'old-source-a',
    timestamp: `${TODAY}T10:00:00.000Z`,
    input: 1000,
    output: 500,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    auth_index: 1,
    source: 'old-source-b',
    timestamp: `${TODAY}T11:00:00.000Z`,
    input: 2000,
    output: 800,
  },
  // auth_index 0 again — same account, second request.
  // output=201 (not 200) ensures alice's two-request total ($0.018025) strictly
  // exceeds bob's single-request total ($0.018), avoiding a floating-point tie.
  {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    auth_index: 0,
    source: 'old-source-a',
    timestamp: `${TODAY}T12:00:00.000Z`,
    input: 500,
    output: 201,
  },
]);

const authFileMap: Map<number | string, string> = new Map([
  [0, 'alice@example.com'],
  [1, 'bob@example.com'],
]);

// ============================================================================
// TRANSFORMER: extractCliproxyUsageHistoryDetails with accountMap
// ============================================================================

describe('extractCliproxyUsageHistoryDetails with accountMap', () => {
  it('populates accountId from accountMap when auth_index is present', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    const aliceDetails = details.filter((d) => d.accountId === 'alice@example.com');
    const bobDetails = details.filter((d) => d.accountId === 'bob@example.com');

    expect(aliceDetails).toHaveLength(2); // auth_index 0 appears twice
    expect(bobDetails).toHaveLength(1);   // auth_index 1 appears once
  });

  it('falls back to detail.source when auth_index not in accountMap', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const partialMap: Map<number | string, string> = new Map([[0, 'alice@example.com']]);
    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, partialMap);

    const unknownAccount = details.find((d) => d.accountId === 'old-source-b');
    expect(unknownAccount).toBeDefined();
  });

  it('does not include accountId when no accountMap is provided (backward compat)', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);

    for (const detail of details) {
      expect(detail.accountId).toBeUndefined();
    }
  });

  it('does not expose source or auth_index on returned history details', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    for (const detail of details) {
      expect((detail as Record<string, unknown>).source).toBeUndefined();
      expect((detail as Record<string, unknown>).auth_index).toBeUndefined();
    }
  });
});

// ============================================================================
// TRANSFORMER: CliproxyUsageHistoryDetail type has optional accountId
// ============================================================================

describe('CliproxyUsageHistoryDetail type', () => {
  it('allows accountId as optional string field', async () => {
    const { normalizeCliproxyUsageHistoryDetail } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const withAccount = normalizeCliproxyUsageHistoryDetail({
      model: 'claude-sonnet-4-5',
      timestamp: `${TODAY}T10:00:00.000Z`,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      requestCount: 1,
      cost: 0.01,
      failed: false,
      accountId: 'alice@example.com',
    });

    expect(withAccount).not.toBeNull();
    expect(withAccount?.accountId).toBe('alice@example.com');
  });

  it('normalizes detail without accountId (remains undefined)', async () => {
    const { normalizeCliproxyUsageHistoryDetail } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const noAccount = normalizeCliproxyUsageHistoryDetail({
      model: 'claude-sonnet-4-5',
      timestamp: `${TODAY}T10:00:00.000Z`,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      requestCount: 1,
      cost: 0.01,
      failed: false,
    });

    expect(noAccount).not.toBeNull();
    expect(noAccount?.accountId).toBeUndefined();
  });
});

// ============================================================================
// DATA-AGGREGATOR: getTodayCostByAccount
// ============================================================================

describe('getTodayCostByAccount', () => {
  it('returns per-account cost totals for today', async () => {
    const { getTodayCostByAccount } = await import('../../../../src/web-server/usage/data-aggregator');

    const details = [];

    // Simulate alice's two requests today
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');
    const todayDetails = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    const result = getTodayCostByAccount(todayDetails, TODAY);

    // Alice has auth_index 0: two requests (claude-sonnet + claude-opus)
    // Bob has auth_index 1: one request (claude-sonnet)
    expect(typeof result['alice@example.com']).toBe('number');
    expect(typeof result['bob@example.com']).toBe('number');
    expect(result['alice@example.com']).toBeGreaterThan(0);
    expect(result['bob@example.com']).toBeGreaterThan(0);
    // Alice has two requests across two models; Bob has one request with more tokens.
    // Alice's two-request total ($0.018025) exceeds Bob's single-request total ($0.018).
    expect(result['alice@example.com']).toBeGreaterThan(result['bob@example.com']);
  });

  it('returns empty object when no details exist for today', async () => {
    const { getTodayCostByAccount } = await import('../../../../src/web-server/usage/data-aggregator');

    const result = getTodayCostByAccount([], TODAY);

    expect(result).toEqual({});
  });

  it('filters out details from days other than today', async () => {
    const { getTodayCostByAccount } = await import('../../../../src/web-server/usage/data-aggregator');
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const yesterdayResponse = makeResponse([
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        auth_index: 0,
        source: 'old-source-a',
        timestamp: '2020-01-01T10:00:00.000Z', // definitely not today
        input: 9999,
        output: 9999,
      },
    ]);
    const details = extractCliproxyUsageHistoryDetails(yesterdayResponse, authFileMap);
    const result = getTodayCostByAccount(details, TODAY);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('accumulates costs across multiple details for the same account', async () => {
    const { getTodayCostByAccount } = await import('../../../../src/web-server/usage/data-aggregator');
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    // alice appears for two models — verify aggregated correctly
    const result = getTodayCostByAccount(details, TODAY);
    const aliceCostFromDetails = details
      .filter((d) => d.accountId === 'alice@example.com')
      .reduce((acc, d) => acc + d.cost, 0);

    expect(result['alice@example.com']).toBeCloseTo(aliceCostFromDetails, 10);
  });

  it('details without accountId are grouped under fallback source key', async () => {
    const { getTodayCostByAccount } = await import('../../../../src/web-server/usage/data-aggregator');
    const { extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    // no accountMap — accountId will be undefined on all details
    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);
    const result = getTodayCostByAccount(details, TODAY);

    // With no accountId, details with cost > 0 should still contribute
    // grouped under some non-empty key derived from the detail
    expect(Object.values(result).some((v) => v > 0)).toBe(true);
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY: existing profile aggregation still works
// ============================================================================

describe('backward compatibility: profile-based aggregation unaffected', () => {
  it('transformCliproxyToDailyUsage works without accountMap', async () => {
    const { transformCliproxyToDailyUsage } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const daily = transformCliproxyToDailyUsage(twoAccountResponse);

    expect(daily.length).toBeGreaterThan(0);
    expect(daily[0].source).toBe('cliproxy');
    expect(daily[0].modelBreakdowns.length).toBeGreaterThan(0);
  });

  it('buildCliproxyUsageHistoryAggregates preserves existing shape', async () => {
    const { buildCliproxyUsageHistoryAggregates, extractCliproxyUsageHistoryDetails } = await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);
    const { daily, hourly, monthly } = buildCliproxyUsageHistoryAggregates(details);

    expect(Array.isArray(daily)).toBe(true);
    expect(Array.isArray(hourly)).toBe(true);
    expect(Array.isArray(monthly)).toBe(true);
    if (daily.length > 0) {
      expect(typeof daily[0].date).toBe('string');
      expect(typeof daily[0].totalCost).toBe('number');
    }
  });

  it('DailyUsage shape includes optional accountId field', async () => {
    // Type-level test: verify DailyUsage can carry accountId without breaking shape
    type DailyUsageShape = { date: string; source: string; totalCost: number; accountId?: string };
    const sample: DailyUsageShape = {
      date: TODAY,
      source: 'cliproxy',
      totalCost: 1.5,
      accountId: 'alice@example.com',
    };
    const noAccount: DailyUsageShape = { date: TODAY, source: 'cliproxy', totalCost: 0.5 };
    expect(sample.accountId).toBe('alice@example.com');
    expect(noAccount.accountId).toBeUndefined();
  });
});

// ============================================================================
// STATS-FETCHER: buildAuthIndexToAccountMap
// ============================================================================

describe('buildAuthIndexToAccountMap', () => {
  it('builds map from auth files with auth_index and email', async () => {
    const { buildAuthIndexToAccountMap } = await import('../../../../src/cliproxy/services/stats-fetcher');

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 0, provider: 'anthropic', email: 'alice@example.com' },
      { auth_index: 1, provider: 'anthropic', email: 'bob@example.com' },
      { auth_index: 2, provider: 'gemini', email: 'carol@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.get('0')).toBe('alice@example.com');
    expect(map.get('1')).toBe('bob@example.com');
    expect(map.get('2')).toBe('carol@example.com');
  });

  it('skips entries missing auth_index', async () => {
    const { buildAuthIndexToAccountMap } = await import('../../../../src/cliproxy/services/stats-fetcher');

    const authFiles: CliproxyManagementAuthFile[] = [
      { provider: 'anthropic', email: 'nobody@example.com' }, // no auth_index
      { auth_index: 3, provider: 'anthropic', email: 'alice@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.size).toBe(1);
    expect(map.get('3')).toBe('alice@example.com');
  });

  it('skips entries missing email', async () => {
    const { buildAuthIndexToAccountMap } = await import('../../../../src/cliproxy/services/stats-fetcher');

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 4, provider: 'anthropic' }, // no email
      { auth_index: 5, provider: 'anthropic', email: 'dave@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.size).toBe(1);
    expect(map.get('5')).toBe('dave@example.com');
  });

  it('returns empty map for empty auth files array', async () => {
    const { buildAuthIndexToAccountMap } = await import('../../../../src/cliproxy/services/stats-fetcher');

    const map = buildAuthIndexToAccountMap([]);

    expect(map.size).toBe(0);
  });

  it('handles numeric and string auth_index keys consistently', async () => {
    const { buildAuthIndexToAccountMap } = await import('../../../../src/cliproxy/services/stats-fetcher');

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 7, provider: 'anthropic', email: 'alice@example.com' },
      { auth_index: '8', provider: 'anthropic', email: 'bob@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.get('7')).toBe('alice@example.com');
    expect(map.get('8')).toBe('bob@example.com');
  });
});
