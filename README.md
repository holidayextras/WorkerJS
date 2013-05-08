##Introduction

WorkerJS makes it easy to write lightweight, concise, concurrent Javascript.

##Overview

```javascript
var theRestOfMyCode;

WorkerJS({
  // This is the 'Bridge'
  // Functions defined here become global functions in the Worker.
  // Functions defined here should sync data between Worker <--> theRestOfMyCode.
}, function() { 
  // This is the 'Worker', it runs in a WebWorker (in a separate context).
  // Functions defined in the Bridge exist in this global scope.
  // Functions defined here become properties of the 'instance' object in the Gateway.
}, function(instance) {
  // This is the 'Gateway', it allows interaction with the Worker.
  // Functions defined in the Worker become properties of the 'instance' object.
  // This function will only be invoked once.
  // Invoking a function on the 'instance' object will call the function on the Worker.
  // If the workerCount in the options is greater than 1, invoking a function on the
  // 'instance' will call the function on every Worker - if there is a callback to
  // the function it will only be invoked once, and only when EVERY worker's function
  // has invoked it's callback.
}, {
  // Options. This parameter isn't required, if omitted the workerCount defaults to 1.
  workerCount: 1
});
```

##Example Working with Primes

```javascript
// The goal of this example is to populate this array with a bunch of prime numbers.
var primes=[];
var finished = false;

WorkerJS({ // TLDR; Functions we want to push into the Worker.
  // 1. This is the 'Bridge'.
  // 2. Any functions put into this object will be available as globals in the Worker.
  // 3. All functions have this.callback which communicates data back into the Worker.
  // 4. These functions exist in the normal, expected scope.
  addPrime: function(somePrime) {
    primes.push(somePrime);
  },
}, function() { // TLDR; Definition of the Worker.
  // 1. This is the 'Worker'.
  // 2. This is the code which runs in parallel, in a totally separate WebWorker scope. 
  // 3. Functions defined in the Bridge will be available in this function's global scope.
  // 4. Global functions defined in the Worker will become properties in the Gateway.
  // 5. All functions have this.callback which ferries data back into the main scope.
  // 6. In addition to the functions in the Bridge, there is 'log' and 'warn' to aid debugging.
  function findPrimesBetween(a, b) {
    log("Searching for primes between", a, "and", b);
    
    for (var i=a; i<b; i++) {
      var prime = true;
      for (var j=2; j<i; j++) {
        if ( (i%j) == 0 ) {
          prime = false;
          break;
        }
      }
      if (prime) addPrime(i);
    }
    this.callback({ result: "success" });
  };
}, function(instance) { // TLDR; Interacting with the Worker.
  // 1. This is the 'Gateway'.
  // 2. 'instance' has a property for each function defined in the Worker.
  // 3. Each function defined in the Worker gains an additional callback parameter.
  instance.findPrimesBetween(2, 1000000, function(result) {
    console.log("Primes between 2 and 1000000:", primes);
    finished = true;
  });
});

// This demonstrates the parallel nature of this demo.
var checkProgress = function() {
  console.log("Found", primes.length, "primes");
  if (!finished) setTimeout(checkProgress, 1000);
};
checkProgress();
```

## More Effective Example

This example uses 7 workers to get the job done much MUCH faster. If you run this example you'll see that the Gateway only gets invoked once, and calling instances.testIfPrime() invokes the function on each of the 7 requested workers. The callback fires once all 7 worker's functions callback. The Bridge allows each Worker to request work units from main thread and write their output back to the main thread. Pretty neat.

```javascript
var primes=[];
var unit = 1;
var finished = false;

WorkerJS({ // TLDR; Functions we want to push into the Worker scope.
  addPrime: function(somePrime) {
    primes.push(somePrime);
  },
  getUnit: function() {
    this.callback(unit++);
  }
}, function() { // TLDR; Definition of the Worker.
  function testIfPrime() {
    log("Worker starting up...");
    var self = this;
    
    var processNextUnit = function() {
      getUnit(function(i) {
        if (i>100000) return self.callback("Success");
        var prime = true;
        for (var j=2; j<i; j++) {
          if ( (i%j) == 0 ) {
            prime = false;
            break;
          }
        }
        if (prime) addPrime(i);
        return processNextUnit();
      });
    };
    processNextUnit();
  };
}, function(instances) { // TLDR; Interacting with the Worker(s).
  console.log("Gateway has been called.");
  // Calling testIfPrime() will invoke the function on all 7 Workers at the same time
  instances.testIfPrime(function(result) {
    // This callback will be invoked when all 7 Workers have invoked their callbacks.
    console.log("Gateway callback - Done!", primes, result);
    finished = true;
  });
}, { workerCount: 7 });

// This demonstrates the parallel nature of this demo.
var checkProgress = function() {
  console.log("Found", primes.length, "primes");
  if (!finished) setTimeout(checkProgress, 1000);
};
checkProgress();
```

