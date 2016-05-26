'use strict';

const http = require('http');
const assert = require('assert-plus');
const mime = require('mime');
const Negotatior = require('negotiator');
const URI = require('catberry-uri').URI;
const IncomingMessage = http.IncomingMessage;

const KEEP_ALIVE_REG = /keep-alive/i;

/**
 * creates and sets negotiator on request if one doesn't already exist,
 * then returns it.
 *
 * @private
 * @function negotiator
 * @param    {Object} req the request object
 * @returns  {Object}     a negotiator
 */
function negotiator(req) {
  const h = req.headers;

  if (!req._negotatiator) {
    req._negotiator = new Negotatior({
      headers: {
        accept: h.accept || '*/*',
        'accept-encoding': h['accept-encoding'] ||
        'identity'
      }
    });
  }

  return req._negotiator;
}

/*
 * CUSTOM METHODS
 */

/**
 * builds an absolute URI for the request.
 *
 * @private
 * @function getLocation
 * @returns  {URI}
 */
IncomingMessage.prototype.getLocation = function getLocation() {
  let location;

  try {
    location = new URI(this.url);
  } catch (e) {
    location = new URI();
  }

  location.scheme = this.isSecure() ? 'https://' : 'http://';

  if (this.getHeader('host')) {
    location.authority = location.createAuthority(this.getHeader('host'));
  }

  return location;
};

/**
 * checks if the accept header is present and has the value requested.
 * e.g., req.accepts('html');
 * @public
 * @function accepts
 * @param    {String | Array} types an array of accept type headers
 * @returns  {Boolean}
 */
IncomingMessage.prototype.accepts = function accepts(types) {
  if (typeof (types) === 'string') {
    types = [types];
  }

  types = types.map(t => {
    assert.string(t, 'type');

    if (t.indexOf('/') === -1) {
      t = mime.lookup(t);
    }

    return t;
  });

  negotiator(this);

  return this._negotiator.preferredMediaType(types);
};

/**
 * checks if the request accepts the encoding types.
 * @public
 * @function acceptsEncoding
 * @param    {String | Array} types an array of accept type headers
 * @returns  {Boolean}
 */
IncomingMessage.prototype.acceptsEncoding = function acceptsEncoding(types) {
  if (typeof (types) === 'string') {
    types = [types];
  }

  assert.arrayOfString(types, 'types');

  negotiator(this);

  return this._negotiator.preferredEncoding(types);
};

/**
 * gets the content-length header off the request.
 * @public
 * @function getContentLength
 * @returns {Number}
 */
IncomingMessage.prototype.getContentLength = function getContentLength() {
  if (this._clen !== undefined) {
    return (this._clen === false ? undefined : this._clen);
  }

  // We should not attempt to read and parse the body of an
  // Upgrade request, so force Content-Length to zero:
  if (this.isUpgradeRequest()) {
    return 0;
  }

  const len = this.header('content-length');

  if (!len) {
    this._clen = false;
  } else {
    this._clen = parseInt(len, 10);
  }

  return this._clen === false ? undefined : this._clen;
};

/**
 * gets the content-type header.
 * @public
 * @function getContentType
 * @returns {String}
 */
IncomingMessage.prototype.getContentType = function getContentType() {
  if (this._contentType !== undefined) {
    return (this._contentType);
  }

  let index;
  const type = this.headers['content-type'];

  if (!type) {
    // RFC2616 section 7.2.1
    this._contentType = 'application/octet-stream';
  } else {
    if ((index = type.indexOf(';')) === -1) {
      this._contentType = type;
    } else {
      this._contentType = type.substring(0, index);
    }
  }

  // #877 content-types need to be case insensitive.
  this._contentType = this._contentType.toLowerCase();

  return this._contentType;
};

/**
 * gets the _date property off the request. was created when the request
 * was setup.
 * @private
 * @function getDate
 * @returns  {Date}
 */
IncomingMessage.prototype.getDate = function getDate() {
  if (this._date !== undefined) {
    return (this._date);
  }

  this._date = new Date(this._time);
  return this._date;
};

