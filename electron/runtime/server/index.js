// @bun
// server/index.ts
import { execFile as execFile4 } from "child_process";
import { homedir as homedir2 } from "os";
import { join as join5 } from "path";
import { promisify as promisify4 } from "util";

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || undefined;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== undefined) {
    if (Array.isArray(form[key])) {
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match, index) => {
    const mark = `@${index}`;
    groups.push([mark, match]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1;i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1;j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match[1], new RegExp(`^${match[2]}(?=/${next})`)] : [label, match[1], new RegExp(`^${match[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
      try {
        return decoder(match);
      } catch {
        return match;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (;i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? undefined : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? undefined : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? undefined : nextKeyIndex : valueIndex);
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? undefined : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== undefined) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? undefined;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw[key]();
  };
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  text() {
    return this.#cachedBody("text");
  }
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  blob() {
    return this.#cachedBody("blob");
  }
  formData() {
    return this.#cachedBody("formData");
  }
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  get url() {
    return this.raw.url;
  }
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  env = {};
  #var;
  finalized = false;
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers
    });
  }
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  setLayout = (layout) => this.#layout = layout;
  getLayout = () => this.#layout;
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers;
    if (value === undefined) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map;
    this.#var.set(key, value);
  };
  get = (key) => {
    return this.#var ? this.#var.get(key) : undefined;
  };
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers;
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  route(path, app) {
    const subApp = this.basePath(path);
    app.routes.map((r) => {
      let handler;
      if (app.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = undefined;
      try {
        executionContext = c.executionCtx;
      } catch {}
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, undefined, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== undefined) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some((k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR)) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node;
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some((k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR)) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node;
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node;
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0;; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1;i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1;j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== undefined) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== undefined) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(path === "*" ? "" : `^${path.replace(/\/\*$|([.\\+*[^\]$()])/g, (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)")}$`);
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie;
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map((route) => [!/\*|\/:/.test(route[0]), ...route]).sort(([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length);
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length;i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (;paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length;i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length;j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length;k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach((p) => re.test(p) && routes[m][p].push([handler, paramCount]));
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length;i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = undefined;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]]));
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/reg-exp-router/prepared-router.js
var PreparedRegExpRouter = class {
  name = "PreparedRegExpRouter";
  #matchers;
  #relocateMap;
  constructor(matchers, relocateMap) {
    this.#matchers = matchers;
    this.#relocateMap = relocateMap;
  }
  #addWildcard(method, handlerData) {
    const matcher = this.#matchers[method];
    matcher[1].forEach((list) => list && list.push(handlerData));
    Object.values(matcher[2]).forEach((list) => list[0].push(handlerData));
  }
  #addPath(method, path, handler, indexes, map) {
    const matcher = this.#matchers[method];
    if (!map) {
      matcher[2][path][0].push([handler, {}]);
    } else {
      indexes.forEach((index) => {
        if (typeof index === "number") {
          matcher[1][index].push([handler, map]);
        } else {
          matcher[2][index || path][0].push([handler, map]);
        }
      });
    }
  }
  add(method, path, handler) {
    if (!this.#matchers[method]) {
      const all = this.#matchers[METHOD_NAME_ALL];
      const staticMap = {};
      for (const key in all[2]) {
        staticMap[key] = [all[2][key][0].slice(), emptyParam];
      }
      this.#matchers[method] = [
        all[0],
        all[1].map((list) => Array.isArray(list) ? list.slice() : 0),
        staticMap
      ];
    }
    if (path === "/*" || path === "*") {
      const handlerData = [handler, {}];
      if (method === METHOD_NAME_ALL) {
        for (const m in this.#matchers) {
          this.#addWildcard(m, handlerData);
        }
      } else {
        this.#addWildcard(method, handlerData);
      }
      return;
    }
    const data = this.#relocateMap[path];
    if (!data) {
      throw new Error(`Path ${path} is not registered`);
    }
    for (const [indexes, map] of data) {
      if (method === METHOD_NAME_ALL) {
        for (const m in this.#matchers) {
          this.#addPath(m, path, handler, indexes, map);
        }
      } else {
        this.#addPath(method, path, handler, indexes, map);
      }
    }
  }
  buildAllMatchers() {
    return this.#matchers;
  }
  match = match;
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (;i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length;i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = undefined;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length;i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2;
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length;i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== undefined) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length;i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0;i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length;j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length;k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0;p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2;
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length;i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter, new TrieRouter]
    });
  }
};

