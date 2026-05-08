const mockGetEndpointsConfig = jest.fn();
const mockLoadDefaultModels = jest.fn();
const mockLoadConfigModels = jest.fn();

jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: mockGetEndpointsConfig,
  loadDefaultModels: mockLoadDefaultModels,
  loadConfigModels: mockLoadConfigModels,
}));

jest.mock('~/server/services/Endpoints/agents', () => ({
  buildOptions: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  applyRouteToBody,
  filterEndpointsConfig,
  filterModelsConfig,
  getStaticModelsConfig,
  parseModelFallbacks,
  requestHasImages,
  selectModelRoute,
} = require('./modelPolicy');
const { createInitializeClientWithFallback, sendMessageWithFallback } = require('./fallback');
const { loadModels } = require('~/server/controllers/ModelController');
const { taiseModelPolicyMiddleware } = require('./middleware');

const withEnv = async (env, callback) => {
  const originalEnv = { ...process.env };

  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, originalEnv, env);

  try {
    return await callback();
  } finally {
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  }
};

describe('Taise model policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEndpointsConfig.mockResolvedValue({
      [EModelEndpoint.openAI]: { userProvide: false },
      [EModelEndpoint.anthropic]: { userProvide: false },
      [EModelEndpoint.google]: { userProvide: false },
    });
    mockLoadDefaultModels.mockResolvedValue({
      [EModelEndpoint.openAI]: ['gpt-4o'],
    });
    mockLoadConfigModels.mockResolvedValue({
      OpenRouter: ['meta-llama/llama-3-70b-instruct'],
    });
  });

  it('parses configured fallback routes and ignores invalid entries', () => {
    expect(
      parseModelFallbacks(
        'openAI:gpt-5-mini,invalid:model,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite,openAI:gpt-5-mini',
      ),
    ).toEqual([
      { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
      { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
      { endpoint: EModelEndpoint.google, model: 'gemini-2.5-flash-lite' },
    ]);
  });

  it('builds static model availability from Taise fallbacks', () => {
    expect(
      getStaticModelsConfig({
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite,openAI:gpt-5-mini',
      }),
    ).toEqual({
      [EModelEndpoint.openAI]: ['gpt-5-mini'],
      [EModelEndpoint.anthropic]: ['claude-3-5-haiku-20241022'],
      [EModelEndpoint.google]: ['gemini-2.5-flash-lite'],
    });
  });

  it('uses system provider keys from env instead of user-provided endpoint credentials', () =>
    withEnv(
      {
        OPENAI_API_KEY: 'sk-taise-dummy-system-key',
        ANTHROPIC_API_KEY: 'sk-ant-taise-dummy-system-key',
        GOOGLE_KEY: 'AIzaTaiseDummySystemKey',
      },
      async () => {
        jest.resetModules();

        const { config } = require('~/server/services/Config/EndpointService');
        const loadAsyncEndpoints = require('~/server/services/Config/loadAsyncEndpoints');

        expect(config.openAIApiKey).toBe('sk-taise-dummy-system-key');
        expect(config.googleKey).toBe('AIzaTaiseDummySystemKey');
        expect(config.userProvidedOpenAI).toBe(false);
        expect(config[EModelEndpoint.openAI]).toEqual(
          expect.objectContaining({ userProvide: false }),
        );
        expect(config[EModelEndpoint.anthropic]).toEqual(
          expect.objectContaining({ userProvide: false }),
        );
        await expect(loadAsyncEndpoints()).resolves.toMatchObject({
          google: { userProvide: false },
        });

        jest.resetModules();
      },
    ));

  it('rejects provider env values that are explicitly user_provided', () =>
    withEnv(
      {
        OPENAI_API_KEY: 'user_provided',
        ANTHROPIC_API_KEY: 'user_provided',
        GOOGLE_KEY: 'user_provided',
      },
      async () => {
        jest.resetModules();

        const { config } = require('~/server/services/Config/EndpointService');
        const loadAsyncEndpoints = require('~/server/services/Config/loadAsyncEndpoints');

        expect(config.userProvidedOpenAI).toBe(true);
        expect(config[EModelEndpoint.openAI]).toEqual(
          expect.objectContaining({ userProvide: true }),
        );
        expect(config[EModelEndpoint.anthropic]).toEqual(
          expect.objectContaining({ userProvide: true }),
        );
        await expect(loadAsyncEndpoints()).resolves.toMatchObject({
          google: { userProvide: true },
        });

        jest.resetModules();
      },
    ));

  it('selects the first usable configured provider and skips user-provided keys', () => {
    const result = selectModelRoute({
      env: {
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
      },
      endpointsConfig: {
        [EModelEndpoint.openAI]: { userProvide: true },
        [EModelEndpoint.anthropic]: { userProvide: false },
        [EModelEndpoint.google]: { userProvide: false },
      },
      modelsConfig: {
        [EModelEndpoint.openAI]: ['gpt-5-mini'],
        [EModelEndpoint.anthropic]: ['claude-3-5-haiku-20241022'],
        [EModelEndpoint.google]: ['gemini-2.5-flash-lite'],
      },
    });

    expect(result.selectedRoute).toEqual({
      endpoint: EModelEndpoint.anthropic,
      model: 'claude-3-5-haiku-20241022',
    });
    expect(result.usableRoutes).toEqual([
      { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
      { endpoint: EModelEndpoint.google, model: 'gemini-2.5-flash-lite' },
    ]);
    expect(result.skipped[0]).toEqual({
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-5-mini',
      reason: 'endpoint_not_configured',
    });
  });

  it('selects routes using static Taise fallback models without dynamic model lists', () => {
    const result = selectModelRoute({
      env: {
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
      },
      endpointsConfig: {
        [EModelEndpoint.openAI]: { userProvide: false },
        [EModelEndpoint.anthropic]: { userProvide: false },
        [EModelEndpoint.google]: { userProvide: false },
      },
      modelsConfig: {},
    });

    expect(result.selectedRoute).toEqual({
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-5-mini',
    });
    expect(result.skipped).toEqual([]);
  });

  it('uses the same fallback list for image chats and rejects incompatible routes', () => {
    const result = selectModelRoute({
      env: {
        TAISE_MODEL_FALLBACKS: 'openAI:text-embedding-3-large,google:gemini-2.5-flash-lite',
      },
      hasImages: true,
      endpointsConfig: {
        [EModelEndpoint.openAI]: { userProvide: false },
        [EModelEndpoint.google]: { userProvide: false },
      },
      modelsConfig: {
        [EModelEndpoint.openAI]: ['text-embedding-3-large'],
        [EModelEndpoint.google]: ['gemini-2.5-flash-lite'],
      },
    });

    expect(result.selectedRoute).toEqual({
      endpoint: EModelEndpoint.google,
      model: 'gemini-2.5-flash-lite',
    });
    expect(result.skipped).toEqual([
      {
        endpoint: EModelEndpoint.openAI,
        model: 'text-embedding-3-large',
        reason: 'image_input_not_supported',
      },
    ]);
  });

  it('returns no selection when an image request has no compatible route', () => {
    const result = selectModelRoute({
      env: {
        TAISE_MODEL_FALLBACKS: 'openAI:text-embedding-3-large',
      },
      hasImages: true,
      endpointsConfig: {
        [EModelEndpoint.openAI]: { userProvide: false },
      },
      modelsConfig: {
        [EModelEndpoint.openAI]: ['text-embedding-3-large'],
      },
    });

    expect(result.selectedRoute).toBeNull();
    expect(result.usableRoutes).toEqual([]);
    expect(result.skipped).toEqual([
      {
        endpoint: EModelEndpoint.openAI,
        model: 'text-embedding-3-large',
        reason: 'image_input_not_supported',
      },
    ]);
  });

  it('detects image requests from attached files and message content', () => {
    expect(requestHasImages({ files: [{ type: 'image/png' }] })).toBe(true);
    expect(
      requestHasImages({
        messages: [
          { content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,a' } }] },
        ],
      }),
    ).toBe(true);
    expect(requestHasImages({ files: [{ type: 'application/pdf' }] })).toBe(false);
  });

  it('rewrites stale client endpoint and model choices to the selected Taise route', () => {
    const body = {
      endpoint: EModelEndpoint.google,
      endpointType: 'custom',
      model: 'stale-model',
      spec: 'old-spec',
      agent_id: 'agent-123',
      assistant_id: 'assistant-123',
      files: [{ type: 'image/png' }],
    };

    applyRouteToBody(
      body,
      { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
      { TAISE_MODEL_LABEL: 'TAISE' },
    );

    expect(body).toMatchObject({
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-5-mini',
      modelLabel: 'TAISE',
      files: [{ type: 'image/png' }],
    });
    expect(body.endpointType).toBeUndefined();
    expect(body.spec).toBeUndefined();
    expect(body.agent_id).toBeUndefined();
    expect(body.assistant_id).toBeUndefined();
  });

  it('filters exposed endpoints and models to configured Taise routes', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
      },
      async () => {
        expect(
          filterEndpointsConfig({
            [EModelEndpoint.openAI]: { userProvide: true, order: 0 },
            [EModelEndpoint.anthropic]: { userProvide: false, order: 1 },
            [EModelEndpoint.google]: { userProvide: false, order: 2 },
          }),
        ).toEqual({
          [EModelEndpoint.anthropic]: { userProvide: false, order: 1 },
          [EModelEndpoint.google]: { userProvide: false, order: 2 },
        });

        expect(
          filterModelsConfig({
            [EModelEndpoint.openAI]: ['gpt-4o'],
            OpenRouter: ['meta-llama/llama-3-70b-instruct'],
          }),
        ).toEqual({
          [EModelEndpoint.openAI]: ['gpt-5-mini'],
          [EModelEndpoint.anthropic]: ['claude-3-5-haiku-20241022'],
          [EModelEndpoint.google]: ['gemini-2.5-flash-lite'],
        });
      },
    ));

  it('returns static Taise models without fetching provider or custom endpoint models', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
      },
      async () => {
        await expect(loadModels({ user: { id: 'user-1' } })).resolves.toEqual({
          [EModelEndpoint.openAI]: ['gpt-5-mini'],
          [EModelEndpoint.anthropic]: ['claude-3-5-haiku-20241022'],
          [EModelEndpoint.google]: ['gemini-2.5-flash-lite'],
        });
        expect(mockLoadDefaultModels).not.toHaveBeenCalled();
        expect(mockLoadConfigModels).not.toHaveBeenCalled();
      },
    ));

  it('applies Taise middleware using endpoint config only', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_FORCE_MODEL: 'true',
        TAISE_MODEL_FALLBACKS:
          'openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
      },
      async () => {
        const req = {
          body: {
            endpoint: EModelEndpoint.google,
            model: 'stale-client-model',
          },
        };
        const next = jest.fn();

        await taiseModelPolicyMiddleware(req, {}, next);

        expect(mockGetEndpointsConfig).toHaveBeenCalledTimes(1);
        expect(mockLoadDefaultModels).not.toHaveBeenCalled();
        expect(mockLoadConfigModels).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.body).toMatchObject({
          endpoint: EModelEndpoint.openAI,
          model: 'gpt-5-mini',
        });
      },
    ));

  it('keeps the LibreChat YAML picker control disabled for Taise', () => {
    const configPath = path.resolve(__dirname, '../../../../librechat.example.yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

    expect(config.interface.modelSelect).toBe(false);
    expect(config.interface.parameters).toBe(false);
    expect(config.interface.presets).toBe(false);
  });

  it('documents cheap multi-provider fallbacks and dummy system keys in .env.example', () => {
    const envPath = path.resolve(__dirname, '../../../../.env.example');
    const envExample = fs.readFileSync(envPath, 'utf8');

    expect(envExample).toContain(
      'TAISE_MODEL_FALLBACKS=openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite',
    );
    expect(envExample).toContain('OPENAI_API_KEY=sk-taise-dummy-system-key');
    expect(envExample).toContain('ANTHROPIC_API_KEY=sk-ant-taise-dummy-system-key');
    expect(envExample).toContain('GOOGLE_KEY=AIzaTaiseDummySystemKey');
    expect(envExample).not.toContain('OPENAI_API_KEY=user_provided');
    expect(envExample).not.toContain('ANTHROPIC_API_KEY=user_provided');
    expect(envExample).not.toContain('GOOGLE_KEY=user_provided');
  });
});

