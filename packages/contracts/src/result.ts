/**
 * Result<T, E> Pattern
 *
 * Type-safe way to handle success and errors without throwing exceptions.
 * Better than try-catch because it makes errors explicit in the type system.
 */

export type Success<T> = {
  readonly success: true;
  readonly data: T;
};

export type Failure<E> = {
  readonly success: false;
  readonly error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

export const success = <T>(data: T): Success<T> =>
  ({
    success: true,
    data,
  }) as const;

export const failure = <E>(error: E): Failure<E> =>
  ({
    success: false,
    error,
  }) as const;

export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => result.success;

export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => !result.success;