// server/open-path.ts
import { realpath, stat } from "fs/promises";
import { basename, relative, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
async function resolvePathUnderRoot(pathStr, allowedRoot) {
  const rootReal = await realpath(resolve(allowedRoot));
  const abs = resolve(pathStr);
  let targetReal;
  try {
    targetReal = await realpath(abs);
  } catch {
    throw new Error("Path does not exist");
  }
  const rel = relative(rootReal, targetReal);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("Path is outside the configured scan root");
  }
  const st = await stat(targetReal);
  if (!st.isDirectory()) {
    throw new Error("Path is not a directory");
  }
  return targetReal;
}
async function openLocalPath(dir, target) {
  if (process.platform !== "darwin") {
    throw new Error("Open actions are only supported on macOS");
  }
  if (target === "finder") {
    await execFileAsync("open", [dir], { env: process.env });
    return;
  }
  if (target === "cursor") {
    try {
      await execFileAsync("cursor", [dir], { env: process.env });
    } catch {
      await execFileAsync("open", ["-a", "Cursor", dir], { env: process.env });
    }
    return;
  }
  if (target === "github") {
    try {
      await execFileAsync("github", [dir], { env: process.env });
    } catch {
      await execFileAsync("open", ["-a", "GitHub Desktop", dir], {
        env: process.env
      });
    }
    return;
  }
  if (target === "browser") {
    const host = basename(dir).trim().toLowerCase();
    if (!host) {
      throw new Error("Could not derive host name from directory path");
    }
    const httpsUrl = `https://${host}.test`;
    try {
      await execFileAsync("open", [httpsUrl], { env: process.env });
    } catch {
      const httpUrl = `http://${host}.test`;
      await execFileAsync("open", [httpUrl], { env: process.env });
    }
    return;
  }
}

// server/prefs.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
var CONFIG_DIR = join(homedir(), ".config", "orbit");
var CONFIG_PATH = join(CONFIG_DIR, "config.json");
var defaultPreferences = () => ({
  pinnedPaths: [],
  recent: [],
  repoNotes: {},
  repoTags: {},
  appSettings: {}
});
function parseAppSettings(input) {
  if (!input || typeof input !== "object")
    return {};
  const appSettings = input;
  if (!appSettings.tinify || typeof appSettings.tinify !== "object") {
    return {};
  }
  const tinify = appSettings.tinify;
  const parsedTinify = {};
  if (typeof tinify.apiKey === "string") {
    parsedTinify.apiKey = tinify.apiKey;
  }
  return { tinify: parsedTinify };
}
async function readPreferences() {
  try {
    const raw2 = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw2);
    return {
      ...defaultPreferences(),
      ...parsed,
      pinnedPaths: Array.isArray(parsed.pinnedPaths) ? parsed.pinnedPaths : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      repoNotes: parsed.repoNotes && typeof parsed.repoNotes === "object" ? Object.fromEntries(Object.entries(parsed.repoNotes).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string")) : {},
      repoTags: parsed.repoTags && typeof parsed.repoTags === "object" ? Object.fromEntries(Object.entries(parsed.repoTags).map(([path, tags]) => [
        path,
        Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : []
      ])) : {},
      appSettings: parseAppSettings(parsed.appSettings)
    };
  } catch {
    return defaultPreferences();
  }
}
async function writePreferences(prefs) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(prefs, null, 2), "utf8");
}

