import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
import {
  __esm
} from "./chunk-VA35IVHB.js";

// ../node_modules/.pnpm/p-map@7.1.1/node_modules/p-map/index.js
function pMap(iterable, mapper, options) {
  return mapConcurrently(iterable, mapper, options, false);
}
function pMapSettled(iterable, mapper, options) {
  return mapConcurrently(iterable, mapper, options, true);
}
function pMapKeyed(input, mapper, options) {
  return mapKeyed(input, mapper, options, false);
}
function pMapSettledKeyed(input, mapper, options) {
  return mapKeyed(input, mapper, options, true);
}
async function mapKeyed(input, mapper, options, isSettled) {
  const entries = getKeyedEntries(input);
  if (typeof mapper !== "function") {
    throw new TypeError("Mapper function is required");
  }
  const mappedEntries = await mapConcurrently(entries, async ([key, inputResult]) => {
    try {
      if (inputResult.status === "rejected") {
        throw inputResult.reason;
      }
      const result = await mapper(inputResult.value, key);
      if (result === pMapSkip || result === pMapStop) {
        return result;
      }
      return [key, isSettled ? { status: "fulfilled", value: result } : result];
    } catch (error) {
      if (!isSettled) {
        throw error;
      }
      return [key, { status: "rejected", reason: error }];
    }
  }, options, false);
  if (input instanceof Map) {
    return new Map(mappedEntries);
  }
  return Object.setPrototypeOf(Object.fromEntries(mappedEntries), null);
}
async function mapConcurrently(iterable, mapper, {
  concurrency = Number.POSITIVE_INFINITY,
  stopOnError = true,
  signal
} = {}, isSettled) {
  return new Promise((resolve_, reject_) => {
    validateOptions(iterable, mapper, concurrency);
    const result = [];
    const errors = [];
    let skippedCount = 0;
    let isResolved = false;
    let isIterableDone = false;
    const pendingIndexes = /* @__PURE__ */ new Set();
    let doneIndex = Number.POSITIVE_INFINITY;
    let currentIndex = 0;
    const iterator = getIterator(iterable);
    const signalListener = () => {
      reject(signal.reason);
    };
    const cleanup = () => {
      signal?.removeEventListener("abort", signalListener);
    };
    const resolve = (value) => {
      resolve_(value);
      cleanup();
    };
    const reject = (reason) => {
      if (isResolved) {
        return;
      }
      isResolved = true;
      reject_(reason);
      cleanup();
      if (!isIterableDone) {
        closeIterator(iterator);
      }
    };
    if (signal) {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", signalListener, { once: true });
    }
    const pull = createPuller(iterator);
    const settleIfFinished = () => {
      if (isResolved || doneIndex === Number.POSITIVE_INFINITY) {
        return;
      }
      for (const index of pendingIndexes) {
        if (index < doneIndex) {
          return;
        }
      }
      if (!stopOnError) {
        const collectedErrors = [];
        for (let index = 0; index < Math.min(doneIndex, errors.length); index++) {
          if (index in errors) {
            collectedErrors.push(errors[index]);
          }
        }
        if (collectedErrors.length > 0) {
          reject(new AggregateError(collectedErrors));
          return;
        }
      }
      isResolved = true;
      if (!isIterableDone) {
        closeIterator(iterator);
      }
      const lastIndex = Math.min(doneIndex, result.length);
      if (lastIndex === result.length && skippedCount === 0) {
        resolve(result);
        return;
      }
      resolve(result.slice(0, lastIndex).filter((value) => value !== pMapSkip));
    };
    const next = async () => {
      if (isResolved || currentIndex >= doneIndex) {
        return;
      }
      const index = currentIndex++;
      pendingIndexes.add(index);
      let nextItem;
      try {
        nextItem = await pull();
      } catch (error) {
        pendingIndexes.delete(index);
        if (index < doneIndex) {
          throw error;
        }
        settleIfFinished();
        return;
      }
      if (nextItem.done) {
        pendingIndexes.delete(index);
        doneIndex = Math.min(doneIndex, index);
        isIterableDone = true;
        settleIfFinished();
        return;
      }
      const runner = (async () => {
        try {
          const element = await nextItem.value;
          if (isResolved || index >= doneIndex) {
            return;
          }
          const value = await mapper(element, index);
          if (index >= doneIndex) {
            return;
          }
          if (value === pMapStop) {
            doneIndex = index;
            return;
          }
          if (value === pMapSkip) {
            skippedCount++;
          }
          result[index] = isSettled && value !== pMapSkip ? { status: "fulfilled", value } : value;
        } catch (error) {
          if (index >= doneIndex) {
            return;
          }
          if (isSettled) {
            result[index] = { status: "rejected", reason: error };
          } else if (stopOnError) {
            reject(error);
            return;
          } else {
            errors[index] = error;
          }
        } finally {
          pendingIndexes.delete(index);
          settleIfFinished();
        }
        try {
          await next();
        } catch (error) {
          reject(error);
        }
      })();
      runner.then(() => new Promise(() => {
      })).then(resolve_);
    };
    (async () => {
      for (let index = 0; index < concurrency; index++) {
        try {
          await next();
        } catch (error) {
          reject(error);
          break;
        }
        if (isResolved || currentIndex >= doneIndex) {
          break;
        }
      }
    })();
  });
}
function pMapIterable(iterable, mapper, {
  concurrency = Number.POSITIVE_INFINITY,
  backpressure = concurrency,
  preserveOrder = true
} = {}) {
  validateOptions(iterable, mapper, concurrency);
  if (!isLimit(backpressure, concurrency)) {
    throw new TypeError(`Expected \`backpressure\` to be an integer from \`concurrency\` (${concurrency}) and up or \`Infinity\`, got \`${backpressure}\` (${typeof backpressure})`);
  }
  return {
    [Symbol.asyncIterator]() {
      let isDone = false;
      const generator = (async function* () {
        const iterator = getIterator(iterable);
        let promises = [];
        let headIndex = 0;
        let isIterableDone = false;
        let doneIndex = Number.POSITIVE_INFINITY;
        let readingCount = 0;
        let runningMappersCount = 0;
        const mapperWaiters = /* @__PURE__ */ new Map();
        let mapperWaiterCount = 0;
        let wokenMapperWaiterCount = 0;
        const releaseMapperSlot = () => {
          if (wokenMapperWaiterCount === mapperWaiterCount) {
            runningMappersCount--;
            return;
          }
          mapperWaiters.get(wokenMapperWaiterCount)();
          mapperWaiters.delete(wokenMapperWaiterCount++);
        };
        let index = 0;
        let stopIndex = Number.POSITIVE_INFINITY;
        let fillIndex = 0;
        let wake;
        const unfilledIndexes = /* @__PURE__ */ new Set();
        const fillSlot = (result) => {
          promises[fillIndex++] = result;
          wake?.(result);
          wake = void 0;
        };
        const pull = createPuller(iterator);
        function trySpawn() {
          if (isDone || isIterableDone || index > stopIndex || readingCount >= concurrency || promises.length - headIndex >= backpressure) {
            return;
          }
          readingCount++;
          const currentIndex = index++;
          const promise = (async () => {
            try {
              let element;
              try {
                const { done, value } = await pull();
                if (done) {
                  isIterableDone = true;
                  doneIndex = Math.min(doneIndex, currentIndex);
                  return { done: true };
                }
                trySpawn();
                element = await value;
                if (runningMappersCount < concurrency) {
                  runningMappersCount++;
                } else {
                  await new Promise((resolve) => {
                    mapperWaiters.set(mapperWaiterCount++, resolve);
                  });
                }
              } finally {
                readingCount--;
              }
              trySpawn();
              let returnValue;
              try {
                if (isDone || currentIndex > stopIndex) {
                  return { done: false, value: pMapSkip };
                }
                returnValue = await mapper(element, currentIndex);
              } finally {
                releaseMapperSlot();
              }
              if (returnValue === pMapStop) {
                stopIndex = Math.min(stopIndex, currentIndex);
              }
              return { done: false, value: returnValue };
            } catch (error) {
              if (preserveOrder) {
                stopIndex = Math.min(stopIndex, currentIndex);
              } else if (currentIndex < doneIndex) {
                isDone = true;
              }
              return { error };
            }
          })();
          if (preserveOrder) {
            promises.push(promise);
            return;
          }
          promises.push(void 0);
          unfilledIndexes.add(currentIndex);
          promise.then((result) => {
            if (!unfilledIndexes.delete(currentIndex)) {
              return;
            }
            if (result.done) {
              for (const unfilledIndex of unfilledIndexes) {
                if (unfilledIndex > currentIndex) {
                  unfilledIndexes.delete(unfilledIndex);
                  fillSlot({ done: true });
                }
              }
            }
            fillSlot(result);
          });
        }
        trySpawn();
        try {
          while (headIndex < promises.length) {
            const result = await (promises[headIndex] ?? new Promise((resolve) => {
              wake = resolve;
            }));
            const { done, value } = result;
            promises[headIndex] = void 0;
            headIndex++;
            if (headIndex * 2 >= promises.length) {
              promises = promises.slice(headIndex);
              fillIndex -= headIndex;
              headIndex = 0;
            }
            if (Object.hasOwn(result, "error")) {
              throw result.error;
            }
            if (done) {
              if (preserveOrder) {
                return;
              }
              continue;
            }
            if (value === pMapStop) {
              return;
            }
            trySpawn();
            if (value === pMapSkip) {
              continue;
            }
            yield value;
          }
        } finally {
          isDone = true;
          if (!isIterableDone) {
            closeIterator(iterator);
          }
        }
      })();
      const { return: generatorReturn, throw: generatorThrow } = generator;
      generator.return = (value) => {
        isDone = true;
        return generatorReturn.call(generator, value);
      };
      generator.throw = (error) => {
        isDone = true;
        return generatorThrow.call(generator, error);
      };
      return generator;
    }
  };
}
function validateOptions(iterable, mapper, concurrency) {
  if (iterable?.[Symbol.iterator] === void 0 && iterable?.[Symbol.asyncIterator] === void 0) {
    throw new TypeError(`Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`);
  }
  if (typeof mapper !== "function") {
    throw new TypeError("Mapper function is required");
  }
  if (!isLimit(concurrency, 1)) {
    throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
  }
}
function isLimit(value, minimum) {
  return Number.isSafeInteger(value) && value >= minimum || value === Number.POSITIVE_INFINITY;
}
function getKeyedEntries(input) {
  if (input === null || typeof input !== "object" && typeof input !== "function") {
    throw new TypeError(`Expected \`input\` to be an object, got (${input === null ? "null" : typeof input})`);
  }
  const entries = [];
  const addEntry = (key, value) => {
    entries.push(Promise.resolve(value).then(
      (value2) => [key, { status: "fulfilled", value: value2 }],
      (error) => [key, { status: "rejected", reason: error }]
    ));
  };
  if (input instanceof Map) {
    for (const [key, value] of input) {
      addEntry(key, value);
    }
  } else {
    for (const key of Reflect.ownKeys(input)) {
      if (Object.getOwnPropertyDescriptor(input, key)?.enumerable) {
        addEntry(key, input[key]);
      }
    }
  }
  return entries;
}
function getIterator(iterable) {
  return iterable[Symbol.asyncIterator] === void 0 ? iterable[Symbol.iterator]() : iterable[Symbol.asyncIterator]();
}
async function closeIterator(iterator) {
  try {
    await iterator.return?.();
  } catch {
  }
}
function createPuller(iterator) {
  let isSourceDone = false;
  const markDone = (item) => {
    if (item?.done) {
      isSourceDone = true;
    }
  };
  return () => {
    if (isSourceDone) {
      return { done: true };
    }
    const result = iterator.next();
    markDone(result);
    if (typeof result?.then !== "function") {
      return result;
    }
    const promise = Promise.resolve(result);
    promise.then(markDone, () => {
    });
    return promise;
  };
}
var pMapSkip, pMapStop;
var init_p_map = __esm({
  "../node_modules/.pnpm/p-map@7.1.1/node_modules/p-map/index.js"() {
    pMapSkip = /* @__PURE__ */ Symbol("skip");
    pMapStop = /* @__PURE__ */ Symbol("stop");
  }
});
init_p_map();
export {
  pMap as default,
  pMapIterable,
  pMapKeyed,
  pMapSettled,
  pMapSettledKeyed,
  pMapSkip,
  pMapStop
};
