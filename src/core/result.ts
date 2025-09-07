export type Ok<T> = { _tag: "Ok"; value: T };
export type Err<E = unknown> = { _tag: "Err"; error: E };
export type Result<T, E = unknown> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ _tag: "Ok", value });
export const err = <E>(error: E): Err<E> => ({ _tag: "Err", error });

export const unwrap = <A>(r: Result<A>): A => { 
  if (r._tag === "Err") throw r.error; 
  return r.value; 
};

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r._tag === "Ok";
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => r._tag === "Err";