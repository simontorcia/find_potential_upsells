import { findPotentialUpsellsOptimized, type OwnedVehicle } from './solution';
import { getOwnedVehiclesAsync } from './vehicles';

jest.mock('./vehicles', () => ({ getOwnedVehiclesAsync: jest.fn() }));

const serviceMock = jest.mocked(getOwnedVehiclesAsync);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const makePolicies = (count: number) => Array.from({ length: count }, (_, index) => ({
  person_id: `person-${index}`,
  vehicle_id: 'insured',
}));

beforeEach(() => {
  serviceMock.mockReset();
  serviceMock.mockResolvedValue([]);
});

afterEach(() => { jest.useRealTimers(); });

describe('findPotentialUpsellsOptimized — asynchronous improvements', () => {
  it('returns no opportunities without calling the service when policies are empty', async () => {
    await expect(findPotentialUpsellsOptimized([])).resolves.toEqual([]);
    expect(serviceMock).not.toHaveBeenCalled();
  });

  it('returns no opportunities when the service returns no owned vehicles', async () => {
    await expect(findPotentialUpsellsOptimized([{ person_id: 'A', vehicle_id: '1' }])).resolves.toEqual([]);
    expect(serviceMock).toHaveBeenCalledWith(['A']);
  });

  it('returns additional owned vehicles in service order', async () => {
    serviceMock.mockResolvedValue([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
    await expect(findPotentialUpsellsOptimized([{ person_id: 'A', vehicle_id: '1' }])).resolves.toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
  });

  it('excludes all insured vehicles and requests each customer only once', async () => {
    serviceMock.mockResolvedValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '4' },
      { person_id: 'B', vehicle_id: '5' },
    ]);
    await expect(findPotentialUpsellsOptimized([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '4' },
    ])).resolves.toEqual([
      { person_id: 'A', vehicle_id: '3' },
      { person_id: 'B', vehicle_id: '5' },
    ]);
    expect(serviceMock).toHaveBeenCalledTimes(1);
    expect(serviceMock).toHaveBeenCalledWith(['A', 'B']);
  });

  it('matches insurance by both person and vehicle, not vehicle alone', async () => {
    serviceMock.mockResolvedValue([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ]);
    await expect(findPotentialUpsellsOptimized([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '2' },
    ])).resolves.toEqual([
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'B', vehicle_id: '1' },
    ]);
  });

  it('returns no opportunities when every owned vehicle is insured across multiple customers', async () => {
    serviceMock.mockResolvedValue([
      { person_id: 'B', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
      { person_id: 'A', vehicle_id: '1' },
    ]);
    await expect(findPotentialUpsellsOptimized([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'B', vehicle_id: '3' },
      { person_id: 'A', vehicle_id: '2' },
    ])).resolves.toEqual([]);
  });

  it('does not modify the policies or the service response', async () => {
    const policies = [{ person_id: 'A', vehicle_id: '1' }];
    const ownedVehicles = [
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ];
    policies.forEach(Object.freeze);
    ownedVehicles.forEach(Object.freeze);
    Object.freeze(policies);
    Object.freeze(ownedVehicles);
    serviceMock.mockResolvedValue(ownedVehicles);
    await expect(findPotentialUpsellsOptimized(policies)).resolves.toEqual([
      { person_id: 'A', vehicle_id: '2' },
    ]);
    expect(policies).toEqual([{ person_id: 'A', vehicle_id: '1' }]);
    expect(ownedVehicles).toEqual([
      { person_id: 'A', vehicle_id: '1' },
      { person_id: 'A', vehicle_id: '2' },
    ]);
  });

  it('rejects with the exact service error', async () => {
    const error = new Error('Service unavailable');
    serviceMock.mockRejectedValue(error);
    await expect(findPotentialUpsellsOptimized(makePolicies(1))).rejects.toBe(error);
    expect(serviceMock).toHaveBeenCalledTimes(1);
  });

  describe('external API request limit', () => {
    it.each([100, 101, 200, 201])(
      'uses the minimum number of calls for %i unique customers, with at most 100 IDs per call',
      async (count) => {
        const policies = makePolicies(count);
        serviceMock.mockImplementation(async (ids) => ids.flatMap((person_id) => [
          { person_id, vehicle_id: 'insured' },
          { person_id, vehicle_id: 'additional' },
        ]));
        const result = await findPotentialUpsellsOptimized(policies);
        expect(serviceMock).toHaveBeenCalledTimes(Math.ceil(count / 100));
        for (const [ids] of serviceMock.mock.calls) {
          expect(ids.length).toBeGreaterThan(0);
          expect(ids.length).toBeLessThanOrEqual(100);
        }
        expect(serviceMock.mock.calls.flatMap(([ids]) => ids))
          .toEqual(policies.map((policy) => policy.person_id));
        expect(result).toEqual(policies.map((policy) => ({
          person_id: policy.person_id, vehicle_id: 'additional',
        })));
      }
    );

    it('deduplicates customers before batching', async () => {
      const policies = Array.from({ length: 150 }, (_, index) => ({
        person_id: 'A', vehicle_id: `vehicle-${index}`,
      }));
      serviceMock.mockResolvedValue([
        { person_id: 'A', vehicle_id: 'vehicle-149' },
        { person_id: 'A', vehicle_id: 'additional' },
      ]);
      await expect(findPotentialUpsellsOptimized(policies)).resolves.toEqual([
        { person_id: 'A', vehicle_id: 'additional' },
      ]);
      expect(serviceMock).toHaveBeenCalledTimes(1);
      expect(serviceMock).toHaveBeenCalledWith(['A']);
    });
  });

  describe('bounded concurrency', () => {
    it('isolates insurance data and failures between overlapping invocations', async () => {
      const failingRequest = deferred<OwnedVehicle[]>();
      const firstRemainingRequests = deferred<OwnedVehicle[]>();
      const successfulRequests = deferred<OwnedVehicle[]>();
      const error = new Error('First invocation failed');
      const firstPolicies = makePolicies(401);
      // Same people, different policies: insurance data must remain isolated.
      const secondPolicies = firstPolicies.map((policy) => ({
        ...policy,
        vehicle_id: 'other-insured',
      }));

      serviceMock
        .mockReturnValueOnce(failingRequest.promise)
        .mockReturnValueOnce(firstRemainingRequests.promise)
        .mockReturnValueOnce(firstRemainingRequests.promise)
        .mockImplementation((ids) => successfulRequests.promise.then(() =>
          ids.flatMap((person_id) => [
            { person_id, vehicle_id: 'insured' },
            { person_id, vehicle_id: 'other-insured' },
          ])
        ));

      const first = findPotentialUpsellsOptimized(firstPolicies);
      const firstRejection = expect(first).rejects.toBe(error);
      const second = findPotentialUpsellsOptimized(secondPolicies);
      expect(serviceMock).toHaveBeenCalledTimes(6);

      failingRequest.reject(error);
      await firstRejection;
      firstRemainingRequests.resolve([]);
      await firstRemainingRequests.promise;
      expect(serviceMock).toHaveBeenCalledTimes(6);

      successfulRequests.resolve([]);
      await expect(second).resolves.toEqual(secondPolicies.map((policy) => ({
        person_id: policy.person_id,
        vehicle_id: 'insured',
      })));
      expect(serviceMock).toHaveBeenCalledTimes(8);
      expect(serviceMock.mock.calls.slice(3).flatMap(([ids]) => ids))
        .toEqual(secondPolicies.map((policy) => policy.person_id));
    });

    it('runs at most three calls and refills a free slot without waiting for the slowest batch', async () => {
      jest.useFakeTimers();
      let active = 0;
      let maximum = 0;
      const completed: string[] = [];
      serviceMock.mockImplementation(async (ids) => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await new Promise<void>((resolve) => setTimeout(resolve, ids[0] === 'person-0' ? 100 : 10));
          completed.push(ids[0]!);
          return ids.map((person_id) => ({ person_id, vehicle_id: 'additional' }));
        } finally {
          active--;
        }
      });
      const policies = makePolicies(401);
      const pending = findPotentialUpsellsOptimized(policies);
      expect(serviceMock).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(10);
      expect(completed).not.toContain('person-0');
      expect(serviceMock).toHaveBeenCalledTimes(5);
      await jest.runAllTimersAsync();
      const result = await pending;
      expect(maximum).toBe(3);
      expect(active).toBe(0);
      expect(result).toEqual(policies.map((policy) => ({
        person_id: policy.person_id, vehicle_id: 'additional',
      })));
    });

    it('stops scheduling after a later error, even when an in-flight request subsequently succeeds or fails', async () => {
      const second = deferred<OwnedVehicle[]>();
      const third = deferred<OwnedVehicle[]>();
      const error = new Error('Fourth batch failed');
      serviceMock
        .mockResolvedValueOnce([{ person_id: 'person-0', vehicle_id: 'additional' }])
        .mockReturnValueOnce(second.promise)
        .mockReturnValueOnce(third.promise)
        .mockRejectedValueOnce(error);

      await expect(findPotentialUpsellsOptimized(makePolicies(501))).rejects.toBe(error);
      expect(serviceMock).toHaveBeenCalledTimes(4);
      second.resolve([]);
      third.reject(new Error('Another in-flight batch failed'));
      // Workers registered their handlers before these awaits.
      // This checks scheduling after multiple failures, not unhandled-rejection events.
      await second.promise;
      await expect(third.promise).rejects.toThrow('Another in-flight batch failed');
      await Promise.resolve();
      expect(serviceMock).toHaveBeenCalledTimes(4);
    });
  });
});
