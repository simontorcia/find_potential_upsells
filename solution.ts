import { getOwnedVehicles, getOwnedVehiclesAsync } from './vehicles';

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
  return ownedVehicles.filter((vehicle) =>
    !insuredByPerson.get(vehicle.person_id)?.has(vehicle.vehicle_id)
  );
}

// This is the function you have to implement.
// It should return a list of up-selling targets, where each target is
// another vehicle owned by a customer.
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

// Improvements: at most 100 IDs per call, with bounded asynchronous concurrency.
export async function findPotentialUpsellsOptimized(policies: Policy[]): Promise<UpsellOpportunity[]> {
  console.debug('[upsell:pool] start', { policies: policies.length });
  if (policies.length === 0) {
    console.debug('[upsell:pool] complete', { opportunities: 0 });
    return [];
  }

  const insuredByPerson = indexInsuredVehicles(policies);

  const personIds = [...insuredByPerson.keys()];
  const batchCount = Math.ceil(personIds.length / MAX_PERSON_IDS_PER_CALL);
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
      // Claim the batch before awaiting so workers cannot claim it twice.
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
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_CALLS, batchCount) }, () => worker())
  );

  const opportunities = opportunitiesByBatch.flat();
  console.debug('[upsell:pool] complete', { opportunities: opportunities.length });
  return opportunities;
}
