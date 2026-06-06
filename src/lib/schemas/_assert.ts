// Compile-time structural-equality assertion used by the shared Zod schemas
// to guarantee they never drift from the hand-written output interfaces in
// src/lib/prompts/*. If either the schema or the interface changes shape,
// `AssertEqual` resolves to `never` and the exported const fails to typecheck
// under `tsc --noEmit`.

export type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;
