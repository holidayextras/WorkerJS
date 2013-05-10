
WorkerJS = (function() {
  //
  // This variable holds some code which is toString()'d and injected into
  // the worker. It converts message passing into RPC and vice versa.
  //
  var workerImport = function() {
    var workerGlobalScope = this;
    var token = 1;
    var queue = {};
    
    addEventListener('message', function(e) {
      if (e.data._init) {
        //
        // This is the initialisation message sent from the main thread. It names
        // each function in the Bridge. Create fake functions in the workerGlobalScope
        // and link them up to callback into the main thread.
        //
        var funcs = e.data._init;
        for (var prop in funcs) {
          (function setProperty(name){
            workerGlobalScope[name] = function() {
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
        //
        // This represents a request from the Gateway to get the Worker
        // to perform an action. Call the named function, passing in a callback
        // set up to send any resulting data back to the main thread.
        //
        workerGlobalScope[e.data._request.name].apply({
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
        //
        // This represents a response from the main thread's Bridge to a request 
        // from within the worker. Clean up and fire the callback.
        //
        var callback = queue[e.data._response.token];
        delete queue[e.data._response.token];
        delete e.data._response.token;
        callback(e.data._response.result);
      }
    }, false);

    //
    // At this point, iterating over the global scope will reveal all of
    // the user written global functions first. Form a list of each and
    // send them back to the main thread in an _init message.
    //
    var funcs = [];
    for (var someGlobal in workerGlobalScope) {
      if (someGlobal == "workerGlobalScope") break;
      if ( (typeof workerGlobalScope[someGlobal] == "function") ) {
        funcs.push(someGlobal);
      }
    }
    postMessage({ _init: funcs });
  };
  //
  // Stringy up the previous code then strip the "function() {" and "}" off of it.
  //
  workerImport = workerImport.toString();
  workerImport = workerImport.substring(13, workerImport.length-1);



  //
  // This is where all the cool stuff happens
  //
  var WorkerJS = function(bridgeFunctions, workerCode, gatewayFunction) {
    //
    // Start by grabbing the workerCode function, toString() it and chop the "function() {" 
    // and "}" off of it. Append it to the import code written above and drop it into a WebWorker.
    //
    var code = workerCode.toString();
    code = code.substring(13, code.length-1)+workerImport;
    var worker = new Worker(window.URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    
    var token = 1;
    var queue = {};
    var instance = { };
    instance.terminate = function() {
      worker.terminate();
    };
    //
    // These are two helper functions to allow workers to perform console.log
    // and console.warn without any extra effort. Great for debugging.
    //
    var bridge = {
      log: function() {
        var log = Function.prototype.bind.call(console.log, console);
        log.apply(console, arguments);
      },
      warn: function() {
        var warn = Function.prototype.bind.call(console.warn, console);
        warn.apply(console, arguments);
      }
    };
    //
    // Append the functions defined in bridgeFunctions to the logging functions.
    //
    for (var prop in bridgeFunctions) {
      bridge[prop] = bridgeFunctions[prop];
    }
    
    worker.addEventListener('message', function(e) {
      if (e.data._init) {
        //
        // This is the initialisation message sent from the WebWorker. It names
        // each function being pushed out into the Gateway. Create fake functions on 
        // the instance object and link them up to head back to the WebWorker.
        //
        var funcs = e.data._init;
        for (var prop in funcs) {
          (function setProperty(name){
            instance[name] = function() {
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
        //
        // This calls into the Gateway code, passing in the 'instance' object.
        //
        gatewayFunction(instance);
        gatewayFunction = function() { };
      } else if (e.data._request) {
        //
        // This represents a request from the WebWorker to call a function defined
        // within the Bridge. Call the named function, passing in a callback
        // set up to send any resulting data back to the WebWorker.
        //
        bridge[e.data._request.name].apply({
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
        //
        // This represents a response from the WebWorker to a request from
        // the Gateway. Clean up and fire the callback.
        //
        var callback = queue[e.data._response.token];
        delete queue[e.data._response.token];
        delete e.data._response.token;
        callback(e.data._response.result);
      }
    }, false);
    
    //
    // Iterate over the bridge object, form a list of function names and
    // send them into the WebWorker via an _init message.
    //
    var funcs = [];
    var props = Object.keys(bridge);
    for (var i=0; i<props.length; i++) {
      if (typeof bridge[props[i]] == "function") {
        funcs.push(props[i]);
      }
    }
    worker.postMessage({ _init: funcs });
  };
  
  //
  // Allow us to spawn multiple Workers in a cluster, it should appear to the user
  // as a single worker, only much much faster.
  //
  var spawnMultipleWorkers = function(bridgeFunctions, workerCode, gatewayFunction, totalInstances) {
    totalInstances = totalInstances.workerCount || 1;
    var runningInstances = [];
    
    //
    // Every Worker will call this next function. Each one will register 
    // with the runningInstances array, the final one will create the new
    // 'instance' object which allow the Gateway to interact with every
    // worker simultaneously.
    //
    var sharedGatewayFunction = function(instance) {
      runningInstances.push(instance);
      //
      // Once all Workers have reported in, callback into the Gateway
      //
      if (runningInstances.length == totalInstances) {
        var newInstance = { };
        for (var prop in instance) {
          (function recreateProperty(prop) {
            newInstance[prop] = function() {
              var args = Array.prototype.slice.call(arguments);
              var queue = [];
              //
              // Grab the correct callback and replace it with our Barrier. This
              // will only callback when all Worker instances have returned.
              //
              var callback = function() { };
              if ((args.length>0) && typeof args[args.length-1] == "function") {
                callback = args.pop();
              }
              args.push(function() {
                queue.push(arguments);
                if (queue.length == totalInstances) {
                  callback(queue);
                }
              });
              //
              // Invoke the requested function on all Worker instances
              //
              runningInstances.forEach(function(instance) {
                instance[prop].apply(instance, args);
              });
            };
          })(prop);
        }
        
        newInstance.end = function() {
          for (var i=0; i<runningInstances.length; i++) {
            runningInstances[i].terminate();
          }
        };
        
        //
        // Only one instance of the Gateway will run.
        //
        gatewayFunction(newInstance);
      }
    };
    
    //
    // Spawn the desired number of Workers.
    //
    if (totalInstances > 0) {
      for (var i=0; i<=totalInstances; i++) {
        WorkerJS(bridgeFunctions, workerCode, sharedGatewayFunction);
      }
    } else if (totalInstances == -1) {
      console.log("Computing most effective number of workers...");
      computeMaxWorkers(function(maxWorkers) {
        console.log("Starting", maxWorkers, "workers");
        totalInstances = maxWorkers;
        for (var i=0; i<=totalInstances; i++) {
          WorkerJS(bridgeFunctions, workerCode, sharedGatewayFunction);
        }
      });
    } else {
      console.error("How many workers?!", totalInstances, "is not recognised...");
    }
  };
  
  //
  // Work out how many workers are the most efficient
  //
  function computeMaxWorkers(callback) {
    var workerCount = 1;
    var maxNumbers = 1;
    
    function tryNext() {
      benchmark(workerCount, function(time, count) {
        console.log("Benchmark [", workerCount, "workers ] ", time, "ms -", count, "units processed");
        if ((time < 275) && (count > maxNumbers)) {
          maxNumbers = count; workerCount++;
          return tryNext();
        } else {
          return callback(workerCount-1);
        }
      });
    };
    tryNext();
  };
  
  //
  // Stress Tester
  //
  function benchmark(workerCount, callback) {
    spawnMultipleWorkers({ }, function() {
      function startCounting() {
        var done = false, i = 0;
        var self = this;
        
        setTimeout(function() { done = true; }, 250);
        
        var it = function() {
          if (done) return self.callback(i);
          i++;
          for (var j=0; j<1000; j++) { }
          setTimeout(it, 0);
        }; it();
      };
    }, function(instances) {
      var now = new Date();
      instances.startCounting(function(result) {
        instances.end();
        var total = 0;
        for (var i=0; i<result.length; i++) {
          total += result[i][0];
        }
        callback((new Date())-now, total);
      });
    }, { workerCount: workerCount });
  };
  
  //
  // Export all our hard work
  //
  return spawnMultipleWorkers;
})();