describe('Taise initialization fallback', () => {
  it('retries the next usable route when initialization fails before streaming', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_FORCE_MODEL: 'true',
      },
      async () => {
        const initializeClient = jest
          .fn()
          .mockRejectedValueOnce(new Error('openai unavailable'))
          .mockResolvedValueOnce({ client: 'anthropic-client' });
        const buildEndpointOptionForRoute = jest
          .fn()
          .mockResolvedValue({ endpoint: EModelEndpoint.anthropic });
        const log = { warn: jest.fn() };
        const req = {
          body: { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
          taiseModelPolicy: {
            usableRoutes: [
              { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
              { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
            ],
          },
        };
        const params = {
          req,
          res: {},
          endpointOption: { endpoint: EModelEndpoint.openAI },
          signal: { aborted: false },
        };
        const initialize = createInitializeClientWithFallback(initializeClient, {
          buildEndpointOptionForRoute,
          logger: log,
        });

        await expect(initialize(params)).resolves.toEqual({ client: 'anthropic-client' });

        expect(buildEndpointOptionForRoute).toHaveBeenCalledWith({
          req,
          res: params.res,
          route: { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
        });
        expect(initializeClient).toHaveBeenCalledTimes(2);
        expect(initializeClient.mock.calls[1][0].endpointOption).toEqual({
          endpoint: EModelEndpoint.anthropic,
        });
        expect(initializeClient.mock.calls[1][0].endpointOption).toBe(params.endpointOption);
        expect(params.endpointOption).toEqual({ endpoint: EModelEndpoint.anthropic });
        expect(req.body.endpoint).toBe(EModelEndpoint.anthropic);
        expect(req.body.model).toBe('claude-3-5-haiku-20241022');
      },
    ));

  it('does not retry an aborted initialization', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_FORCE_MODEL: 'true',
      },
      async () => {
        const abortError = new Error('request aborted');
        const initializeClient = jest.fn().mockRejectedValue(abortError);
        const buildEndpointOptionForRoute = jest.fn();
        const initialize = createInitializeClientWithFallback(initializeClient, {
          buildEndpointOptionForRoute,
          logger: { warn: jest.fn() },
        });

        await expect(
          initialize({
            req: {
              body: { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
              taiseModelPolicy: {
                usableRoutes: [
                  { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
                  { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
                ],
              },
            },
            res: {},
            endpointOption: { endpoint: EModelEndpoint.openAI },
            signal: { aborted: true },
          }),
        ).rejects.toBe(abortError);
        expect(buildEndpointOptionForRoute).not.toHaveBeenCalled();
      },
    ));

  it('retries provider calls that fail before streaming starts', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_FORCE_MODEL: 'true',
      },
      async () => {
        const firstClient = {
          sender: 'openai',
          contentParts: [],
          sendMessage: jest.fn().mockRejectedValue(new Error('provider unavailable')),
        };
        const secondClient = {
          sender: 'anthropic',
          contentParts: ['next'],
          sendMessage: jest.fn().mockResolvedValue({ messageId: 'response-1' }),
        };
        const initializeClient = jest.fn().mockResolvedValue({
          client: secondClient,
          userMCPAuthMap: { anthropic: { token: 'ok' } },
        });
        const buildEndpointOptionForRoute = jest
          .fn()
          .mockResolvedValue({ endpoint: EModelEndpoint.anthropic });
        const onClientChange = jest.fn();
        const req = {
          body: { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
          taiseModelPolicy: {
            activeRouteIndex: 0,
            usableRoutes: [
              { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
              { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
            ],
          },
        };
        const endpointOption = { endpoint: EModelEndpoint.openAI };
        const messageOptions = { onStart: jest.fn(), userMCPAuthMap: { openai: {} } };

        const result = await sendMessageWithFallback(
          {
            req,
            res: {},
            text: 'hello',
            signal: { aborted: false },
            client: firstClient,
            endpointOption,
            messageOptions,
            initializeClient,
            onClientChange,
          },
          {
            buildEndpointOptionForRoute,
            logger: { warn: jest.fn() },
          },
        );

        expect(result.response).toEqual({ messageId: 'response-1' });
        expect(result.client).toBe(secondClient);
        expect(result.endpointOption).toBe(endpointOption);
        expect(endpointOption).toEqual({ endpoint: EModelEndpoint.anthropic });
        expect(secondClient.sendMessage).toHaveBeenCalledWith(
          'hello',
          expect.objectContaining({
            userMCPAuthMap: { anthropic: { token: 'ok' } },
          }),
        );
        expect(onClientChange).toHaveBeenCalledWith(
          secondClient,
          endpointOption,
          expect.objectContaining({ client: secondClient }),
        );
      },
    ));

  it('does not retry provider calls after streaming has started', () =>
    withEnv(
      {
        TAISE_MODEL_POLICY_ENABLED: 'true',
        TAISE_FORCE_MODEL: 'true',
      },
      async () => {
        const streamedError = new Error('stream failed');
        const firstClient = {
          sendMessage: jest.fn(async (_text, options) => {
            options.onStart();
            throw streamedError;
          }),
        };
        const initializeClient = jest.fn();
        const req = {
          body: { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
          taiseModelPolicy: {
            activeRouteIndex: 0,
            usableRoutes: [
              { endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' },
              { endpoint: EModelEndpoint.anthropic, model: 'claude-3-5-haiku-20241022' },
            ],
          },
        };

        await expect(
          sendMessageWithFallback(
            {
              req,
              res: {},
              text: 'hello',
              signal: { aborted: false },
              client: firstClient,
              endpointOption: { endpoint: EModelEndpoint.openAI },
              messageOptions: { onStart: jest.fn() },
              initializeClient,
            },
            {
              buildEndpointOptionForRoute: jest.fn(),
              logger: { warn: jest.fn() },
            },
          ),
        ).rejects.toBe(streamedError);
        expect(initializeClient).not.toHaveBeenCalled();
      },
    ));
});
