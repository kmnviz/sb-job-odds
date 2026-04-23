import {getSportmonksMarketId} from '../../config/sportmonks-market.mapping.js';
import type {
  FetchedFixtureOdds,
  FetchedOdd,
  OddsProvider,
} from '../../types/odds-provider.js';
import type {MarketType} from '../../types/market.js';
import {mapSportmonksLabelToOutcome} from './label-mapping.js';
import {SportmonksOddsClient} from './sportmonks-odds-client.js';

type SportmonksOddShape = {
  id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  probability?: string | null;
  stopped: boolean;
  total: string | null;
  handicap: string | null;
};

export class SportmonksOddsProvider implements OddsProvider {
  readonly name = 'sportmonks' as const;

  constructor(private readonly client: SportmonksOddsClient) {}

  async fetchOddsByFixtures(params: {
    runId: string;
    fixtureProviderIds: string[];
    marketType: MarketType;
    bookmakerProviderId: string;
    batchSize: number;
  }): Promise<FetchedFixtureOdds[]> {
    const marketProviderId = getSportmonksMarketId(params.marketType);
    const fixtures = await this.client.getFixturesWithOdds({
      runId: params.runId,
      fixtureProviderIds: params.fixtureProviderIds,
      bookmakerProviderId: params.bookmakerProviderId,
      marketProviderId,
      batchSize: params.batchSize,
    });

    return fixtures.map((fixture) => {
      const rawOdds = ((fixture.odds ?? []) as SportmonksOddShape[]).filter(
        (odd) =>
          String(odd.bookmaker_id) === params.bookmakerProviderId &&
          odd.market_id === marketProviderId &&
          isRelevantForMarket(params.marketType, odd)
      );

      return {
        fixtureProviderId: String(fixture.id),
        odds: rawOdds.map((odd): FetchedOdd => ({
          outcome: mapSportmonksLabelToOutcome(params.marketType, odd.label),
          line: lineForMarket(params.marketType, odd),
          team: null,
          odds_decimal: odd.value,
          implied_probability: odd.probability ?? null,
          stopped: odd.stopped,
          provider_odd_id: String(odd.id),
        })),
      };
    });
  }
}

function isRelevantForMarket(
  marketType: MarketType,
  odd: SportmonksOddShape
): boolean {
  if (marketType === 'over_under_25') {
    return normalizeTotal(odd.total) === '2.5';
  }
  return true;
}

function lineForMarket(
  marketType: MarketType,
  odd: SportmonksOddShape
): string | null {
  if (marketType === 'asian_handicap') {
    return odd.handicap ?? null;
  }
  if (marketType === 'over_under_25') {
    return normalizeTotal(odd.total);
  }
  return null;
}

function normalizeTotal(total: string | null): string | null {
  if (total == null) return null;
  const trimmed = total.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return trimmed;
  return num.toString();
}
