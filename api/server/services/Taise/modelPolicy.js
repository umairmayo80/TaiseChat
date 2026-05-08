const { EModelEndpoint } = require('librechat-data-provider');

const DEFAULT_MODEL_LABEL = 'TAISE';
const DEFAULT_FALLBACKS = Object.freeze([
  Object.freeze({ endpoint: EModelEndpoint.openAI, model: 'gpt-5-mini' }),
]);

const SUPPORTED_ENDPOINTS = new Set([
  EModelEndpoint.openAI,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
]);

const IMAGE_INPUT_ENDPOINTS = new Set([
  EModelEndpoint.openAI,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
]);

const FALSE_VALUES = new Set(['false', '0', 'no', 'off', 'disabled']);
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on', 'enabled']);

const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]*$/;
const TEXT_ONLY_MODEL_PATTERNS = [
  /embedding/i,
  /moderation/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /image/i,
  /realtime/i,
  /audio/i,
];

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
}

function isPolicyEnabled(env = process.env) {
  return parseBoolean(env.TAISE_MODEL_POLICY_ENABLED, false);
}

function isForceModelEnabled(env = process.env) {
  if (!isPolicyEnabled(env)) {
    return false;
  }

  return parseBoolean(env.TAISE_FORCE_MODEL, true);
}

function getModelLabel(env = process.env) {
  const label = env.TAISE_MODEL_LABEL?.trim();
  return label || DEFAULT_MODEL_LABEL;
}

function normalizeRoute(endpoint, model) {
  const normalizedEndpoint = endpoint?.trim();
  const normalizedModel = model?.trim();

  if (!SUPPORTED_ENDPOINTS.has(normalizedEndpoint)) {
    return null;
  }

  if (!normalizedModel || !MODEL_PATTERN.test(normalizedModel)) {
    return null;
  }

  return { endpoint: normalizedEndpoint, model: normalizedModel };
}

function parseModelFallbacks(value) {
  if (!value || typeof value !== 'string') {
    return [...DEFAULT_FALLBACKS];
  }

  const routes = [];
  const seen = new Set();

  for (const rawEntry of value.split(',')) {
    const entry = rawEntry.trim();
    const separatorIndex = entry.indexOf(':');

    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      continue;
    }

    const route = normalizeRoute(entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1));
    if (!route) {
      continue;
    }

    const key = `${route.endpoint}:${route.model}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    routes.push(route);
  }

  return routes.length ? routes : [...DEFAULT_FALLBACKS];
}

function getModelFallbacks(env = process.env) {
  return parseModelFallbacks(env.TAISE_MODEL_FALLBACKS);
}

function routeSupportsImageInput(route) {
  if (!IMAGE_INPUT_ENDPOINTS.has(route?.endpoint)) {
    return false;
  }

  return !TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(route.model));
}

function isImageFile(file) {
  if (!file || typeof file !== 'object') {
    return false;
  }

  const type =
    file.type ??
    file.mimeType ??
    file.mimetype ??
    file.filetype ??
    file.file_type ??
    file.metadata?.mimeType;

  if (typeof type === 'string' && type.toLowerCase().startsWith('image/')) {
    return true;
  }

  return Boolean(file.width && file.height);
}

function messageContentHasImages(content) {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (!part || typeof part !== 'object') {
      return false;
    }

    if (part.type === 'image_url' || part.type === 'input_image' || part.type === 'image') {
      return true;
    }

    return Boolean(
      part.image_url || part.input_image || part.source?.media_type?.startsWith?.('image/'),
    );
  });
}

function requestHasImages(body = {}) {
  if (Array.isArray(body.image_urls) && body.image_urls.length > 0) {
    return true;
  }

  if (Array.isArray(body.files) && body.files.some(isImageFile)) {
    return true;
  }

  if (messageContentHasImages(body.content)) {
    return true;
  }

  if (Array.isArray(body.messages)) {
    return body.messages.some((message) => messageContentHasImages(message?.content));
  }

  return false;
}

function isEndpointConfigured(endpoint, endpointsConfig = {}) {
  const endpointConfig = endpointsConfig?.[endpoint];

  if (!endpointConfig) {
    return false;
  }

  if (endpointConfig.userProvide === true || endpointConfig.userProvideURL === true) {
    return false;
  }

  return true;
}

function isModelAvailable(route, modelsConfig = {}) {
  const availableModels = modelsConfig?.[route.endpoint];
  return Array.isArray(availableModels) && availableModels.includes(route.model);
}

function getRouteSkipReason({ route, endpointsConfig, modelsConfig, hasImages }) {
  if (!isEndpointConfigured(route.endpoint, endpointsConfig)) {
    return 'endpoint_not_configured';
  }

  if (!isModelAvailable(route, modelsConfig)) {
    return 'model_not_available';
  }

  if (hasImages && !routeSupportsImageInput(route)) {
    return 'image_input_not_supported';
  }

  return null;
}

function selectModelRoute({ endpointsConfig, modelsConfig, env = process.env, hasImages = false }) {
  const fallbacks = getModelFallbacks(env);
  const skipped = [];
  const usableRoutes = [];

  for (const route of fallbacks) {
    const reason = getRouteSkipReason({ route, endpointsConfig, modelsConfig, hasImages });
    if (reason) {
      skipped.push({ ...route, reason });
      continue;
    }

    usableRoutes.push(route);
  }

  return {
    selectedRoute: usableRoutes[0] ?? null,
    usableRoutes,
    skipped,
    hasImages,
  };
}

function applyRouteToBody(body = {}, route, env = process.env) {
  body.endpoint = route.endpoint;
  body.model = route.model;
  body.modelLabel = getModelLabel(env);

  delete body.endpointType;
  delete body.spec;
  delete body.agent_id;
  delete body.assistant_id;
  delete body.iconURL;
  delete body.endpointOption;

  return body;
}

function filterModelsConfig(modelsConfig = {}, env = process.env) {
  if (!isPolicyEnabled(env)) {
    return modelsConfig;
  }

  const result = {};
  const fallbackRoutes = getModelFallbacks(env);

  for (const route of fallbackRoutes) {
    const availableModels = modelsConfig?.[route.endpoint];
    if (!Array.isArray(availableModels) || !availableModels.includes(route.model)) {
      continue;
    }

    result[route.endpoint] = [...new Set([...(result[route.endpoint] ?? []), route.model])];
  }

  return result;
}

function filterEndpointsConfig(endpointsConfig = {}, env = process.env) {
  if (!isPolicyEnabled(env)) {
    return endpointsConfig;
  }

  const result = {};
  const fallbackRoutes = getModelFallbacks(env);

  fallbackRoutes.forEach((route, index) => {
    if (!isEndpointConfigured(route.endpoint, endpointsConfig)) {
      return;
    }

    if (result[route.endpoint]) {
      return;
    }

    result[route.endpoint] = {
      ...endpointsConfig[route.endpoint],
      order: index,
    };
  });

  return result;
}

module.exports = {
  DEFAULT_FALLBACKS,
  DEFAULT_MODEL_LABEL,
  IMAGE_INPUT_ENDPOINTS,
  SUPPORTED_ENDPOINTS,
  applyRouteToBody,
  filterEndpointsConfig,
  filterModelsConfig,
  getModelFallbacks,
  getModelLabel,
  isEndpointConfigured,
  isForceModelEnabled,
  isModelAvailable,
  isPolicyEnabled,
  parseBoolean,
  parseModelFallbacks,
  requestHasImages,
  routeSupportsImageInput,
  selectModelRoute,
};
