/** Maps Open-Meteo's WMO weather codes down to the handful of icon/label
 * buckets this app actually draws (see Screensaver's weather overlay) —
 * full WMO table has ~28 codes, most of which look the same to a glance at
 * a dashboard. https://open-meteo.com/en/docs lists the raw codes. */
export type WeatherIconKey = "clear" | "cloud-sun" | "cloud" | "fog" | "rain" | "snow" | "storm";

export function describeWeatherCode(code: number, isDay: boolean): { label: string; icon: WeatherIconKey } {
  if (code === 0) return { label: isDay ? "Sunny" : "Clear", icon: "clear" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", icon: "cloud-sun" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Foggy", icon: "fog" };
  if (code >= 51 && code <= 67) return { label: "Rain", icon: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "snow" };
  if (code >= 80 && code <= 82) return { label: "Showers", icon: "rain" };
  if (code >= 85 && code <= 86) return { label: "Snow showers", icon: "snow" };
  if (code >= 95) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Weather", icon: "cloud" };
}
