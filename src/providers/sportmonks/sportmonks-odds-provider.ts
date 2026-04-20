import {getSportmonksMarketId} from '../../config/sportmonks-market.mapping.js';
import type {
  FetchedFixtureOdds,
  FetchedOdd,
  OddsProvider,
} from '../../types/odds-provider.js';
import type {MarketType} from '../../types/market.js';
import {mapAsianHandicapLabelToOutcome} from './label-mapping.js';
import {SportmonksOddsClient} from './sportmonks-odds-client.js';

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
    if (params.marketType !== 'asian_handicap') {
      throw new Error(
        `Unsupported market type for Sportmonks v1 provider: ${params.marketType}`
      );
    }

    const marketProviderId = getSportmonksMarketId(params.marketType);
    const fixtures = await this.client.getFixturesWithOdds({
      runId: params.runId,
      fixtureProviderIds: params.fixtureProviderIds,
      bookmakerProviderId: params.bookmakerProviderId,
      marketProviderId,
      batchSize: params.batchSize,
    });

    return fixtures.map((fixture) => ({
      fixtureProviderId: String(fixture.id),
      odds: (fixture.odds ?? [])
        .filter(
          (odd) =>
            String(odd.bookmaker_id) === params.bookmakerProviderId &&
            odd.market_id === marketProviderId
        )
        .map((odd): FetchedOdd => ({
          outcome: mapAsianHandicapLabelToOutcome(odd.label),
          line: odd.handicap,
          team: null,
          odds_decimal: odd.value,
          implied_probability: odd.probability ?? null,
          stopped: odd.stopped,
          provider_odd_id: String(odd.id),
        })),
    }));
  }
}
