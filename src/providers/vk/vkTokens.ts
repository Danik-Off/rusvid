/**
 * Токены доступа к API VK Видео.
 *
 * У VK Видео два равноправных режима, и приложение поддерживает оба:
 *
 * - **без входа** — `auth.getAnonymToken` выдаёт анонимный токен любому, кому
 *   он нужен: единственный обязательный параметр — идентификатор клиента,
 *   ни секрета, ни cookie, ни регистрации приложения. Этого токена хватает
 *   на поиск, витрину, разделы и карточки видео;
 * - **со входом** — `video.getWebToken` меняет cookie-сессию сайта на
 *   пользовательский токен. Тот же набор методов начинает отвечать
 *   персонально: в витрине появляются разделы вошедшего человека.
 *
 * Cookie в этот код не попадают: на Android `WebView` экрана входа и сетевой
 * стек React Native делят общий `android.webkit.CookieManager`, поэтому запрос
 * `video.getWebToken` уходит авторизованным сам по себе. Пароль через наше
 * приложение по-прежнему не проходит.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type { HttpClient } from '../../data/http/HttpClient';
import type { VkTokenDto } from './vkApiTypes';
import { unwrapVkEnvelope } from './vkEnvelope';

/**
 * Идентификатор веб-клиента VK Видео.
 *
 * Это не «чужой ключ, выданный разработчику», а публичный номер, который
 * `vkvideo.ru` открыто указывает в собственных запросах: получить по нему
 * анонимный токен может кто угодно и без секрета. Приложение обращается к
 * платформе ровно так же, как её собственная веб-версия, и ничего, кроме
 * анонимного доступа, этот идентификатор не открывает.
 */
export const VK_WEB_APP_ID = 52461373;

/** Версия API, которой сейчас пользуется веб-клиент VK Видео. */
export const VK_API_VERSION = '5.259';

/**
 * За сколько до истечения считать токен непригодным.
 *
 * Токен живёт сутки, так что запас щедрый: он страхует от расхождения часов
 * устройства с сервером, из-за которого запрос уходил бы с только что
 * протухшим токеном и падал бы на ровном месте.
 */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Если платформа не сказала срок жизни — считаем токен короткоживущим. */
const FALLBACK_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Сколько не трогать сессию сайта после отказа авторизации.
 *
 * Отметка «вход был» живёт в `CredentialsStore` и обновляется не сразу, так
 * что без этой паузы каждый запрос списка начинался бы с заведомо провального
 * обмена cookie на токен — лишний круг в сеть на ровном месте.
 */
const USER_RETRY_COOLDOWN_MS = 60 * 1000;

/** Проверка сессии не должна заставлять пользователя ждать. */
const TOKEN_TIMEOUT_MS = 8000;

export type VkTokenKind = 'user' | 'anonymous';

export interface VkToken {
  readonly value: string;
  readonly kind: VkTokenKind;
  readonly expiresAtMs: number;
}

export class VkTokenStore {
  /**
   * По токену на режим, а не один общий.
   *
   * Пользовательский токен подошёл бы и к анонимному запросу, но переиспользуй
   * мы его — выход из аккаунта оказался бы фикцией: cookie уже погашены,
   * а приложение до самого истечения токена продолжало бы ходить в VK от имени
   * вышедшего человека.
   */
  private readonly slots = new Map<VkTokenKind, VkToken>();
  /** Незавершённые запросы токена — чтобы три экрана сразу не просили три. */
  private readonly pending = new Map<VkTokenKind, Promise<VkToken>>();
  /** До какого момента не пробовать сессию сайта — см. USER_RETRY_COOLDOWN_MS. */
  private userDeniedUntilMs = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Токен для обычного запроса.
   *
   * `prefer === 'user'` означает «пользователь заходил, попробуй его сессию»:
   * если сессия уже истекла, запрос всё равно должен состояться — просто
   * анонимно. Иначе истёкшая cookie превращала бы работающий поиск в ошибку.
   */
  async get(prefer: VkTokenKind, signal?: AbortSignal): Promise<VkToken> {
    const cached = this.usable(prefer);
    if (cached) {
      return cached;
    }
    if (prefer === 'anonymous' || this.now() < this.userDeniedUntilMs) {
      return this.acquire('anonymous', signal);
    }
    try {
      return await this.acquire('user', signal);
    } catch (cause) {
      if (ProviderError.from(cause, 'vk').code === 'AUTH_REQUIRED') {
        this.userDeniedUntilMs = this.now() + USER_RETRY_COOLDOWN_MS;
        return this.acquire('anonymous', signal);
      }
      throw cause;
    }
  }

  /**
   * Пользовательский токен и ничего кроме него.
   *
   * Именно этим проверяется вход: получилось — сессия сайта жива, отказ
   * авторизации — её нет. Ни подмены анонимным, ни паузы после отказа здесь
   * быть не должно: проверку запускает сам пользователь кнопкой «Я вошёл»,
   * и ответ ей нужен про сейчас, а не про минуту назад.
   */
  async requireUser(signal?: AbortSignal): Promise<VkToken> {
    return this.usable('user') ?? this.acquire('user', signal);
  }

  /** Забыть токены — после выхода или после отказа авторизации. */
  forget(): void {
    this.slots.clear();
    this.userDeniedUntilMs = 0;
  }

  private usable(kind: VkTokenKind): VkToken | null {
    const token = this.slots.get(kind);
    return token && token.expiresAtMs - EXPIRY_MARGIN_MS > this.now() ? token : null;
  }

  private acquire(kind: VkTokenKind, signal?: AbortSignal): Promise<VkToken> {
    const running = this.pending.get(kind);
    if (running) {
      return running;
    }
    const request = this.request(kind, signal)
      .then((token) => {
        this.slots.set(kind, token);
        if (kind === 'user') {
          this.userDeniedUntilMs = 0;
        }
        return token;
      })
      .finally(() => {
        this.pending.delete(kind);
      });

    this.pending.set(kind, request);
    return request;
  }

  private async request(kind: VkTokenKind, signal?: AbortSignal): Promise<VkToken> {
    const [method, params] =
      kind === 'user'
        ? // Cookie сессии подставляет системное хранилище — см. заголовок файла.
          (['video.getWebToken', { app_id: VK_WEB_APP_ID }] as const)
        : (['auth.getAnonymToken', { client_id: VK_WEB_APP_ID }] as const);

    const response = await this.http.postForm(
      `/method/${method}`,
      { ...params, v: VK_API_VERSION, lang: 'ru' },
      { signal, timeoutMs: TOKEN_TIMEOUT_MS },
    );
    const dto = unwrapVkEnvelope<VkTokenDto>(await response.text());

    if (!dto.token) {
      throw new ProviderError({
        code: 'PARSE',
        providerId: 'vk',
        message: 'ВКонтакте не выдал токен доступа',
      });
    }
    return {
      value: dto.token,
      kind,
      expiresAtMs: dto.expired_at
        ? dto.expired_at * 1000
        : this.now() + FALLBACK_LIFETIME_MS,
    };
  }
}
