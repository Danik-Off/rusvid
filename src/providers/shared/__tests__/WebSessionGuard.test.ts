import { ProviderError } from '../../../core/errors/ProviderError';
import { CredentialsStore } from '../../../data/credentials/CredentialsStore';
import type { HttpClient } from '../../../data/http/HttpClient';
import { InMemoryKeyValueStore } from '../../../data/storage/KeyValueStore';
import { WebSessionGuard } from '../WebSessionGuard';

function makeHttp(behaviour: () => Promise<unknown>): HttpClient {
  return { getJson: behaviour } as unknown as HttpClient;
}

async function makeGuard(behaviour: () => Promise<unknown>) {
  const credentials = new CredentialsStore(new InMemoryKeyValueStore());
  await credentials.hydrate();
  return {
    credentials,
    guard: new WebSessionGuard('rutube', makeHttp(behaviour), credentials, '/api/profile/user/'),
  };
}

describe('WebSessionGuard', () => {
  it('считает сессию активной, когда проверочный запрос прошёл', async () => {
    const { guard, credentials } = await makeGuard(async () => ({ id: 1 }));

    expect(await guard.verify()).toBe(true);
    expect(guard.isSignedIn()).toBe(true);
    expect(credentials.hasSession('rutube')).toBe(true);
  });

  it('считает сессию отсутствующей на 401', async () => {
    const { guard } = await makeGuard(async () => {
      throw new ProviderError({ code: 'AUTH_REQUIRED', providerId: 'rutube' });
    });

    expect(await guard.verify()).toBe(false);
    expect(guard.isSignedIn()).toBe(false);
  });

  it('не сбрасывает вход, если упала сеть', async () => {
    let online = true;
    const { guard } = await makeGuard(async () => {
      if (online) {
        return { id: 1 };
      }
      throw new ProviderError({ code: 'NETWORK', providerId: 'rutube' });
    });

    expect(await guard.verify()).toBe(true);

    online = false;
    // Пропала сеть — это не «пользователь вышел»: отметка должна уцелеть.
    expect(await guard.verify()).toBe(true);
    expect(guard.isSignedIn()).toBe(true);
  });

  it('сбрасывает вход на неповторяемой ошибке', async () => {
    let broken = false;
    const { guard } = await makeGuard(async () => {
      if (broken) {
        throw new ProviderError({ code: 'PARSE', providerId: 'rutube' });
      }
      return { id: 1 };
    });

    await guard.verify();
    broken = true;

    expect(await guard.verify()).toBe(false);
  });

  it('forget() убирает отметку о входе', async () => {
    const { guard } = await makeGuard(async () => ({ id: 1 }));

    await guard.verify();
    await guard.forget();

    expect(guard.isSignedIn()).toBe(false);
  });
});
