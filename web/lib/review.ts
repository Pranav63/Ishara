// Dubai stays at UTC+4; browser and server host time zones must not change an appointment.
export const dubaiInputValue = (epoch: number) => new Date(epoch * 1000 + 4 * 3600000).toISOString().slice(0, 16);
export function dubaiEpoch(value: string): number {
  const epoch = Date.parse(value + ":00+04:00") / 1000;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(epoch) || dubaiInputValue(epoch) !== value) throw new Error("Choose a valid Dubai date and time. / اختر تاريخاً ووقتاً صالحين بتوقيت دبي.");
  return epoch;
}
