
var workerImport = function() {
  var global = this;
  var token = 1;
  var queue = {};

  addEventListener('message', function(e) {
    if (e.data._init) {
      var funcs = e.data._init;
      for (var prop in funcs) {
        (function setProperty(name){
          global[name] = function() {
            var args = Array.prototype.slice.call(arguments);
            var callback = function() { };
            if ((args.length>0) && typeof args[args.length-1] == "function") {
              callback = args.pop();
            }
            token = (token+1) % 99999;
            queue[token] = callback;
            postMessage({
              _request: {
                token: token,
                name: name,
                data: args
              }
            });
          };
        })(funcs[prop]);
      }
    } else if (e.data._request) {
      global[e.data._request.name].apply({
        callback: function(result) {
          postMessage({
            _response: {
              token: e.data._request.token,
              name: e.data._request.name,
              result: result
            }
          });
        }
      }, e.data._request.data);
    } else if (e.data._response) {
      var callback = queue[e.data._response.token];
      delete queue[e.data._response.token];
      delete e.data._response.token;
      callback(e.data._response.result);
    }
  }, false);

  // Log the current global scope
  var funcs = [];
  for (var someGlobal in global) {
    if (someGlobal == "global") break;
    if ( (typeof global[someGlobal] == "function") ) {
      funcs.push(someGlobal);
    }
  }
  postMessage({ _init: funcs });
};
workerImport = workerImport.toString();
workerImport = workerImport.substring(13, workerImport.length-1);

$WorkerJS = function(globalFunctions, workerCode, initCallback) {
  var code = workerCode.toString();
  code = code.substring(13, code.length-1)+workerImport;
  var worker = new Worker(window.URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  var token = 1;
  var queue = {};
  var workerObj = { };
  var global = {
    log: function() {
      var log = Function.prototype.bind.call(console.log, console);
      log.apply(console, arguments);
    },
    warn: function() {
      var warn = Function.prototype.bind.call(console.warn, console);
      warn.apply(console, arguments);
    }
  };
  for (var prop in globalFunctions) {
    global[prop] = globalFunctions[prop];
  }
  
  worker.addEventListener('message', function(e) {
    if (e.data._init) {
      var funcs = e.data._init;
      for (var prop in funcs) {
        (function setProperty(name){
          workerObj[name] = function(data, callback) {
            var args = Array.prototype.slice.call(arguments);
            var callback = function() { };
            if ((args.length>0) && typeof args[args.length-1] == "function") {
              callback = args.pop();
            }
            token = (token+1) % 99999;
            queue[token] = callback;
            worker.postMessage({
              _request: {
                token: token,
                name: name,
                data: args
              }
            });
          };
        })(funcs[prop]);
      }
      initCallback(workerObj);
      initCallback = function() { };
    } else if (e.data._request) {
      global[e.data._request.name].apply({
        callback: function(result) {
          worker.postMessage({
            _response: {
              token: e.data._request.token,
              name: e.data._request.name,
              result: result
            }
          });
        }
      }, e.data._request.data);
    } else if (e.data._response) {
      var callback = queue[e.data._response.token];
      delete queue[e.data._response.token];
      delete e.data._response.token;
      callback(e.data._response.result);
    }
  }, false);
  
  var funcs = [];
  var props = Object.keys(global);
  for (var i=0; i<props.length; i++) {
    if (typeof global[props[i]] == "function") {
      funcs.push(props[i]);
    }
  }
  worker.postMessage({ _init: funcs });
};

