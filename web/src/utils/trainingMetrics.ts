/**
 * Parses a tempo string (e.g. "4-1-2-1") and calculates the Expected Time Under Tension (TUT)
 * in seconds.
 * 
 * Expected TUT = (Reps x Tempo Sum) + Terminal Iso-Hold
 */
export function calculateTUT(reps: number, tempo: string, isoholdSeconds: number): number {
  if (!tempo || reps <= 0) return 0;
  
  // Split tempo string, e.g. "4-1-2-1" -> [4, 1, 2, 1]
  const tempoParts = tempo.split(/[-:]/).map(p => parseInt(p, 10));
  const isValid = tempoParts.length > 0 && tempoParts.every(p => !isNaN(p));
  
  if (!isValid) return 0;
  
  const tempoSum = tempoParts.reduce((acc, curr) => acc + curr, 0);
  return (reps * tempoSum) + (isoholdSeconds || 0);
}

/**
 * Calculates the actual rest time between sets in seconds.
 * 
 * Actual Rest = (Time difference between set completions) - TUT of the current set
 */
export function calculateActualRest(
  prevSetTimestampStr: string | null | undefined, 
  currentSetTimestampStr: string | null | undefined,
  currentSetTUT: number
): number {
  if (!prevSetTimestampStr || !currentSetTimestampStr) return 0;
  
  const prevTime = new Date(prevSetTimestampStr).getTime();
  const currTime = new Date(currentSetTimestampStr).getTime();
  
  if (isNaN(prevTime) || isNaN(currTime) || currTime <= prevTime) return 0;
  
  const timeDiffSeconds = Math.floor((currTime - prevTime) / 1000);
  
  // Rest is total time elapsed minus the time actively lifting (TUT)
  const actualRest = timeDiffSeconds - currentSetTUT;
  
  return actualRest > 0 ? actualRest : 0;
}
