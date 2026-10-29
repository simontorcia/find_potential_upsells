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

## Algorithm and complexity

1. Index policies in a `Map<string, Set<string>>`: person → insured vehicles.
2. Use the `Map` keys to retrieve vehicles with a single call to `getOwnedVehicles`.
3. Filter vehicles by checking whether their person–vehicle pair appears in the index.

For **P** policies and **V** returned vehicles, local processing takes **O(P + V) average time**, assuming average constant-time lookups in `Map` and `Set`. The index uses **O(P)** additional space; the result uses **O(U)** space, where U is the number of opportunities. These costs exclude the service's internal work.

## Service and assumptions

`getOwnedVehicles(personIds: string[]): OwnedVehicle[]` is a synchronous dependency defined in `vehicles.ts`. It is currently a **stub that always returns `[]`** and is replaced with a Jest mock in tests.

The solution assumes that the service returns unique vehicles belonging to the requested people. It does not deduplicate the response or filter out unrequested owners.

## Project structure

| File | Contents |
|---|---|
| `solution.ts` | Types, original exercise description, and algorithm |
| `vehicles.ts` | Owned-vehicle service stub |
| `solution.spec.ts` | Contract tests and service mock |
| `jest.config.js` | Jest configuration using ts-jest |
| `tsconfig.json` | Strict TypeScript configuration |

Tests cover empty input, no owned vehicles, exclusion of insured vehicles, additional opportunities, multiple customers and duplicate policies, person–vehicle matching, ordering, absence of mutations, independence between invocations, and propagation of the original error.
