const { logger } = require('@librechat/data-schemas');
const { parseCompactConvo, getDefaultParamsEndpoint } = require('librechat-data-provider');
const { getEndpointsConfig } = require('~/server/services/Config');
const agents = require('~/server/services/Endpoints/agents');
const { disposeClient } = require('~/server/cleanup');
const { applyRouteToBody, isForceModelEnabled } = require('./modelPolicy');

async function buildEndpointOptionForRoute({ req, route }) {
  applyRouteToBody(req.body || {}, route);

  const endpointsConfig = await getEndpointsConfig(req);
  const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, route.endpoint);
  const parsedBody = parseCompactConvo({
    endpoint: route.endpoint,
    endpointType: undefined,
    conversation: req.body,
    defaultParamsEndpoint,
  });

  return agents.buildOptions(req, route.endpoint, parsedBody, undefined);
}

function shouldRetryTaiseInitialization(error, signal) {
  if (signal?.aborted) {
    return false;
  }

  const message = String(error?.message ?? '').toLowerCase();
  return !message.includes('abort') && !message.includes('cancel');
}

function replaceEndpointOptionReference(currentEndpointOption, nextEndpointOption) {
  if (
    !currentEndpointOption ||
    typeof currentEndpointOption !== 'object' ||
    Array.isArray(currentEndpointOption)
  ) {
    return nextEndpointOption;
  }

  Object.keys(currentEndpointOption).forEach((key) => {
    delete currentEndpointOption[key];
  });
  Object.assign(currentEndpointOption, nextEndpointOption);

  return currentEndpointOption;
}

function createInitializeClientWithFallback(initializeClient, dependencies = {}) {
  const buildEndpointOption =
    dependencies.buildEndpointOptionForRoute ?? buildEndpointOptionForRoute;
  const log = dependencies.logger ?? logger;

  return async function initializeClientWithTaiseFallback(params) {
    const policy = params.req?.taiseModelPolicy;
    const usableRoutes = policy?.usableRoutes ?? [];

    if (!isForceModelEnabled() || usableRoutes.length <= 1) {
      return initializeClient(params);
    }

    let lastError;

    for (let index = 0; index < usableRoutes.length; index++) {
      const route = usableRoutes[index];

      try {
        if (index === 0) {
          return await initializeClient(params);
        }

        applyRouteToBody(params.req.body || {}, route);
        const builtEndpointOption = await buildEndpointOption({
          req: params.req,
          res: params.res,
          route,
        });
        const endpointOption = replaceEndpointOptionReference(
          params.endpointOption,
          builtEndpointOption,
        );
        params.req.body.endpointOption = endpointOption;

        log.warn('[TaiseModelPolicy] Retrying chat initialization with fallback route', {
          endpoint: route.endpoint,
          model: route.model,
        });

        const result = await initializeClient({
          ...params,
          endpointOption,
        });
        policy.activeRouteIndex = index;
        return result;
      } catch (error) {
        lastError = error;

        log.warn('[TaiseModelPolicy] Chat initialization route failed', {
          endpoint: route.endpoint,
          model: route.model,
          error: error?.message ?? error,
        });

        if (!shouldRetryTaiseInitialization(error, params.signal)) {
          throw error;
        }
      }
    }

    throw lastError;
  };
}

function withStartTracking(messageOptions = {}, onStart) {
  return {
    ...messageOptions,
    onStart: (...args) => {
      onStart();
      return messageOptions.onStart?.(...args);
    },
  };
}

async function initializeFallbackRoute({
  req,
  res,
  route,
  signal,
  endpointOption,
  initializeClient,
  buildEndpointOption,
}) {
  applyRouteToBody(req.body || {}, route);
  const builtEndpointOption = await buildEndpointOption({ req, res, route });
  const nextEndpointOption = replaceEndpointOptionReference(endpointOption, builtEndpointOption);
  req.body.endpointOption = nextEndpointOption;

  const result = await initializeClient({
    req,
    res,
    signal,
    endpointOption: nextEndpointOption,
  });

  return {
    ...result,
    endpointOption: nextEndpointOption,
  };
}

async function sendMessageWithFallback(params, dependencies = {}) {
  const {
    req,
    res,
    text,
    signal,
    client,
    messageOptions,
    endpointOption,
    initializeClient,
    onClientChange,
  } = params;
  const policy = req?.taiseModelPolicy;
  const usableRoutes = policy?.usableRoutes ?? [];

  if (!isForceModelEnabled() || usableRoutes.length <= 1) {
    return {
      client,
      endpointOption,
      response: await client.sendMessage(text, messageOptions),
    };
  }

  const buildEndpointOption =
    dependencies.buildEndpointOptionForRoute ?? buildEndpointOptionForRoute;
  const log = dependencies.logger ?? logger;
  const dispose = dependencies.disposeClient ?? disposeClient;
  const startingIndex = policy.activeRouteIndex ?? 0;
  let activeClient = client;
  let activeEndpointOption = endpointOption;
  let activeMessageOptions = messageOptions;
  let lastError;

  for (let index = startingIndex; index < usableRoutes.length; index++) {
    const route = usableRoutes[index];
    let streamStarted = false;

    try {
      if (index !== startingIndex) {
        log.warn('[TaiseModelPolicy] Retrying chat provider call with fallback route', {
          endpoint: route.endpoint,
          model: route.model,
        });

        const result = await initializeFallbackRoute({
          req,
          res,
          route,
          signal,
          endpointOption: activeEndpointOption,
          initializeClient,
          buildEndpointOption,
        });

        const previousClient = activeClient;
        activeClient = result.client;
        activeEndpointOption = result.endpointOption;
        activeMessageOptions = {
          ...(messageOptions ?? {}),
          userMCPAuthMap: result.userMCPAuthMap ?? messageOptions?.userMCPAuthMap,
        };
        policy.activeRouteIndex = index;
        dispose(previousClient);
        onClientChange?.(activeClient, activeEndpointOption, result);
      }

      const trackedMessageOptions = withStartTracking(activeMessageOptions, () => {
        streamStarted = true;
      });

      const response = await activeClient.sendMessage(text, trackedMessageOptions);
      return {
        client: activeClient,
        endpointOption: activeEndpointOption,
        response,
      };
    } catch (error) {
      lastError = error;

      log.warn('[TaiseModelPolicy] Chat provider call route failed', {
        endpoint: route.endpoint,
        model: route.model,
        error: error?.message ?? error,
      });

      if (streamStarted || !shouldRetryTaiseInitialization(error, signal)) {
        throw error;
      }
    }
  }

  throw lastError;
}

module.exports = {
  buildEndpointOptionForRoute,
  createInitializeClientWithFallback,
  replaceEndpointOptionReference,
  sendMessageWithFallback,
  shouldRetryTaiseInitialization,
};
