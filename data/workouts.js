export const SPLITS = {
  mon: { type: "lift", day: "push", label: "Push Day" },
  tue: { type: "soccer", label: "Soccer (1 hr)" },
  wed: { type: "lift", day: "pull", label: "Pull Day" },
  thu: { type: "soccer", label: "Soccer (1 hr)" },
  fri: { type: "lift", day: "legs", label: "Leg Day" },
  sat: { type: "soccer", label: "Soccer + optional 15-min HIIT" },
  sun: { type: "rest", label: "Rest (or light walk)" },
};

export const WORKOUTS = {
  push: [
    { name: "Barbell bench press",       sets: 4, reps: "6–8",   rest: 120 },
    { name: "Dumbbell overhead press",   sets: 3, reps: "8–10",  rest: 90 },
    { name: "Incline dumbbell press",    sets: 3, reps: "10",    rest: 90 },
    { name: "Dumbbell lateral raise",    sets: 3, reps: "12",    rest: 60 },
    { name: "Tricep pushdown (band)",    sets: 3, reps: "12",    rest: 60 },
    { name: "Hanging leg raise",         sets: 3, reps: "10–12", rest: 60 },
    { name: "Weighted plank (seconds)",  sets: 3, reps: "30–45s",rest: 60 },
  ],
  pull: [
    { name: "Barbell row",               sets: 4, reps: "6–8",   rest: 120 },
    { name: "Pull-up (band-assist ok)",  sets: 3, reps: "AMRAP", rest: 120 },
    { name: "Single-arm DB row",         sets: 3, reps: "10",    rest: 90 },
    { name: "Face pull (band)",          sets: 3, reps: "15",    rest: 60 },
    { name: "Dumbbell bicep curl",       sets: 3, reps: "10",    rest: 60 },
    { name: "Cable/band crunch",         sets: 3, reps: "12–15", rest: 60 },
    { name: "Russian twist (w/ plate)",  sets: 3, reps: "20",    rest: 60 },
  ],
  legs: [
    { name: "Barbell back squat",        sets: 4, reps: "6–8",   rest: 150 },
    { name: "Romanian deadlift",         sets: 3, reps: "8",     rest: 120 },
    { name: "Bulgarian split squat (DB)",sets: 3, reps: "10/leg",rest: 90 },
    { name: "Standing calf raise",       sets: 4, reps: "15",    rest: 60 },
    { name: "Hanging leg raise",         sets: 3, reps: "10–12", rest: 60 },
    { name: "Plank (seconds)",           sets: 3, reps: "45s",   rest: 60 },
  ],
};