// server/scan.ts
import { execFile as execFile3 } from "child_process";
import { readdir, stat as stat2 } from "fs/promises";
import { join as join3 } from "path";
import { promisify as promisify3 } from "util";

// server/git.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
var execFileAsync2 = promisify2(execFile2);
async function runGit(cwd, args) {
  return execFileAsync2("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
    env: process.env
  });
}
async function getGitMeta(repoPath) {
  const empty = {
    topLevel: null,
    branch: null,
    lastCommitHash: null,
    lastCommitShortHash: null,
    lastCommitAuthor: null,
    lastCommitMessage: null,
    lastCommitIso: null,
    lastCommitEpoch: null,
    upstreamBranch: null,
    aheadCount: null,
    behindCount: null,
    isDirty: false,
    remoteUrl: null
  };
  try {
    const top = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
    const topLevel = top.stdout.trim() || null;
    const branchOut = await runGit(repoPath, [
      "branch",
      "--show-current"
    ]).catch(() => ({ stdout: "" }));
    const branch = branchOut.stdout.trim() || null;
    const logOut = await runGit(repoPath, [
      "log",
      "-1",
      "--format=%H%x1f%s%x1f%aI%x1f%ct%x1f%an"
    ]);
    const logLine = logOut.stdout.trim();
    let lastCommitHash = null;
    let lastCommitShortHash = null;
    let lastCommitAuthor = null;
    let lastCommitMessage = null;
    let lastCommitIso = null;
    let lastCommitEpoch = null;
    if (logLine) {
      const parts = logLine.split("\x1F");
      lastCommitHash = parts[0] ?? null;
      lastCommitShortHash = lastCommitHash ? lastCommitHash.slice(0, 7) : null;
      lastCommitMessage = parts[1] ?? null;
      lastCommitIso = parts[2] ?? null;
      if (parts[3]) {
        const n = Number(parts[3]);
        lastCommitEpoch = Number.isFinite(n) ? n : null;
      }
      lastCommitAuthor = parts[4] ?? null;
    }
    const st = await runGit(repoPath, ["status", "--porcelain"]);
    const isDirty = st.stdout.trim().length > 0;
    let remoteUrl = null;
    try {
      const r = await runGit(repoPath, ["remote", "get-url", "origin"]);
      remoteUrl = r.stdout.trim() || null;
    } catch {
      remoteUrl = null;
    }
    let upstreamBranch = null;
    let aheadCount = null;
    let behindCount = null;
    try {
      const upstreamOut = await runGit(repoPath, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}"
      ]);
      upstreamBranch = upstreamOut.stdout.trim() || null;
      if (upstreamBranch) {
        const countsOut = await runGit(repoPath, [
          "rev-list",
          "--left-right",
          "--count",
          `${upstreamBranch}...HEAD`
        ]);
        const raw2 = countsOut.stdout.trim();
        const [behindRaw, aheadRaw] = raw2.split(/\s+/);
        const behind = Number(behindRaw);
        const ahead = Number(aheadRaw);
        behindCount = Number.isFinite(behind) ? behind : null;
        aheadCount = Number.isFinite(ahead) ? ahead : null;
      }
    } catch {
      upstreamBranch = null;
      aheadCount = null;
      behindCount = null;
    }
    return {
      topLevel: topLevel ?? repoPath,
      branch,
      lastCommitHash,
      lastCommitShortHash,
      lastCommitAuthor,
      lastCommitMessage,
      lastCommitIso,
      lastCommitEpoch,
      upstreamBranch,
      aheadCount,
      behindCount,
      isDirty,
      remoteUrl
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...empty, error: message };
  }
}

