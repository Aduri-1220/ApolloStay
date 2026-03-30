const { allowedOrigins, isProduction } = require("./config");

function getRequestOrigin(requestOrResponse) {
  const request = requestOrResponse?.headers ? requestOrResponse : requestOrResponse?.req;
  return String(request?.headers?.origin || "").trim();
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return !isProduction && allowedOrigins.length === 0;
}

function buildCorsHeaders(requestOrResponse) {
  const origin = getRequestOrigin(requestOrResponse);
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-user-id,x-session-token",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };

  if (!origin) {
    return headers;
  }

  if (allowedOrigins.includes(origin)) {
    return {
      ...headers,
      "Access-Control-Allow-Origin": origin
    };
  }

  if (!isProduction && allowedOrigins.length === 0) {
    return {
      ...headers,
      "Access-Control-Allow-Origin": "*"
    };
  }

  return headers;
}

function isRequestOriginAllowed(request) {
  return isOriginAllowed(getRequestOrigin(request));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(response)
  });
  response.end(JSON.stringify(payload));
}

function sendOptions(response) {
  response.writeHead(204, buildCorsHeaders(response));
  response.end();
}

module.exports = {
  buildCorsHeaders,
  isRequestOriginAllowed,
  sendJson,
  sendOptions
};
