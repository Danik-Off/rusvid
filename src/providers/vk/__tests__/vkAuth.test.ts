import { vkAuthSpec, VK_REDIRECT_URL } from '../vkAuth';

describe('vkAuthSpec.buildAuthorizeUrl', () => {
  it('запрашивает только права на видео и бессрочный токен', () => {
    const url = vkAuthSpec.buildAuthorizeUrl('51234567');

    expect(url).toContain('https://oauth.vk.com/authorize?');
    expect(url).toContain('client_id=51234567');
    expect(url).toContain('scope=video%2Coffline');
    expect(url).toContain('response_type=token');
    expect(url).toContain('revoke=1');
  });
});

describe('vkAuthSpec.extractToken', () => {
  it('достаёт токен из фрагмента редиректа', () => {
    const url = `${VK_REDIRECT_URL}#access_token=vk1.a.abc&expires_in=0&user_id=1`;
    expect(vkAuthSpec.extractToken(url)).toBe('vk1.a.abc');
  });

  it('игнорирует промежуточные переходы', () => {
    expect(vkAuthSpec.extractToken('https://oauth.vk.com/authorize?client_id=1')).toBeNull();
    expect(vkAuthSpec.extractToken('https://m.vk.com/login')).toBeNull();
  });

  it('не принимает редирект без токена', () => {
    expect(vkAuthSpec.extractToken(`${VK_REDIRECT_URL}#expires_in=0`)).toBeNull();
  });
});

describe('vkAuthSpec.extractError', () => {
  it('читает отказ пользователя', () => {
    const url = `${VK_REDIRECT_URL}#error=access_denied&error_description=User+denied`;
    expect(vkAuthSpec.extractError(url)).toBe('access_denied: User denied');
  });

  it('читает ошибку из query-строки', () => {
    const url = `${VK_REDIRECT_URL}?error=invalid_request`;
    expect(vkAuthSpec.extractError(url)).toBe('invalid_request');
  });

  it('возвращает null на успешном редиректе', () => {
    expect(vkAuthSpec.extractError(`${VK_REDIRECT_URL}#access_token=x`)).toBeNull();
  });
});