// server/stack.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
async function detectStack(repoPath) {
  const tags = new Set;
  const tryRead = async (name) => {
    try {
      return await readFile2(join2(repoPath, name), "utf8");
    } catch {
      return null;
    }
  };
  const pkg = await tryRead("package.json");
  if (pkg) {
    tags.add("Node");
    if (/next/i.test(pkg))
      tags.add("Next");
    if (/react/i.test(pkg))
      tags.add("React");
    if (/vue/i.test(pkg))
      tags.add("Vue");
    if (/nuxt/i.test(pkg))
      tags.add("Nuxt");
    if (/svelte/i.test(pkg))
      tags.add("Svelte");
  }
  const gem = await tryRead("Gemfile");
  if (gem) {
    tags.add("Ruby");
    if (/rails/i.test(gem))
      tags.add("Rails");
  }
  const comp = await tryRead("composer.json");
  if (comp) {
    tags.add("PHP");
  }
  const cargo = await tryRead("Cargo.toml");
  if (cargo) {
    tags.add("Rust");
  }
  const go = await tryRead("go.mod");
  if (go) {
    tags.add("Go");
  }
  const py = await tryRead("pyproject.toml");
  const req = await tryRead("requirements.txt");
  if (py || req) {
    tags.add("Python");
  }
  return [...tags];
}

