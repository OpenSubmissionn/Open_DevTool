import type { ParsedInstruction } from "../types";

export function decodeAnchorInstruction(
	programId: string,
	ix: ParsedInstruction,
	idl: unknown
): unknown {
	void programId;
	void ix;
	void idl;

	// Scaffold only: real Anchor IDL decoding is implemented in a later task.
	return null;
}
