/**
 * Fail-closed guard for school-bound service constructors: a missing school
 * would query `{ schoolId: null }` (the driver turns `undefined` into `null`),
 * which matches exactly the records no school owns yet.
 * @param schoolId - The school the service is being bound to.
 * @param serviceName - The service with its article, e.g. "a course service".
 */
export function assertSchoolId(schoolId: string, serviceName: string): void {
  if (!schoolId) {
    throw new Error(`A school is required to build ${serviceName}`);
  }
}
