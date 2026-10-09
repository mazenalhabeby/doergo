/*
  The scores behind a technician suggestion (TechnicianSuggestionService). Pure.
*/

/**
 * Calculate distance score (0-100)
 * Closer = higher score
 */
export function calculateDistanceScore(
  task: { locationLat: number | null; locationLng: number | null },
  techLocation: { lat: number; lng: number } | null,
): number {
  if (!task.locationLat || !task.locationLng || !techLocation) {
    return 50; // Neutral score if no location data
  }

  const distanceKm = calculateDistance(
    task.locationLat,
    task.locationLng,
    techLocation.lat,
    techLocation.lng,
  );

  if (distanceKm === null) return 50;

  // Score based on distance thresholds:
  // 0-5km: 100, 5-10km: 80, 10-20km: 60, 20-50km: 40, 50+km: 20
  if (distanceKm <= 5) return 100;
  if (distanceKm <= 10) return 80;
  if (distanceKm <= 20) return 60;
  if (distanceKm <= 50) return 40;
  return 20;
}

/**
 * Calculate availability score (0-100)
 * More remaining capacity = higher score
 */
export function calculateAvailabilityScore(currentTasks: number, maxTasks: number): number {
  if (currentTasks >= maxTasks) return 0; // At capacity
  const remainingCapacity = maxTasks - currentTasks;
  const capacityRatio = remainingCapacity / maxTasks;
  return Math.round(capacityRatio * 100);
}

/**
 * Calculate specialization score (0-100)
 * Matching specialty = higher score
 */
export function calculateSpecializationScore(taskTitle: string, techSpecialty: string | null): number {
  if (!techSpecialty) return 50; // Neutral if no specialty

  const titleLower = taskTitle.toLowerCase();
  const specialtyLower = techSpecialty.toLowerCase();

  // Direct match in title
  if (titleLower.includes(specialtyLower)) return 100;

  // Related keywords
  const specialtyKeywords: Record<string, string[]> = {
    electrical: ['electric', 'wiring', 'outlet', 'switch', 'panel', 'circuit', 'light', 'power'],
    plumbing: ['plumb', 'pipe', 'drain', 'leak', 'faucet', 'toilet', 'water', 'sewer'],
    mechanical: ['mechanic', 'machine', 'motor', 'engine', 'repair', 'hvac', 'ac', 'heating'],
    general: [], // General matches anything
  };

  const keywords = specialtyKeywords[specialtyLower] || [];

  // Check if any keyword matches
  for (const keyword of keywords) {
    if (titleLower.includes(keyword)) return 80;
  }

  // General specialty gets neutral score
  if (specialtyLower === 'general') return 50;

  return 30; // No match
}

/**
 * Calculate workload score (0-100)
 * Fewer active tasks = higher score
 */
export function calculateWorkloadScore(activeTaskCount: number): number {
  // 0 tasks: 100, 1: 80, 2: 60, 3: 40, 4: 20, 5+: 0
  if (activeTaskCount === 0) return 100;
  if (activeTaskCount === 1) return 80;
  if (activeTaskCount === 2) return 60;
  if (activeTaskCount === 3) return 40;
  if (activeTaskCount === 4) return 20;
  return 0;
}

/**
 * Calculate rating score (0-100)
 * Higher rating = higher score
 */
export function calculateRatingScore(rating: number | null): number {
  if (rating === null) return 50; // Neutral for no rating
  // Scale 1-5 rating to 0-100
  return Math.round(((rating - 1) / 4) * 100);
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number | null {
  if (lat1 === null || lng1 === null || lat2 === null || lat2 === undefined || lng2 === null || lng2 === undefined) {
    return null;
  }

  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
