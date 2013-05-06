##Introduction

WorkerJS makes it easy to write lightweight, concise, concurrent Javascript.

##Overview

	<script type="text/javascript" src="WorkerJS.js"></script>
	<script type="text/javascript">
		var theRestOfMyCode;
		
		$WorkerJS({
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
		});
	</script>


##Example Working with Primes

	<!doctype html>
	<html>
		<head>
		  <script type="text/javascript" src="WorkerJS.js"></script>
		  <script type="text/javascript">
		    // The goal of this example is to populate this array with a bunch of prime numbers.
		    var primes=[];
		    var finished = false;
		    
		    $WorkerJS({ // TLDR; Functions we want to push into the parallel scope.
		      // 1. This is the 'Bridge'.
		      // 2. Any functions put into this object will be available as globals in the parallel scope.
		      // 3. All functions have this.callback which communicates data back into the parallel scope.
		      // 4. These functions exist in the normal, expected scope.
		      addPrime: function(somePrime) {
		        primes.push(somePrime);
		      },
		      getPrimes: function() {
		        this.callback(primes);
		      }
		    }, function() { // TLDR; Definition of the parallel (worker) scope.
		      // 1. This is the 'Worker'.
		      // 2. This is the code which runs in parallel, in a totally separate parallel (worker) scope. 
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
		    }, function(instance) { // TLDR; Interacting with the parallel (worker) scope.
		      // 1. This is the 'Gateway'.
		      // 2. 'instance' has a property for each function defined in the Worker.
		      // 3. Each function defined in the Worker gains an additional callback parameter.
		      instance.findPrimesBetween(2, 1000000, function(result) {
		        console.log("Primes between 2 and 100:", primes);
		        finished = true;
		      });
		    });
		    
		    // This demonstrates the parallel nature of this demo.
		    var checkProgress = function() {
		      console.log("Found", primes.length, "primes");
		      if (!finished) setTimeout(checkProgress, 1000);
		    };
		    checkProgress();
		  </script>
		</head>
	</html>


## Example without Comments

	<!doctype html>
	<html>
		<head>
		  <script type="text/javascript" src="WorkerJS.js"></script>
		  <script type="text/javascript">
		    var primes=[];
		    var finished = false;
		    
		    $WorkerJS({ // TLDR; Functions we want to push into the Worker scope.
		      addPrime: function(somePrime) {
		        primes.push(somePrime);
		      },
		      getPrimes: function() {
		        this.callback(primes);
		      }
		    }, function() { // TLDR; Definition of the Worker.
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
		      instance.findPrimesBetween(2, 1000000, function(result) {
		        console.log("Primes between 2 and 100:", primes);
		        finished = true;
		      });
		    });
		    
		    // This demonstrates the parallel nature of this demo.
		    var checkProgress = function() {
		      console.log("Found", primes.length, "primes");
		      if (!finished) setTimeout(checkProgress, 1000);
		    };
		    checkProgress();
		  </script>
		</head>
	</html>