/**
 * returns ms since epoch when request was setup.
 * @public
 * @function getTime
 * @returns  {Number}
 */
IncomingMessage.prototype.getTime = function getTime() {
  return this._time;
};

/**
 * returns any header off the request. also, 'correct' any
 * correctly spelled 'referrer' header to the actual spelling used.
 * @public
 * @function getHeader
 * @param    {String} name  the name of the header
 * @param    {String} value default value if header isn't found on the req
 * @returns  {String}
 */
IncomingMessage.prototype.getHeader = function getHeader(name, value) {
  assert.string(name, 'name');

  name = name.toLowerCase();

  if (name === 'referer' || name === 'referrer') {
    name = 'referer';
  }

  return this.headers[name] || value;
};

/**
 * returns any trailer header off the request. also, 'correct' any
 * correctly spelled 'referrer' header to the actual spelling used.
 * @public
 * @function getTrailer
 * @param    {String} name  the name of the header
 * @param    {String} value default value if header isn't found on the req
 * @returns  {String}
 */
IncomingMessage.prototype.getTrailer = function getTrailer(name, value) {
  assert.string(name, 'name');
  name = name.toLowerCase();

  if (name === 'referer' || name === 'referrer') {
    name = 'referer';
  }

  return (this.trailers || {})[name] || value;
};

/**
 * Check if the incoming request contains the Content-Type header field, and
 * if it contains the given mime type.
 * @public
 * @function is
 * @param    {String} type  a content-type header value
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isContentType = function isContentType(type) {
  assert.string(type, 'type');

  let contentType = this.getContentType();
  let matches = true;

  if (!contentType) {
    return false;
  }

  if (type.indexOf('/') === -1) {
    type = mime.lookup(type);
  }

  if (type.indexOf('*') !== -1) {
    type = type.split('/');
    contentType = contentType.split('/');
    matches &= (type[0] === '*' || type[0] === contentType[0]);
    matches &= (type[1] === '*' || type[1] === contentType[1]);
  } else {
    matches = contentType === type;
  }

  return matches;
};

/**
 * Check if the incoming request is chunked.
 * @public
 * @function isChunked
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isChunked = function isChunked() {
  return this.headers['transfer-encoding'] === 'chunked';
};

/**
 * Check if the incoming request is kept alive.
 *
 * @public
 * @function isKeepAlive
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isKeepAlive = function isKeepAlive() {
  if (this._keepAlive !== undefined) {
    return this._keepAlive;
  }

  if (this.headers.connection) {
    this._keepAlive = KEEP_ALIVE_REG.test(this.headers.connection);
  } else {
    this._keepAlive = this.httpVersion === '1.0' ? false : true;
  }

  return this._keepAlive;
};

/**
 * Check if the incoming request is encrypted.
 * @public
 * @function isSecure
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isSecure = function isSecure() {
  if (this._secure !== undefined) {
    return this._secure;
  }

  this._secure = Boolean(this.connection.encrypted);
  return this._secure;
};

/**
 * Check if the incoming request has been upgraded.
 * @public
 * @function isUpgradeRequest
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isUpgradeRequest = function isUpgradeRequest() {
  if (this._upgradeRequest !== undefined) {
    return this._upgradeRequest;
  }

  return false;
};

/**
 * Check if the incoming request is an upload verb.
 * @public
 * @function isUpload
 * @returns  {Boolean}
 */
IncomingMessage.prototype.isUpload = function isUpload() {
  const m = this.method;

  return m === 'PATCH' || m === 'POST' || m === 'PUT';
};

/**
 * toString serialization
 * @public
 * @function toString
 * @returns  {String}
 */
IncomingMessage.prototype.toString = function toString() {
  let headers = '';

  Object.keys(this.headers).forEach(k => (
    headers += `${k}: ${this.headers[k]}\n`
  ));

  return `${this.method} ${this.url} HTTP/${this.httpVersion}\n${headers}`;
};

/**
 * retrieves the user-agent header.
 * @public
 * @function getUserAgent
 * @returns  {String}
 */
IncomingMessage.prototype.getUserAgent = function getUserAgent() {
  return this.headers['user-agent'];
};

module.exports = IncomingMessage;