import { findPotentialUpsells } from './solution';
import { getOwnedVehicles } from './vehicles';

jest.mock('./vehicles', () => ({ getOwnedVehicles: jest.fn() }));

const serviceMock = jest.mocked(getOwnedVehicles);

beforeEach(() => {
  serviceMock.mockReset();
  serviceMock.mockReturnValue([]);
});

describe('findPotentialUpsells — synchronous baseline', () => {
  it('returns no opportunities without calling the service for empty policies', () => {
    expect(findPotentialUpsells([])).toEqual([]);
    expect(serviceMock).not.toHaveBeenCalled();
  });

  it('returns no opportunities when no owned vehicles are found', () => {
    expect(findPotentialUpsells([{ person_id: 'A', vehicle_id: '1' }])).toEqual([]);
    expect(serviceMock).toHaveBeenCalledWith(['A']);
  });

  it('excludes an already insured vehicle', () => {
    serviceMock.mockReturnValue([{ person_id: 'A', vehicle_id: '1' }]);
    expect(findPotentialUpsells([{ person_id: 'A', vehicle_id: '1' }])).toEqual([]);
  });

  it('returns additional vehicles in datasource order', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(findPotentialUpsells([{ person_id: 'A', vehicle_id: '1' }])).toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
  });

  it('indexes every policy and requests each customer only once', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '4' },
      { person_id: 'B', vehicle_id: '5' },
    ]);
    expect(findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '4' },
    ])).toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '5' },
    ]);
    expect(serviceMock).toHaveBeenCalledTimes(1);
    expect(serviceMock).toHaveBeenCalledWith(['A', 'B']);
  });

  it('matches insurance by the person–vehicle pair', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ]);
    expect(findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ])).toEqual([
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
    ]);
  });

  it('returns no opportunities when all vehicles of multiple customers are insured', () => {
    const policies = [
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ];
    serviceMock.mockReturnValue([...policies].reverse());
    expect(findPotentialUpsells(policies)).toEqual([]);
  });

  it('does not retain insurance data between invocations', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(findPotentialUpsells([{ person_id: 'A', vehicle_id: '1' }])).toEqual([
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(findPotentialUpsells([{ person_id: 'A', vehicle_id: '2' }])).toEqual([
      { person_id: 'A', vehicle_id: '1' },
    ]);
  });

  it('does not modify policies or the datasource response', () => {
    const policies = [{ person_id: 'A', vehicle_id: '1' }];
    const vehicles = [
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ];
    policies.forEach(Object.freeze);
    vehicles.forEach(Object.freeze);
    Object.freeze(policies);
    Object.freeze(vehicles);
    serviceMock.mockReturnValue(vehicles);
    expect(findPotentialUpsells(policies)).toEqual([
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(policies).toEqual([{ person_id: 'A', vehicle_id: '1' }]);
    expect(vehicles).toHaveLength(2);
  });

  it('throws the original service error', () => {
    expect.assertions(1);
    const error = new Error('Service unavailable');
    serviceMock.mockImplementation(() => { throw error; });
    try {
      findPotentialUpsells([{ person_id: 'A', vehicle_id: '1' }]);
    } catch (caught) {
      expect(caught).toBe(error);
    }
  });
});
