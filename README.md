# find_potential_upsells

TypeScript pair-programming exercise: identify vehicles owned by existing customers that are not already insured under the supplied policies.

## Setup and verification

Requires Node.js >= 20. The project has been verified with Node.js 24.

```bash
npm ci
npm test
npx tsc --noEmit
```

To rerun tests automatically during development:

```bash
npm run test:watch
```

`npm start` executes `solution.ts`, which exports the function without running a demo or printing results.

## Contract

```ts
type Policy = { person_id: string; vehicle_id: string };
type UpsellOpportunity = { person_id: string; vehicle_id: string };

findPotentialUpsells(policies: Policy[]): UpsellOpportunity[]
findPotentialUpsellsOptimized(policies: Policy[]): Promise<UpsellOpportunity[]>
```

- Returns `[]` without calling the service when the policies array is empty.
- Requests vehicles for customers listed in the policies, passing each person ID only once.
- Excludes a vehicle when a policy exists for the same **person–vehicle pair**.
- Preserves the order of opportunities in the service response.
- Does not modify the policies or the service response.
- Propagates service errors.

### Example

| Data | Person | Vehicle |
|---|---|---|
| Supplied policy | A | 1 |
| Owned vehicle | A | 1 |
| Owned vehicle | A | 2 |

The returned opportunity is `{ person_id: 'A', vehicle_id: '2' }`: vehicle 1 is already insured, while vehicle 2 is not.

## Implementations

Both implementations are kept in `solution.ts` so the original solution and the external API improvements can be compared directly.

They share two private helpers: `indexInsuredVehicles` builds the insurance index, and `findUninsuredVehicles` applies the person–vehicle exclusion rule.

### Baseline: `findPotentialUpsells`

The synchronous baseline indexes insured vehicles by person, retrieves owned vehicles with one call to `getOwnedVehicles`, and filters out insured pairs. It preserves the original public contract. It does **not** enforce the 100-person API limit and is retained as the exercise's initial solution.

### Improvements: `findPotentialUpsellsOptimized`

1. Index policies in a `Map<string, Set<string>>`: person → insured vehicles.
2. Use the `Map` keys to obtain unique customer IDs and split them into batches of at most 100.
3. Process batches through a pool of at most **3 concurrent requests per invocation** to `getOwnedVehiclesAsync`.
4. Retain uninsured pairs and combine results in batch order, regardless of request completion order.

For **C** unique customers, a successful invocation makes exactly **ceil(C / 100)** service calls (zero for empty input), the minimum needed to query every customer under the API limit. Each request contains at most 100 IDs. A worker starts the next batch as soon as its current request completes; it does not wait for the other workers.

If a request fails, the operation rejects with the first worker error and stops scheduling new batches once the failure is detected. In-flight requests continue; `Promise.all` also handles their later rejections. No partial result is returned.

The concurrency value of 3 is an initial setting to confirm with the provider, not a limit implied by the 100-ID requirement. It applies per invocation, not globally across simultaneous invocations or application instances, and does not enforce a requests-per-second quota. Real API integration would also need an agreed timeout/cancellation policy. Caching requires a freshness policy, and retries add cost and require an error-specific retry policy; neither is implemented here.

### Complexity

For **P** policies and **V** returned vehicles, both versions take **O(P + V) average local processing time**, assuming average constant-time lookups in `Map` and `Set`. The index uses **O(P)** additional space and the output uses **O(U)** space, where U is the number of opportunities. The optimized version also keeps **O(B)** batch-result slots, where B is the number of batches. These costs exclude service internals and response buffers; network duration depends on latency and concurrency.

## Service and assumptions

`vehicles.ts` exposes two datasource stubs:

- `getOwnedVehicles(personIds: string[]): OwnedVehicle[]` for the baseline.
- `getOwnedVehiclesAsync(personIds: string[]): Promise<OwnedVehicle[]>` for the improvements.

Both currently return an empty array (resolved asynchronously for the second version). Tests mock each dependency separately; no real external API is connected.

The solution assumes that the service returns unique vehicles belonging to the requested people. It does not deduplicate the response or filter out unrequested owners.

## Project structure

| File | Contents |
|---|---|
| `solution.ts` | Types, original exercise description, baseline and improvements |
| `vehicles.ts` | Synchronous and asynchronous datasource stubs |
| `solution.spec.ts` | Synchronous baseline tests |
| `solution.improvements.spec.ts` | Async contract, batching, concurrency, and failure tests |
| `jest.config.js` | Jest configuration using ts-jest |
| `tsconfig.json` | Strict TypeScript configuration |

Each suite independently tests its implementation's domain contract: empty input, no owned vehicles, insured-vehicle exclusion, additional opportunities, duplicate policies, person–vehicle matching, ordering, absence of mutations, invocation independence, and propagation of the original error. The improvements suite additionally covers batch boundaries, deduplication before batching, bounded concurrency, slot reuse, out-of-order completion, and multiple in-flight failures. Overlapping-invocation tests verify that insurance data and failure state remain isolated: one operation's failure does not stop the other.

The latest verification passed **25 tests across 2 suites**, as well as `npx tsc --noEmit`. Batch-limit cases focus on 100, 101, 200, and 201 unique customers; the concurrency tests exercise larger inputs. The multiple-failure test checks scheduling behavior; it is not a dedicated assertion about Node.js `unhandledRejection` events.

## Flow logging

Both implementations emit `console.debug` messages with distinct prefixes:

- `[upsell:baseline]`: start, datasource request, and completion.
- `[upsell:pool]`: start, pool preparation, batch start/completion/failure, and overall completion.

Logs include counts and batch durations, without printing person or vehicle IDs. Batch indexes are zero-based. Logs do not currently include an invocation correlation ID, so messages from overlapping invocations can interleave.

To run tests without debug output:

```bash
npm test -- --runInBand --silent
```

Run the suites separately with:

```bash
npm test -- --runInBand solution.spec.ts
npm test -- --runInBand solution.improvements.spec.ts
```
