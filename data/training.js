// Shared options for setup, AI matching, and saved-plan validation.
export const STYLE_OPTIONS = {
  full: { label: "Full body", keys: ["full"] },
  ul: { label: "Upper / Lower", keys: ["upper", "lower"] },
  ppl: { label: "Push / Pull / Legs", keys: ["push", "pull", "legs"] },
  upper: { label: "Upper body only", keys: ["upper"], categories: ["push", "pull"] },
  legs: { label: "Legs only", keys: ["legs"], categories: ["legs"] },
  push: { label: "Push only · chest, shoulders, triceps", keys: ["push"], categories: ["push"] },
  pull: { label: "Pull only · back, biceps", keys: ["pull"], categories: ["pull"] },
  core: { label: "Core only", keys: ["core"], categories: ["core"] },
};

export const TRAINING_TYPES = {
  mixed: { label: "Mixed", description: "Any exercise that fits your selected equipment." },
  weights: { label: "Weights only", description: "Free weights, cables, or weight machines. No bodyweight-only exercises." },
  calisthenics: { label: "Calisthenics only", description: "Bodyweight exercises, plus a pull-up bar or bench if selected. No weights or bands." },
  bands: { label: "Bands + bodyweight", description: "Resistance-band and bodyweight exercises. No weights or machines." },
};

export function fitsTrainingType(exercise, trainingType = "mixed") {
  const equipment = exercise.equip || [];
  if (trainingType === "weights") return equipment.some(id =>
    ["dumbbell", "kettlebell", "barbell", "ezbar", "machine", "cable", "leg_developer"].includes(id));
  if (trainingType === "calisthenics") return equipment.every(id => ["bodyweight", "pullup", "bench"].includes(id));
  if (trainingType === "bands") return equipment.every(id => ["bodyweight", "band", "band_anchor", "pullup", "bench"].includes(id));
  return true;
}
