---
name: Reconnect mutex must not be reset outside its own function
description: A boolean "in progress" guard that gets reset by unrelated success callbacks (not just the function that owns it) can let concurrent triggers race past the guard.
---

If a boolean flag is used as a mutex to prevent overlapping async retry/reconnect loops (e.g. `reconnecting`), only the function that owns the loop should ever set it back to `false`. If a different code path (e.g. an event handler that fires independently, like a successful data event) also resets that same flag as a side effect of "looking healthy again," a loop that is still mid-sleep can have its guard cleared out from under it — letting a second concurrent trigger start an overlapping loop.

**Why:** In `blockchainListener.ts`, the PaymentReceived event handler used to reset `listenerState.reconnecting = false` on every successful event, not just on a genuine reconnect success. If an event fired while a `reconnectWithBackoff()` loop was asleep between attempts, a concurrent provider-error trigger could pass the `if (reconnecting) return` guard and start a second parallel backoff loop.

**How to apply:** When adding resilience patterns (retry loops, reconnect backoff, circuit breakers) give the mutex/state machine its own dedicated field, only mutated inside the owning function (e.g. `reconnectInFlight`), separate from any "healthy"/display flags that other callbacks are allowed to touch. For flapping/repeated-failure protection, prefer an explicit CLOSED/OPEN/HALF_OPEN circuit breaker (with a consecutive-failure counter and cooldown) over reusing the same boolean for both "is a loop running" and "should we even try."
