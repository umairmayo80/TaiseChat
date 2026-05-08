const { getEndpointsConfig } = require('~/server/services/Config');
const { filterEndpointsConfig } = require('~/server/services/Taise/modelPolicy');

async function endpointController(req, res) {
  const endpointsConfig = await getEndpointsConfig(req);
  res.send(JSON.stringify(filterEndpointsConfig(endpointsConfig)));
}

module.exports = endpointController;