// server/scan.ts
var execFileAsync3 = promisify3(execFile3);
var SKIP_DIR_NAMES = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".Trash",
  ".yarn",
  "coverage",
  ".turbo",
  ".git"
]);
var MAX_DEPTH = 8;
var GIT_CONCURRENCY = 10;
var DU_TIMEOUT_MS = 900;
async function getDirectorySizeBytes(path) {
  try {
    const out = await execFileAsync3("du", ["-sk", path], {
      timeout: DU_TIMEOUT_MS,
      maxBuffer: 256 * 1024,
      env: process.env
    });
    const first = out.stdout.trim().split(/\s+/)[0];
    const kb = Number(first);
    if (!Number.isFinite(kb))
      return null;
    return kb * 1024;
  } catch {
    return null;
  }
}
async function getRepoDiskMetrics(topLevelPath) {
  let lastFsMtimeIso = null;
  try {
    const st = await stat2(topLevelPath);
    lastFsMtimeIso = st.mtime.toISOString();
  } catch {
    lastFsMtimeIso = null;
  }
  const workingTreeBytes = await getDirectorySizeBytes(topLevelPath);
  let nodeModulesBytes = null;
  try {
    const nodeModulesPath = join3(topLevelPath, "node_modules");
    const st = await stat2(nodeModulesPath);
    if (st.isDirectory()) {
      nodeModulesBytes = await getDirectorySizeBytes(nodeModulesPath);
    }
  } catch {
    nodeModulesBytes = null;
  }
  return { workingTreeBytes, nodeModulesBytes, lastFsMtimeIso };
}
async function collectGitRoots(dir, depth, acc) {
  if (depth > MAX_DEPTH)
    return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let hasGit = false;
  for (const ent of entries) {
    if (ent.name === ".git" && (ent.isDirectory() || ent.isFile())) {
      hasGit = true;
      break;
    }
  }
  if (hasGit) {
    acc.push(dir);
  }
  for (const ent of entries) {
    if (!ent.isDirectory())
      continue;
    if (SKIP_DIR_NAMES.has(ent.name))
      continue;
    await collectGitRoots(join3(dir, ent.name), depth + 1, acc);
  }
}
function poolMap(items, limit, fn) {
  if (items.length === 0)
    return Promise.resolve([]);
  return new Promise((resolve2, reject) => {
    const results = new Array(items.length);
    let next = 0;
    let active = 0;
    const kick = () => {
      while (active < limit && next < items.length) {
        const idx = next++;
        active++;
        const item = items[idx];
        fn(item).then((r) => {
          results[idx] = r;
        }).catch(reject).finally(() => {
          active--;
          if (next >= items.length && active === 0) {
            resolve2(results);
          } else {
            kick();
          }
        });
      }
    };
    kick();
  });
}
async function scanRepos(scanRoot) {
  const roots = [];
  try {
    const st = await stat2(scanRoot);
    if (!st.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }
  await collectGitRoots(scanRoot, 0, roots);
  const metas = await poolMap(roots, GIT_CONCURRENCY, async (repoPath) => {
    const git = await getGitMeta(repoPath);
    const stack = git.error ? [] : await detectStack(git.topLevel ?? repoPath);
    const top = git.topLevel ?? repoPath;
    const disk = await getRepoDiskMetrics(top);
    const name = top.split(/[/\\]/).filter(Boolean).pop() ?? top;
    const record = {
      id: top,
      name,
      path: top,
      topLevelPath: top,
      branch: git.branch,
      lastCommitHash: git.lastCommitHash,
      lastCommitShortHash: git.lastCommitShortHash,
      lastCommitAuthor: git.lastCommitAuthor,
      lastCommitMessage: git.lastCommitMessage,
      lastCommitIso: git.lastCommitIso,
      lastCommitEpoch: git.lastCommitEpoch,
      upstreamBranch: git.upstreamBranch,
      aheadCount: git.aheadCount,
      behindCount: git.behindCount,
      workingTreeBytes: disk.workingTreeBytes,
      nodeModulesBytes: disk.nodeModulesBytes,
      lastFsMtimeIso: disk.lastFsMtimeIso,
      isDirty: git.isDirty,
      remoteUrl: git.remoteUrl,
      stack
    };
    if (git.error) {
      record.error = git.error;
    }
    return record;
  });
  const byTop = new Map;
  for (const r of metas) {
    if (!byTop.has(r.topLevelPath)) {
      byTop.set(r.topLevelPath, r);
    }
  }
  return [...byTop.values()].sort((a, b) => {
    const ae = a.lastCommitEpoch ?? 0;
    const be = b.lastCommitEpoch ?? 0;
    return be - ae;
  });
}

// server/tinify.ts
import { readFile as readFile3, rename, stat as stat3, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname2, extname, join as join4, parse, resolve as resolve2 } from "path";
var TINIFY_SHRINK_URL = "https://api.tinify.com/shrink";
var ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
var MAX_CONCURRENCY = 3;
function toBasicAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}
function readCompressionCountHeader(response) {
  const headerValue = response.headers.get("compression-count") ?? response.headers.get("Compression-Count");
  if (!headerValue)
    return;
  const parsed = Number(headerValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text)
    return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
async function getUniqueSiblingPath(inputPath) {
  const parsed = parse(inputPath);
  let candidate = join4(parsed.dir, `${parsed.name}-tinified${parsed.ext}`);
  let counter = 1;
  while (true) {
    try {
      await stat3(candidate);
      candidate = join4(parsed.dir, `${parsed.name}-tinified-${counter}${parsed.ext}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}
async function writeOutputFile(outputBytes, originalPath, replaceOriginal) {
  if (!replaceOriginal) {
    const outputPath = await getUniqueSiblingPath(originalPath);
    await writeFile2(outputPath, outputBytes);
    return outputPath;
  }
  const tempPath = join4(dirname2(originalPath), `.${parse(originalPath).name}.tinify-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}${parse(originalPath).ext}`);
  await writeFile2(tempPath, outputBytes);
  await rename(tempPath, originalPath);
  return originalPath;
}
async function tinifySinglePath(apiKey, path, replaceOriginal) {
  try {
    const resolvedPath = resolve2(path);
    const extension = extname(resolvedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return { path, error: "Only PNG and JPG images are supported." };
    }
    const fileStats = await stat3(resolvedPath);
    if (!fileStats.isFile()) {
      return { path, error: "Path is not a file." };
    }
    const inputBytes = await readFile3(resolvedPath);
    const shrinkResponse = await fetch(TINIFY_SHRINK_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(apiKey)
      },
      body: inputBytes
    });
    if (!shrinkResponse.ok) {
      const errorPayload = await parseJsonSafe(shrinkResponse);
      const errorMessage = errorPayload?.message ?? errorPayload?.error ?? `Tinify request failed with ${shrinkResponse.status}.`;
      return { path, error: errorMessage };
    }
    const shrinkPayload = await parseJsonSafe(shrinkResponse);
    const outputUrl = shrinkResponse.headers.get("location") ?? shrinkPayload?.output?.url ?? null;
    if (!outputUrl) {
      return { path, error: "Tinify did not return an output URL." };
    }
    const downloadResponse = await fetch(outputUrl, {
      headers: { Authorization: toBasicAuthHeader(apiKey) }
    });
    if (!downloadResponse.ok) {
      return {
        path,
        error: `Could not download compressed image (${downloadResponse.status}).`
      };
    }
    const outputBytes = new Uint8Array(await downloadResponse.arrayBuffer());
    const outputPath = await writeOutputFile(outputBytes, resolvedPath, replaceOriginal);
    const outputSize = shrinkPayload?.output?.size ?? outputBytes.byteLength;
    return {
      path: resolvedPath,
      outputPath,
      inputSize: fileStats.size,
      outputSize
    };
  } catch (error) {
    return {
      path,
      error: error instanceof Error ? error.message : "Unexpected Tinify error."
    };
  }
}
async function mapLimit(items, limit, run) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
async function tinifyPaths(apiKey, paths, replaceOriginal) {
  return mapLimit(paths, MAX_CONCURRENCY, (path) => tinifySinglePath(apiKey, path, replaceOriginal));
}
async function validateTinifyApiKey(apiKey) {
  try {
    const response = await fetch(TINIFY_SHRINK_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(apiKey)
      }
    });
    const compressionCount = readCompressionCountHeader(response);
    const payload = await parseJsonSafe(response);
    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        message: payload?.message ?? "Invalid API key.",
        compressionCount
      };
    }
    if (response.status === 429) {
      return {
        valid: true,
        message: payload?.message ?? "API key is valid, but usage or rate limit has been reached.",
        compressionCount
      };
    }
    if (response.ok || response.status >= 400 && response.status < 500) {
      return {
        valid: true,
        message: "API key looks valid.",
        compressionCount
      };
    }
    return {
      valid: false,
      message: payload?.message ?? `Tinify validation failed with status ${response.status}.`,
      compressionCount
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "Could not validate API key right now."
    };
  }
}

// server/index.ts
var execFileAsync4 = promisify4(execFile4);
var PORT = (() => {
  const n = Number(process.env.ORBIT_API_PORT);
  return Number.isFinite(n) && n > 0 ? n : 8788;
})();
function defaultScanRoot() {
  return process.env.ORBIT_SCAN_ROOT ?? join5(homedir2(), "Sites");
}
async function listRepoBranches(repoPath) {
  const localResult = await execFileAsync4("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads"], { cwd: repoPath, env: process.env, maxBuffer: 1024 * 1024 });
  const remoteResult = await execFileAsync4("git", ["for-each-ref", "--format=%(refname:short)", "refs/remotes"], { cwd: repoPath, env: process.env, maxBuffer: 1024 * 1024 });
  const local = localResult.stdout.split(`
`).map((line) => line.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const remote = remoteResult.stdout.split(`
`).map((line) => line.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return { local, remote };
}
var app = new Hono2;
app.get("/api/health", (c) => c.json({ ok: true, service: "orbit-api" }));
app.get("/api/preferences", async (c) => {
  const prefs = await readPreferences();
  return c.json(prefs);
});
app.put("/api/preferences", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const current = await readPreferences();
  const noteEntries = body.repoNotes && typeof body.repoNotes === "object" ? Object.entries(body.repoNotes).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string") : null;
  const tagEntries = body.repoTags && typeof body.repoTags === "object" ? Object.entries(body.repoTags).map(([path, tags]) => [
    path,
    Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : []
  ]) : null;
  const nextAppSettings = body.appSettings && typeof body.appSettings === "object" ? {
    ...current.appSettings,
    ...body.appSettings,
    tinify: body.appSettings.tinify && typeof body.appSettings.tinify === "object" ? {
      ...current.appSettings.tinify,
      ...body.appSettings.tinify,
      apiKey: typeof body.appSettings.tinify?.apiKey === "string" ? body.appSettings.tinify.apiKey : current.appSettings.tinify?.apiKey
    } : current.appSettings.tinify
  } : current.appSettings;
  const next = {
    ...current,
    pinnedPaths: Array.isArray(body.pinnedPaths) ? body.pinnedPaths.filter((p) => typeof p === "string") : current.pinnedPaths,
    recent: Array.isArray(body.recent) ? body.recent.filter((r) => r && typeof r === "object" && typeof r.path === "string" && typeof r.lastOpenedAt === "string") : current.recent,
    scanRoot: typeof body.scanRoot === "string" && body.scanRoot.length > 0 ? body.scanRoot : current.scanRoot,
    repoNotes: noteEntries ? Object.fromEntries(noteEntries) : current.repoNotes,
    repoTags: tagEntries ? Object.fromEntries(tagEntries) : current.repoTags,
    appSettings: nextAppSettings
  };
  await writePreferences(next);
  return c.json(next);
});
app.post("/api/scan", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const prefs = await readPreferences();
  const fromBody = body && typeof body === "object" && typeof body.scanRoot === "string" ? body.scanRoot : undefined;
  const scanRoot = fromBody ?? prefs.scanRoot ?? defaultScanRoot();
  const scannedAt = new Date().toISOString();
  let gitAvailable = true;
  try {
    await execFileAsync4("git", ["--version"], { env: process.env });
  } catch {
    gitAvailable = false;
  }
  if (!gitAvailable) {
    return c.json({
      error: "git CLI not found on PATH",
      scanRoot,
      scannedAt,
      repos: []
    }, 500);
  }
  const repos = await scanRepos(scanRoot);
  return c.json({ scanRoot, scannedAt, repos });
});
app.post("/api/tinify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const paths = Array.isArray(body.paths) ? body.paths.filter((path) => typeof path === "string" && path.length > 0) : [];
  const replaceOriginal = typeof body.replaceOriginal === "boolean" ? body.replaceOriginal : true;
  if (paths.length === 0) {
    return c.json({ error: "No image paths were provided" }, 400);
  }
  const prefs = await readPreferences();
  const apiKey = prefs.appSettings.tinify?.apiKey?.trim();
  if (!apiKey) {
    return c.json({
      error: "TinyPNG API key is missing. Add it in Settings before compressing images."
    }, 400);
  }
  const results = await tinifyPaths(apiKey, paths, replaceOriginal);
  return c.json({ results });
});
app.post("/api/tinify/validate-key", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return c.json({ error: "Missing API key" }, 400);
  }
  const validation = await validateTinifyApiKey(apiKey);
  return c.json(validation);
});
app.post("/api/open", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const pathStr = body.path;
  const target = body.target;
  if (typeof pathStr !== "string" || pathStr.length === 0) {
    return c.json({ error: "Missing path" }, 400);
  }
  if (target !== "finder" && target !== "cursor" && target !== "github" && target !== "browser") {
    return c.json({
      error: 'target must be one of: "finder", "cursor", "github", "browser"'
    }, 400);
  }
  const prefs = await readPreferences();
  const scanRoot = prefs.scanRoot ?? defaultScanRoot();
  try {
    const safe = await resolvePathUnderRoot(pathStr, scanRoot);
    await openLocalPath(safe, target);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
});
app.get("/api/repo/branches", async (c) => {
  const pathStr = c.req.query("path");
  if (!pathStr) {
    return c.json({ error: "Missing path" }, 400);
  }
  const prefs = await readPreferences();
  const scanRoot = prefs.scanRoot ?? defaultScanRoot();
  let safePath;
  try {
    safePath = await resolvePathUnderRoot(pathStr, scanRoot);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 400);
  }
  try {
    const branches = await listRepoBranches(safePath);
    return c.json(branches);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});
console.log(`orbit API listening on http://127.0.0.1:${PORT}`);
var server_default = {
  port: PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch
};
export {
  server_default as default
};
