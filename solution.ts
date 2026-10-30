import { getOwnedVehicles, getOwnedVehiclesAsync } from './vehicles';

// API payload limit; independent of how many requests may run concurrently.
const MAX_PERSON_IDS_PER_CALL = 100;
// Per-invocation concurrency; confirm this value with the API provider.
const MAX_CONCURRENT_CALLS = 3;

/**
 * defmodule UpsellFinder do
    # For the sake of the exercise, the types have the same shape.
    # If you want, you could also just use a tuple of (person_id, vehicle_id)
    @type owned_vehicle :: %{person_id: String.t(), vehicle_id: String.t()}
    @type policy :: %{person_id: String.t(), vehicle_id: String.t()}
    @type upsell_opportunity :: %{person_id: String.t(), vehicle_id: String.t()}
  
    # This is the function you can call to get the vehicles owned by someone
    @spec get_owned_vehicles(person_ids: [String.t()]) :: [owned_vehicle]
    def get_owned_vehicles(_), do: []
  
    # This is the function you have to implement.
    # It should return a list of up-selling targets, where each target is
    # another vehicle owned by a customer.
    @spec find_potential_upsells(policies: [policy]) :: [upsell_opportunity]
    def find_potential_upsells(_), do: []
  end
 */

// For the sake of the exercise, the types have the same shape.
// If you want, you could also just use a tuple of (person_id, vehicle_id)
export type OwnedVehicle = { person_id: string; vehicle_id: string };

export type Policy = { person_id: string; vehicle_id: string };
export type UpsellOpportunity = { person_id: string; vehicle_id: string };

// Index each person–vehicle pair once for average O(1) insurance checks.
// Map keys also provide the unique customers to query.
function indexInsuredVehicles(policies: Policy[]): Map<string, Set<string>> {
  const insuredByPerson = new Map<string, Set<string>>();
  for (const policy of policies) {
    let insuredVehicles = insuredByPerson.get(policy.person_id);
    if (!insuredVehicles) {
      insuredVehicles = new Set<string>();
      insuredByPerson.set(policy.person_id, insuredVehicles);
    }
    insuredVehicles.add(policy.vehicle_id);
  }
  return insuredByPerson;
}

function findUninsuredVehicles(
  ownedVehicles: OwnedVehicle[],
  insuredByPerson: Map<string, Set<string>>
): UpsellOpportunity[] {
  // Assume the datasource returns only requested owners; preserve response order.
  return ownedVehicles.filter((vehicle) =>
    !insuredByPerson.get(vehicle.person_id)?.has(vehicle.vehicle_id)
  );
}

// Baseline: one synchronous lookup, then exclude already insured pairs.
// Retained for comparison; it does not enforce the external API payload limit.
export function findPotentialUpsells(policies: Policy[]): UpsellOpportunity[] {
  console.debug('[upsell:baseline] start', { policies: policies.length });
  if (policies.length === 0) {
    console.debug('[upsell:baseline] complete', { opportunities: 0 });
    return [];
  }

  const insuredByPerson = indexInsuredVehicles(policies);

  console.debug('[upsell:baseline] requesting vehicles', { people: insuredByPerson.size });
  const ownedVehicles = getOwnedVehicles([...insuredByPerson.keys()]);
  const opportunities = findUninsuredVehicles(ownedVehicles, insuredByPerson);
  console.debug('[upsell:baseline] complete', {
    vehicles: ownedVehicles.length,
    opportunities: opportunities.length,
  });
  return opportunities;
}

// Improvements: minimize costly calls with full batches and overlap their latency
// with a bounded pool. Reject the whole operation if any worker fails.
export async function findPotentialUpsellsOptimized(policies: Policy[]): Promise<UpsellOpportunity[]> {
  console.debug('[upsell:pool] start', { policies: policies.length });
  if (policies.length === 0) {
    console.debug('[upsell:pool] complete', { opportunities: 0 });
    return [];
  }

  const insuredByPerson = indexInsuredVehicles(policies);

  const personIds = [...insuredByPerson.keys()];
  // Deduplicate before batching: C unique customers require ceil(C / 100) calls.
  const batchCount = Math.ceil(personIds.length / MAX_PERSON_IDS_PER_CALL);
  // Store filtered results by batch index, not completion order.
  const opportunitiesByBatch: UpsellOpportunity[][] = new Array(batchCount);
  let nextBatchIndex = 0;
  let failed = false;
  console.debug('[upsell:pool] prepared', {
    people: personIds.length,
    batches: batchCount,
    workers: Math.min(MAX_CONCURRENT_CALLS, batchCount),
  });

  const worker = async (): Promise<void> => {
    while (!failed && nextBatchIndex < batchCount) {
      // No await between checking and claiming: workers cannot claim the same batch.
      const batchIndex = nextBatchIndex++;
      const offset = batchIndex * MAX_PERSON_IDS_PER_CALL;
      const batch = personIds.slice(offset, offset + MAX_PERSON_IDS_PER_CALL);
      const startedAt = performance.now();
      console.debug('[upsell:pool] batch started', { batchIndex, people: batch.length });

      try {
        const ownedVehicles = await getOwnedVehiclesAsync(batch);
        opportunitiesByBatch[batchIndex] = findUninsuredVehicles(ownedVehicles, insuredByPerson);
        console.debug('[upsell:pool] batch completed', {
          batchIndex,
          vehicles: ownedVehicles.length,
          opportunities: opportunitiesByBatch[batchIndex].length,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        // In-flight requests continue; workers must not start new batches.
        failed = true;
        console.debug('[upsell:pool] batch failed; stopping new batches', { batchIndex });
        throw error;
      }
      // Reuse the free slot immediately without waiting for the other workers.
    }
  };

  // One outstanding request per worker. Promise.all propagates the first worker
  // rejection and handles later ones too; it does not cancel in-flight requests.
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_CALLS, batchCount) }, () => worker())
  );

  // Reassemble in request-batch order, preserving datasource order within each batch.
  const opportunities = opportunitiesByBatch.flat();
  console.debug('[upsell:pool] complete', { opportunities: opportunities.length });
  return opportunities;
}
