const { handleError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { getEndpointsConfig } = require('~/server/services/Config');
const {
  applyRouteToBody,
  isForceModelEnabled,
  isPolicyEnabled,
  requestHasImages,
  selectModelRoute,
} = require('./modelPolicy');

const NO_COMPATIBLE_ROUTE = 'No compatible Taise model route configured';

async function taiseModelPolicyMiddleware(req, res, next) {
  if (!isForceModelEnabled()) {
    return next();
  }

  try {
    const endpointsConfig = await getEndpointsConfig(req);
    const hasImages = requestHasImages(req.body);
    const policyResult = selectModelRoute({
      endpointsConfig,
      hasImages,
    });

    if (!policyResult.selectedRoute) {
      logger.warn('[TaiseModelPolicy] No compatible route found', {
        hasImages,
        skipped: policyResult.skipped,
      });
      return handleError(res, { text: NO_COMPATIBLE_ROUTE });
    }

    req.body = applyRouteToBody(req.body || {}, policyResult.selectedRoute);
    req.taiseModelPolicy = policyResult;

    logger.debug('[TaiseModelPolicy] Selected route', {
      endpoint: policyResult.selectedRoute.endpoint,
      model: policyResult.selectedRoute.model,
      hasImages,
    });

    return next();
  } catch (error) {
    logger.error('[TaiseModelPolicy] Failed to apply model policy', error);
    return handleError(res, { text: NO_COMPATIBLE_ROUTE });
  }
}

function rejectAssistantRouteIfTaiseForced(req, res, next) {
  if (!isPolicyEnabled() || !isForceModelEnabled()) {
    return next();
  }

  return handleError(res, {
    text: 'Taise model policy routes chats through /api/agents/chat',
  });
}

module.exports = {
  NO_COMPATIBLE_ROUTE,
  rejectAssistantRouteIfTaiseForced,
  taiseModelPolicyMiddleware,
};
