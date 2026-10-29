import { getOwnedVehicles } from './vehicles';

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

// This is the function you have to implement.
// It should return a list of up-selling targets, where each target is
// another vehicle owned by a customer.
export function findPotentialUpsells(policies: Policy[]): UpsellOpportunity[] {
  if (policies.length === 0) return [];

  const insuredByPerson = new Map<string, Set<string>>();

  for (const policy of policies) {
    let insuredVehicles = insuredByPerson.get(policy.person_id);

    if (!insuredVehicles) {
      insuredVehicles = new Set<string>();
      insuredByPerson.set(policy.person_id, insuredVehicles);
    }

    insuredVehicles.add(policy.vehicle_id);
  }

  const personIds = [...insuredByPerson.keys()];
  const ownedVehicles = getOwnedVehicles(personIds);

  return ownedVehicles.filter((vehicle) =>
    !insuredByPerson.get(vehicle.person_id)?.has(vehicle.vehicle_id)
  );
}
