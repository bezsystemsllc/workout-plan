// Daily welcome + motivation. Deterministic per calendar day (stable all day,
// changes the next), so it reads like a fresh note each morning.

export const MOTIVATION = [
  "Small reps add up. Show up today.",
  "Discipline is choosing what you want most over what you want now.",
  "You don't have to be extreme — just consistent.",
  "The work you put in today is the body you wear tomorrow.",
  "Progress, not perfection.",
  "One workout at a time.",
  "Strong is built, not born.",
  "Your only competition is who you were yesterday.",
  "Consistency beats intensity.",
  "Done is better than perfect.",
  "Fuel the work, trust the process.",
  "Every rep is a vote for who you're becoming.",
  "Hard days build strong people.",
  "Show up — especially when you don't feel like it.",
  "Eat for the body you want, train for the life you want.",
  "Comfort is the enemy of progress.",
  "Little by little, a little becomes a lot.",
  "You're closer than you think.",
  "Win the morning, win the day.",
  "Rest is part of the work, too.",
  "Make today count.",
  "Sweat now, shine later.",
  "Train like it matters — because it does.",
  "Stay patient. Stay hungry.",
];

// Hash the local Y-M-D → stable, well-mixed index for the day. Uses Math.imul
// (true 32-bit multiply — plain * loses precision past 2^53) plus an avalanche
// finalizer so reducing mod a small n still spreads across all options.
function dayIndex(n, date) {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) % n;
}

export function dailyMotivation(date = new Date()) {
  return MOTIVATION[dayIndex(MOTIVATION.length, date)];
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Winding down";
}
