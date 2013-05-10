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
  // This is the definition of a 'Worker', it runs in a WebWorker (in a separate context).
  // Functions defined in the Bridge exist in this global scope, nothing else
  // outside of this function will be in scope.
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
  // Setting workerCount to (-1) will start a benchmark to determine the most effective
  // number of workers the browser can handle, then proceed with that number.
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
}, function() { // TLDR; Definition of a Worker.
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

This example uses a cluster of workers to get the job done much MUCH faster. If you run this example you'll see it run a quick benchmark to determine how many workers the browser can effectively use - it will then spawn that many workers in a cluster. The Gateway only gets invoked once, and calling instances.testIfPrime() invokes the function on each of the clustered workers. The callback fires once all the worker's functions callback. The Bridge allows each Worker to request work units from main thread and write their output back to the main thread. Pretty neat.

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
}, function() { // TLDR; Definition of a Worker.
  function testIfPrime() {
    var self = this;
    
    var processNextUnit = function() {
      getUnit(function(i) {
        if (i>200000) return self.callback("Success");
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
  
  var checkProgress = function() {
    console.log("Found", primes.length, "primes");
    if (!finished) setTimeout(checkProgress, 1000);
  };
  checkProgress();
  
  var now = new Date();
  instances.testIfPrime(function(result) {
    console.log("Gateway callback - Done!", primes, result);
    console.log("Duration:", (new Date())-now, "ms");
    finished = true;
  });
}, { workerCount: -1 });
```
Sample Console Output:
```
Computing most effective number of workers... 
Benchmark [ 1 workers ] 258 ms - 29 units processed
Benchmark [ 2 workers ] 260 ms - 61 units processed
Benchmark [ 3 workers ] 261 ms - 91 units processed
Benchmark [ 4 workers ] 260 ms - 133 units processed
Benchmark [ 5 workers ] 258 ms - 163 units processed
Benchmark [ 6 workers ] 258 ms - 219 units processed
Benchmark [ 7 workers ] 260 ms - 276 units processed
Benchmark [ 8 workers ] 262 ms - 303 units processed
Benchmark [ 9 workers ] 259 ms - 348 units processed
Benchmark [ 10 workers ] 261 ms - 426 units processed
Benchmark [ 11 workers ] 260 ms - 415 units processed
Starting 10 workers
Gateway has been called.
Found 0 primes
Found 2541 primes 
Found 4755 primes 
Found 6680 primes 
Found 8623 primes 
Found 10464 primes 
Found 12190 primes 
Found 13872 primes 
Found 15462 primes 
Found 16985 primes 
Gateway callback - Done! 
[3, 2, 5, 7, 1, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523…]
Duration: 9691 ms
Found 17985 primes 
```

