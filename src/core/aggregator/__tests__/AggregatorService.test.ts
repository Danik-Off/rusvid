import type { Page, VideoSummary } from '../../model/media';
import type {
  FeedRequest,
  PlaybackRequest,
  ProviderCapabilities,
  ProviderMeta,
  RequestContext,
  SearchRequest,
  VideoProvider,
} from '../../provider/VideoProvider';
import { AggregatorService, interleave } from '../AggregatorService';

const CAPABILITIES: ProviderCapabilities = {
  search: true,
  trendingFeed: true,
  subscriptionsFeed: false,
  categories: false,
  nativePlayback: true,
  embedPlayback: false,
  requiresCredentials: false,
};

class FakeProvider implements VideoProvider {
  readonly meta: ProviderMeta;
  capabilities: ProviderCapabilities = CAPABILITIES;
  readonly auth = { kind: 'none', reason: 'тестовая платформа' } as const;
  signedIn = false;

  constructor(
    id: 'rutube' | 'vk' | 'sasflix',
    private readonly pages: (Page<VideoSummary> | Error)[],
  ) {
    this.meta = {
      id,
      title: id,
      badge: id.slice(0, 2).toUpperCase(),
      accentColor: '#000000',
      homepage: '',
      description: '',
    };
  }

  isConfigured(): boolean {
    return true;
  }

  isSignedIn(): boolean {
    return this.signedIn;
  }

  async search(request: SearchRequest, _context: RequestContext): Promise<Page<VideoSummary>> {
    const index = request.cursor ? Number(request.cursor) : 0;
    const next = this.pages[index];
    if (next === undefined) {
      return { items: [], nextCursor: null };
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  async feed(_request: FeedRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    return this.search({ query: '' }, context);
  }

  async getDetails(): Promise<never> {
    throw new Error('не используется в тесте');
  }

  async resolvePlayback(_request: PlaybackRequest): Promise<never> {
    throw new Error('не используется в тесте');
  }
}

function video(uid: string): VideoSummary {
  return {
    uid,
    providerId: 'rutube',
    id: uid,
    title: uid,
    isLive: false,
    access: 'free',
  };
}

function page(uids: string[], nextCursor: string | null): Page<VideoSummary> {
  return { items: uids.map(video), nextCursor };
}

describe('interleave', () => {
  it('перемешивает списки по кругу', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1', 'b2']])).toEqual([
      'a1',
      'b1',
      'a2',
      'b2',
      'a3',
    ]);
  });

  it('переживает пустые корзины', () => {
    expect(interleave([[], ['b1'], []])).toEqual(['b1']);
    expect(interleave([])).toEqual([]);
  });
});

describe('AggregatorService.search', () => {
  const aggregator = new AggregatorService();

  it('перемешивает выдачу разных платформ', async () => {
    const result = await aggregator.search('кот', {
      providers: [
        new FakeProvider('rutube', [page(['r1', 'r2'], '1')]),
        new FakeProvider('sasflix', [page(['s1'], null)]),
      ],
    });

    expect(result.items.map((item) => item.uid)).toEqual(['r1', 's1', 'r2']);
    expect(result.failures).toHaveLength(0);
    expect(result.hasMore).toBe(true);
  });

  it('не роняет выдачу, если одна платформа упала', async () => {
    const result = await aggregator.search('кот', {
      providers: [
        new FakeProvider('rutube', [page(['r1'], null)]),
        new FakeProvider('vk', [new Error('токен протух')]),
      ],
    });

    expect(result.items.map((item) => item.uid)).toEqual(['r1']);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].providerId).toBe('vk');
  });

  it('не опрашивает платформу с исчерпанным курсором', async () => {
    const exhausted = new FakeProvider('sasflix', [page(['s1'], null)]);
    const spy = jest.spyOn(exhausted, 'search');

    await aggregator.search('кот', {
      providers: [new FakeProvider('rutube', [page(['r1'], '1'), page(['r2'], null)]), exhausted],
      cursors: { rutube: '1', sasflix: null },
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('пустой запрос не идёт в сеть', async () => {
    const provider = new FakeProvider('rutube', [page(['r1'], null)]);
    const spy = jest.spyOn(provider, 'search');

    const result = await aggregator.search('   ', { providers: [provider] });

    expect(spy).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });

  it('не спрашивает ленту подписок у платформы без входа', async () => {
    const anonymous = new FakeProvider('rutube', [page(['r1'], null)]);
    anonymous.capabilities = { ...CAPABILITIES, subscriptionsFeed: true };
    const spy = jest.spyOn(anonymous, 'feed');

    const result = await aggregator.feed({ kind: 'subscriptions' }, { providers: [anonymous] });

    expect(spy).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('спрашивает ленту подписок у платформы после входа', async () => {
    const signedIn = new FakeProvider('rutube', [page(['r1'], null)]);
    signedIn.capabilities = { ...CAPABILITIES, subscriptionsFeed: true };
    signedIn.signedIn = true;

    const result = await aggregator.feed({ kind: 'subscriptions' }, { providers: [signedIn] });

    expect(result.items.map((item) => item.uid)).toEqual(['r1']);
  });

  it('hasMore становится false, когда все курсоры исчерпаны', async () => {
    const result = await aggregator.search('кот', {
      providers: [
        new FakeProvider('rutube', [page(['r1'], null)]),
        new FakeProvider('sasflix', [page(['s1'], null)]),
      ],
    });

    expect(result.hasMore).toBe(false);
  });
});
