import { findPotentialUpsells } from './solution';
import { getOwnedVehicles } from './vehicles';

jest.mock('./vehicles', () => ({
  getOwnedVehicles: jest.fn(),
}));

const serviceMock = jest.mocked(getOwnedVehicles);

beforeEach(() => {
  serviceMock.mockReset();
  serviceMock.mockReturnValue([]);
});

describe('findPotentialUpsells', () => {
  it('returns no opportunities without calling the service when policies are empty', () => {
    expect(findPotentialUpsells([])).toEqual([]);
    expect(serviceMock).not.toHaveBeenCalled();
  });

  it('returns no opportunities when the service returns no owned vehicles', () => {
    expect(findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
    ])).toEqual([]);
    expect(serviceMock).toHaveBeenCalledWith(['A']);
  });

  it('excludes a vehicle that is already insured', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
    ]);

    const result = findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
    ]);

    expect(result).toEqual([]);
    expect(serviceMock).toHaveBeenCalledWith(['A']);
  });

  it('returns additional owned vehicles in service order', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);

    const result = findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
    ]);

    expect(result).toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
  });

  it('excludes all insured vehicles and requests each customer only once', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '4' },
      { person_id: 'B', vehicle_id: '5' },
    ]);

    const result = findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '4' },
    ]);

    expect(result).toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '5' },
    ]);
    expect(serviceMock).toHaveBeenCalledTimes(1);
    expect(serviceMock).toHaveBeenCalledWith(['A', 'B']);
  });

  it('matches insurance by both person and vehicle, not vehicle alone', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ]);

    const result = findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ]);

    expect(result).toEqual([
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
    ]);
  });

  it('returns no opportunities when every owned vehicle is insured across multiple customers', () => {
    serviceMock.mockReturnValue([
      { person_id: 'B', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '1' },
    ]);

    const result = findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
    ]);

    expect(result).toEqual([]);
  });

  it('does not reuse insured vehicles from a previous invocation', () => {
    serviceMock.mockReturnValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);

    expect(findPotentialUpsells([
      { person_id: 'A', vehicle_id: '1' },
    ])).toEqual([
      { person_id: 'A', vehicle_id: '2' },
    ]);

    expect(findPotentialUpsells([
      { person_id: 'A', vehicle_id: '2' },
    ])).toEqual([
      { person_id: 'A', vehicle_id: '1' },
    ]);
    expect(serviceMock).toHaveBeenCalledTimes(2);
  });

  it('does not modify the policies or the service response', () => {
    const policies = [{ person_id: 'A', vehicle_id: '1' }];
    const ownedVehicles = [
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ];
    policies.forEach(Object.freeze);
    ownedVehicles.forEach(Object.freeze);
    Object.freeze(policies);
    Object.freeze(ownedVehicles);
    serviceMock.mockReturnValue(ownedVehicles);

    expect(findPotentialUpsells(policies)).toEqual([
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(policies).toEqual([{ person_id: 'A', vehicle_id: '1' }]);
    expect(ownedVehicles).toEqual([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
  });

  it('propagates the exact service error without replacing it', () => {
    expect.assertions(2);
    const error = new Error('Service unavailable');
    serviceMock.mockImplementation(() => { throw error; });

    try {
      findPotentialUpsells([
        { person_id: 'A', vehicle_id: '1' },
      ]);
    } catch (caught) {
      expect(caught).toBe(error);
    }

    expect(serviceMock).toHaveBeenCalledTimes(1);
  });
});
